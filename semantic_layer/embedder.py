"""Low-latency embedding service with warm-start and batching."""

from __future__ import annotations

import os

# Avoid loky/joblib multiprocessing crashes on Python 3.14+ during encode().
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("OMP_NUM_THREADS", "1")

import logging
import threading
import time
from dataclasses import dataclass
from typing import Sequence

import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

EMBED_DIM = 384
DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


@dataclass(frozen=True, slots=True)
class EmbeddingResult:
    vector: NDArray[np.float32]
    latency_ms: float
    norm: float


class EmbedderService:
    """Thread-safe wrapper around SentenceTransformer."""

    def __init__(
        self,
        model_name: str = DEFAULT_MODEL,
        device: str = "cpu",
        normalize: bool = True,
    ) -> None:
        self._model_name = model_name
        self._device = device
        self._normalize = normalize
        self._lock = threading.Lock()
        self._model = None
        self._norm_stats = _RunningStats()

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        with self._lock:
            if self._model is not None:
                return
            from sentence_transformers import SentenceTransformer

            logger.info("Loading embedder %s on %s", self._model_name, self._device)
            t0 = time.perf_counter()
            self._model = SentenceTransformer(self._model_name, device=self._device)
            logger.info("Embedder loaded in %.1f ms", (time.perf_counter() - t0) * 1000)

    def warm_start(self) -> None:
        """Eliminate cold-start latency on first real request."""
        self.embed("warmup query for semantic layer")

    def embed(self, text: str) -> EmbeddingResult:
        self._ensure_loaded()
        assert self._model is not None

        t0 = time.perf_counter()
        raw: NDArray[np.float32] = self._model.encode(
            text,
            convert_to_numpy=True,
            normalize_embeddings=False,
            show_progress_bar=False,
        ).astype(np.float32)

        norm = float(np.linalg.norm(raw))
        vec = raw / norm if self._normalize and norm > 0 else raw
        latency_ms = (time.perf_counter() - t0) * 1000
        self._norm_stats.update(norm)

        return EmbeddingResult(vector=vec, latency_ms=latency_ms, norm=norm)

    def embed_batch(self, texts: Sequence[str]) -> list[EmbeddingResult]:
        self._ensure_loaded()
        assert self._model is not None

        if not texts:
            return []

        t0 = time.perf_counter()
        raw_batch: NDArray[np.float32] = self._model.encode(
            list(texts),
            convert_to_numpy=True,
            normalize_embeddings=False,
            show_progress_bar=False,
            batch_size=min(len(texts), 32),
        ).astype(np.float32)

        total_ms = (time.perf_counter() - t0) * 1000
        per_item_ms = total_ms / max(len(texts), 1)
        results: list[EmbeddingResult] = []

        for raw in raw_batch:
            norm = float(np.linalg.norm(raw))
            vec = raw / norm if self._normalize and norm > 0 else raw
            self._norm_stats.update(norm)
            results.append(EmbeddingResult(vector=vec, latency_ms=per_item_ms, norm=norm))

        return results

    def ood_score(self, norm: float) -> float:
        """Z-score distance from observed embedding norms (OOD proxy)."""
        if self._norm_stats.count < 10:
            return 0.0
        return abs(norm - self._norm_stats.mean) / max(self._norm_stats.std, 1e-6)


class _RunningStats:
    """Welford online mean/variance."""

    def __init__(self) -> None:
        self.count = 0
        self.mean = 0.0
        self.m2 = 0.0

    @property
    def std(self) -> float:
        if self.count < 2:
            return 1.0
        return (self.m2 / (self.count - 1)) ** 0.5

    def update(self, value: float) -> None:
        self.count += 1
        delta = value - self.mean
        self.mean += delta / self.count
        delta2 = value - self.mean
        self.m2 += delta * delta2
