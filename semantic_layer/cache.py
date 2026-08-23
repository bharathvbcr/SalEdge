"""FAISS-backed semantic cache with TTL, LRU, and adaptive threshold."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import faiss
import numpy as np
from numpy.typing import NDArray

from semantic_layer.embedder import EMBED_DIM
from semantic_layer.threshold import ThresholdConfig, ThresholdTuner

# Backward compatibility for imports from cache module
__all__ = [
    "CacheConfig",
    "CacheEntry",
    "CacheLookupResult",
    "SemanticCache",
    "ThresholdConfig",
    "ThresholdTuner",
    "VectorBackend",
]

logger = logging.getLogger(__name__)

VectorBackend = Literal["faiss", "chromadb"]

# Rebuild the FAISS index after this many removals so tombstoned vectors do
# not accumulate and degrade top-k search quality over time.
_REBUILD_REMOVAL_THRESHOLD = 500


@dataclass(slots=True)
class CacheConfig:
    cache_dir: Path = field(default_factory=lambda: Path("./data/semantic_cache"))
    max_entries: int = 10_000
    ttl_seconds: int = 86_400
    vector_backend: VectorBackend = "faiss"
    threshold: ThresholdConfig = field(default_factory=ThresholdConfig)


@dataclass(slots=True)
class CacheEntry:
    id: str
    query_text: str
    response_text: str
    embedding: NDArray[np.float32]
    created_at: float
    last_accessed: float
    ttl_seconds: int
    metadata: dict[str, Any] = field(default_factory=dict)
    access_count: int = 0

    def is_expired(self, now: float | None = None) -> bool:
        now = now or time.time()
        return (now - self.created_at) > self.ttl_seconds


@dataclass(slots=True)
class CacheLookupResult:
    hit: bool
    response: str | None
    similarity: float
    entry_id: str | None
    effective_threshold: float
    latency_ms: float


class SemanticCache:
    """FAISS IndexFlatIP semantic cache with LRU + TTL eviction."""

    EMBED_DIM = EMBED_DIM
    # Number of nearest neighbours to inspect per lookup. Inspecting more than the
    # top-1 lets us skip tombstoned vectors (removed entries still present in the
    # IndexFlatIP) and entries whose data context does not match the request.
    _LOOKUP_K = 10

    def __init__(
        self,
        config: CacheConfig | None = None,
        *,
        cache_dir: Path | None = None,
        max_entries: int = 10_000,
        ttl_seconds: int = 86_400,
        initial_threshold: float = 0.88,
        threshold_tuner: ThresholdTuner | None = None,
    ) -> None:
        if config is not None:
            self.config = config
        else:
            tuner_cfg = threshold_tuner.config if threshold_tuner is not None else ThresholdConfig(
                initial_threshold=initial_threshold,
            )
            self.config = CacheConfig(
                cache_dir=cache_dir or Path("./data/semantic_cache"),
                max_entries=max_entries,
                ttl_seconds=ttl_seconds,
                threshold=tuner_cfg,
            )

        self.cache_dir = self.config.cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.max_entries = self.config.max_entries
        self.ttl_seconds = self.config.ttl_seconds
        self._lock = threading.RLock()
        self._entries: OrderedDict[str, CacheEntry] = OrderedDict()
        self._id_to_faiss_idx: dict[str, int] = {}
        self._faiss_idx_to_id: dict[int, str] = {}
        self._index = faiss.IndexFlatIP(EMBED_DIM)
        self._tuner = threshold_tuner or ThresholdTuner(self.config.threshold)
        self._chroma_collection = None
        # Normalize once: accept both "chroma" and "chromadb" spellings.
        backend = str(self.config.vector_backend).strip().lower()
        if backend == "chroma":
            backend = "chromadb"
        self.config.vector_backend = backend
        if backend == "chromadb":
            self._init_chroma()
        self._removals_since_rebuild = 0
        self._load_persisted()

    def _init_chroma(self) -> None:
        try:
            import chromadb

            client = chromadb.PersistentClient(path=str(self.cache_dir / "chroma"))
            self._chroma_collection = client.get_or_create_collection(
                name="semantic_cache",
                metadata={"hnsw:space": "cosine"},
            )
            logger.info("ChromaDB backend initialized at %s", self.cache_dir / "chroma")
        except ImportError:
            logger.warning("chromadb not installed; falling back to FAISS")
            self.config.vector_backend = "faiss"

    @property
    def threshold(self) -> float:
        return self._tuner.threshold

    def lookup(
        self,
        query_embedding: NDArray[np.float32],
        ood_score: float = 0.0,
        ood_gamma: float = 0.02,
        ood_delta: float = 2.0,
        context_key: str | None = None,
    ) -> CacheLookupResult:
        """Find the closest live, in-context cached answer above threshold.

        ``context_key`` fingerprints the request's RAG context. When provided, an
        entry only counts as a hit if it was stored under the *same* context, so
        two identical questions asked over different business data (or different
        reporting periods) never share a cached — and now stale — answer.
        """
        t0 = time.perf_counter()

        with self._lock:
            self._purge_expired()

            tau_eff = self._tuner.effective_threshold(ood_score, ood_gamma, ood_delta)

            if self._index.ntotal == 0:
                self._tuner.record_query(was_hit=False)
                return self._miss(t0, 0.0, ood_score, ood_gamma, ood_delta, tau_eff)

            vec = query_embedding.reshape(1, -1).astype(np.float32)
            k = min(self._index.ntotal, self._LOOKUP_K)
            similarities, indices = self._index.search(vec, k=k)
            best_sim = float(similarities[0][0]) if similarities.size else 0.0

            for rank in range(indices.shape[1]):
                idx = int(indices[0][rank])
                sim = float(similarities[0][rank])
                if idx < 0 or sim < tau_eff:
                    break  # neighbours are sorted desc; nothing further can qualify

                entry_id = self._faiss_idx_to_id.get(idx)
                if entry_id is None or entry_id not in self._entries:
                    continue  # tombstoned vector still in the index — skip it

                entry = self._entries[entry_id]
                if entry.is_expired():
                    self._remove_entry(entry_id)
                    continue
                if (entry.metadata.get("context_key") or "") != (context_key or ""):
                    continue  # same question, different underlying data (or none) — not a valid hit

                self._entries.move_to_end(entry_id)
                entry.last_accessed = time.time()
                entry.access_count += 1
                self._tuner.record_query(was_hit=True)

                return CacheLookupResult(
                    hit=True,
                    response=entry.response_text,
                    similarity=sim,
                    entry_id=entry_id,
                    effective_threshold=tau_eff,
                    latency_ms=(time.perf_counter() - t0) * 1000,
                )

            self._tuner.record_query(was_hit=False)
            return self._miss(t0, best_sim, ood_score, ood_gamma, ood_delta, tau_eff)

    def _miss(
        self,
        t0: float,
        sim: float,
        ood_score: float,
        ood_gamma: float,
        ood_delta: float,
        tau_eff: float | None = None,
    ) -> CacheLookupResult:
        return CacheLookupResult(
            hit=False,
            response=None,
            similarity=sim,
            entry_id=None,
            effective_threshold=tau_eff or self._tuner.effective_threshold(ood_score, ood_gamma, ood_delta),
            latency_ms=(time.perf_counter() - t0) * 1000,
        )

    def store(
        self,
        query_text: str,
        response_text: str,
        embedding: NDArray[np.float32],
        metadata: dict[str, Any] | None = None,
    ) -> str:
        with self._lock:
            self._purge_expired()
            self._evict_lru_if_needed()

            entry_id = str(uuid.uuid4())
            now = time.time()
            entry = CacheEntry(
                id=entry_id,
                query_text=query_text,
                response_text=response_text,
                embedding=embedding.copy(),
                created_at=now,
                last_accessed=now,
                ttl_seconds=self.ttl_seconds,
                metadata=metadata or {},
            )

            faiss_idx = self._index.ntotal
            self._index.add(embedding.reshape(1, -1).astype(np.float32))
            self._entries[entry_id] = entry
            self._id_to_faiss_idx[entry_id] = faiss_idx
            self._faiss_idx_to_id[faiss_idx] = entry_id

            if self._chroma_collection is not None:
                try:
                    self._chroma_collection.add(
                        ids=[entry_id],
                        embeddings=[embedding.tolist()],
                        documents=[query_text],
                        metadatas=[{"response": response_text, **(metadata or {})}],
                    )
                except Exception as exc:
                    logger.debug("Chroma store skipped for %s: %s", entry_id, exc)

            self._persist_entry(entry)
            return entry_id

    def submit_feedback(
        self,
        entry_id: str | None = None,
        was_valid: bool = True,
        similarity: float = 0.0,
    ) -> None:
        """Record feedback: tune the threshold and purge a known-bad answer.

        When feedback flags a specific entry as invalid we evict it so the same
        wrong cached answer is not served again, rather than only nudging the
        global threshold.
        """
        # Lookup paths mutate tuner state while holding self._lock; do the same
        # here so concurrent lookups/feedback cannot interleave on the tuner.
        with self._lock:
            self._tuner.record_feedback(similarity, was_valid)
            if entry_id and not was_valid:
                self.invalidate(entry_id)

    def invalidate(self, entry_id: str) -> bool:
        """Remove a specific cached answer. Returns True if it existed."""
        with self._lock:
            if entry_id not in self._entries:
                return False
            self._remove_entry(entry_id)
            return True

    def _evict_lru_if_needed(self) -> None:
        while len(self._entries) >= self.max_entries:
            oldest_id, _ = next(iter(self._entries.items()))
            self._remove_entry(oldest_id)

    def _remove_entry(self, entry_id: str) -> None:
        existed = self._entries.pop(entry_id, None) is not None
        faiss_idx = self._id_to_faiss_idx.pop(entry_id, None)
        if faiss_idx is not None:
            self._faiss_idx_to_id.pop(faiss_idx, None)
        if self._chroma_collection is not None:
            try:
                self._chroma_collection.delete(ids=[entry_id])
            except Exception as exc:
                logger.debug("Chroma delete skipped for %s: %s", entry_id, exc)
        # Drop the persisted file too, so evicted/invalidated entries do not
        # resurrect on the next _load_persisted().
        try:
            (self.cache_dir / f"{entry_id}.json").unlink(missing_ok=True)
        except OSError as exc:
            logger.debug("Could not delete cache file for %s: %s", entry_id, exc)
        if existed:
            self._removals_since_rebuild += 1
        if len(self._entries) == 0 or self._removals_since_rebuild >= _REBUILD_REMOVAL_THRESHOLD:
            self._removals_since_rebuild = 0
            self._rebuild_index()

    def _rebuild_index(self) -> None:
        self._index = faiss.IndexFlatIP(EMBED_DIM)
        self._id_to_faiss_idx.clear()
        self._faiss_idx_to_id.clear()
        for i, (entry_id, entry) in enumerate(self._entries.items()):
            self._index.add(entry.embedding.reshape(1, -1))
            self._id_to_faiss_idx[entry_id] = i
            self._faiss_idx_to_id[i] = entry_id

    def _purge_expired(self) -> None:
        now = time.time()
        expired = [eid for eid, e in self._entries.items() if e.is_expired(now)]
        for eid in expired:
            self._remove_entry(eid)

    def _persist_entry(self, entry: CacheEntry) -> None:
        path = self.cache_dir / f"{entry.id}.json"
        payload = {
            "id": entry.id,
            "query_text": entry.query_text,
            "response_text": entry.response_text,
            "embedding": entry.embedding.tolist(),
            "created_at": entry.created_at,
            "last_accessed": entry.last_accessed,
            "ttl_seconds": entry.ttl_seconds,
            "metadata": entry.metadata,
            "access_count": entry.access_count,
        }
        tmp_path = path.with_suffix(".json.tmp")
        tmp_path.write_text(json.dumps(payload))
        os.replace(tmp_path, path)

    def _load_persisted(self) -> None:
        for path in self.cache_dir.glob("*.json"):
            try:
                data = json.loads(path.read_text())
                emb = np.array(data["embedding"], dtype=np.float32)
                entry = CacheEntry(
                    id=data["id"],
                    query_text=data["query_text"],
                    response_text=data["response_text"],
                    embedding=emb,
                    created_at=data["created_at"],
                    last_accessed=data["last_accessed"],
                    ttl_seconds=data["ttl_seconds"],
                    metadata=data.get("metadata", {}),
                    access_count=data.get("access_count", 0),
                )
                if not entry.is_expired():
                    self._entries[entry.id] = entry
                else:
                    self._unlink_persisted(path, reason="expired")
            except (json.JSONDecodeError, KeyError) as exc:
                logger.warning("Skipping corrupt cache file %s: %s", path, exc)
                self._unlink_persisted(path, reason="corrupt")

        self._rebuild_index()
        logger.info("Loaded %d cache entries", len(self._entries))

    def _unlink_persisted(self, path: Path, *, reason: str) -> None:
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            logger.debug("Could not delete %s cache file %s: %s", reason, path, exc)
