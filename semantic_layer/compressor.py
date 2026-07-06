"""Semantic RAG context compression via bi-encoder relevance filtering."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from numpy.typing import NDArray

from semantic_layer.embedder import EmbedderService


@dataclass(frozen=True, slots=True)
class CompressorConfig:
    relevance_threshold: float = 0.35
    max_context_tokens: int = 4096
    chars_per_token: float = 4.0
    min_chunks: int = 1


@dataclass(frozen=True, slots=True)
class DocumentChunk:
    id: str
    text: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class CompressionResult:
    selected_chunks: list[DocumentChunk]
    dropped_count: int
    estimated_tokens: int
    latency_ms: float
    relevance_scores: tuple[float, ...] = ()


class SemanticCompressor:
    """Filter and pack RAG chunks by semantic relevance to query."""

    def __init__(
        self,
        embedder: EmbedderService,
        relevance_threshold: float = 0.35,
        max_context_tokens: int = 4096,
        chars_per_token: float = 4.0,
        config: CompressorConfig | None = None,
    ) -> None:
        if config is not None:
            self.config = config
        else:
            self.config = CompressorConfig(
                relevance_threshold=relevance_threshold,
                max_context_tokens=max_context_tokens,
                chars_per_token=chars_per_token,
            )
        self.embedder = embedder

    def compress(
        self,
        query: str,
        query_embedding: NDArray[np.float32],
        chunks: list[DocumentChunk],
        *,
        precomputed_embeddings: list[NDArray[np.float32]] | None = None,
    ) -> CompressionResult:
        del query  # reserved for future cross-encoder reranking
        t0 = time.perf_counter()
        if not chunks:
            return CompressionResult([], 0, 0, (time.perf_counter() - t0) * 1000)

        if precomputed_embeddings is not None and len(precomputed_embeddings) == len(chunks):
            vectors = precomputed_embeddings
        else:
            vectors = [r.vector for r in self.embedder.embed_batch([c.text for c in chunks])]

        scored: list[tuple[float, DocumentChunk]] = []
        for chunk, vec in zip(chunks, vectors):
            relevance = float(np.dot(query_embedding, vec))
            if relevance >= self.config.relevance_threshold:
                scored.append((relevance, chunk))

        scored.sort(key=lambda x: x[0], reverse=True)

        selected: list[DocumentChunk] = []
        scores: list[float] = []
        token_budget = self.config.max_context_tokens
        used_tokens = 0

        for rel, chunk in scored:
            est_tokens = max(1, int(len(chunk.text) / self.config.chars_per_token))
            if used_tokens + est_tokens > token_budget:
                continue
            selected.append(chunk)
            scores.append(rel)
            used_tokens += est_tokens

        if len(selected) < self.config.min_chunks and scored:
            top_rel, top_chunk = scored[0]
            if top_chunk not in selected:
                selected = [top_chunk]
                scores = [top_rel]
                used_tokens = max(1, int(len(top_chunk.text) / self.config.chars_per_token))

        return CompressionResult(
            selected_chunks=selected,
            dropped_count=len(chunks) - len(selected),
            estimated_tokens=used_tokens,
            latency_ms=(time.perf_counter() - t0) * 1000,
            relevance_scores=tuple(scores),
        )

    @staticmethod
    def chunk_text(
        text: str,
        chunk_size: int = 512,
        overlap: int = 64,
        metadata: dict[str, Any] | None = None,
    ) -> list[DocumentChunk]:
        """Simple sliding-window chunking for raw documents."""
        if not text.strip():
            return []

        meta = metadata or {}
        chunks: list[DocumentChunk] = []
        start = 0
        idx = 0
        step = max(1, chunk_size - overlap)

        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunk_text = text[start:end].strip()
            if chunk_text:
                chunks.append(
                    DocumentChunk(
                        id=f"chunk-{idx}",
                        text=chunk_text,
                        metadata={**meta, "offset": start},
                    )
                )
                idx += 1
            start += step

        return chunks

    @staticmethod
    def format_context(chunks: list[DocumentChunk]) -> str:
        parts = [f"[{i + 1}] {c.text.strip()}" for i, c in enumerate(chunks)]
        return "\n\n".join(parts)
