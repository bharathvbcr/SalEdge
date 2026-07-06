"""Pipeline orchestrator: cache → route → compress → infer."""

from __future__ import annotations

import concurrent.futures
import hashlib
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np

from semantic_layer.cache import SemanticCache
from semantic_layer.compressor import DocumentChunk, SemanticCompressor
from semantic_layer.embedder import EmbedderService
from semantic_layer.metrics import SemanticMetrics
from semantic_layer.router import SemanticRouter

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class PipelineRequest:
    query: str
    rag_chunks: list[DocumentChunk] = field(default_factory=list)
    system_prompt: str = "You are a helpful assistant."
    session_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class PipelineResponse:
    text: str
    cache_hit: bool
    model_id: str
    complexity_score: float
    semantic_latency_ms: float
    total_latency_ms: float
    diagnostics: dict[str, Any]


class SemanticOrchestrator:
    def __init__(
        self,
        embedder: EmbedderService,
        cache: SemanticCache,
        router: SemanticRouter,
        compressor: SemanticCompressor,
        inference_fn: Callable[..., str],
        async_cache_write: bool = True,
        enable_ood_penalty: bool = True,
        ood_gamma: float = 0.02,
        ood_delta: float = 2.0,
        metrics: SemanticMetrics | None = None,
        latency_budget_ms: float = 15.0,
    ) -> None:
        self.embedder = embedder
        self.cache = cache
        self.router = router
        self.compressor = compressor
        self.inference_fn = inference_fn
        self.async_cache_write = async_cache_write
        self.enable_ood_penalty = enable_ood_penalty
        self.ood_gamma = ood_gamma
        self.ood_delta = ood_delta
        self.metrics = metrics or SemanticMetrics()
        self.latency_budget_ms = latency_budget_ms
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)

    def initialize(self) -> None:
        self.embedder.warm_start()
        # Prototype "high-complexity" queries steer the router's semantic score.
        # They must reflect THIS deployment's domain (battery-shop analytics), not
        # generic CS prompts, or every business question scores low and is routed
        # to the smallest model.
        proto_embs = self.embedder.embed_batch(
            [
                "Compare gross margin across battery product lines and explain the biggest change",
                "Which suppliers are overdue for payment and how should I prioritise this week's cash",
                "Forecast next month's revenue and flag collection risk from receivables aging",
                "Break down net profit into revenue, returns, COGS and operating expenses",
            ]
        )
        self.router.set_prototype_embeddings(np.stack([e.vector for e in proto_embs]))

    @staticmethod
    def _context_key(chunks: list[DocumentChunk]) -> str | None:
        """Fingerprint the RAG context so a cache hit is only valid for the same
        underlying data. Order-independent over chunk text."""
        if not chunks:
            return None
        joined = "".join(sorted(c.text for c in chunks))
        return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:16]

    def run(self, request: PipelineRequest) -> PipelineResponse:
        t_total = time.perf_counter()
        t_semantic = time.perf_counter()
        diagnostics: dict[str, Any] = {}

        emb = self.embedder.embed(request.query)
        diagnostics["embed_ms"] = emb.latency_ms
        self.metrics.observe_embed_latency(emb.latency_ms)

        ood = self.embedder.ood_score(emb.norm) if self.enable_ood_penalty else 0.0
        diagnostics["ood_score"] = ood

        context_key = self._context_key(request.rag_chunks)
        diagnostics["context_key"] = context_key or "none"

        cache_result = self.cache.lookup(
            emb.vector,
            ood_score=ood,
            ood_gamma=self.ood_gamma,
            ood_delta=self.ood_delta,
            context_key=context_key,
        )
        diagnostics["cache_ms"] = cache_result.latency_ms
        diagnostics["cache_similarity"] = cache_result.similarity
        diagnostics["effective_threshold"] = cache_result.effective_threshold
        self.metrics.observe_cache_lookup_latency(cache_result.latency_ms)
        self.metrics.set_threshold(cache_result.effective_threshold)

        if cache_result.hit and cache_result.response is not None:
            self.metrics.record_cache_hit()
            semantic_ms = (time.perf_counter() - t_semantic) * 1000
            if semantic_ms > self.latency_budget_ms:
                self.metrics.record_budget_violation()
            return PipelineResponse(
                text=cache_result.response,
                cache_hit=True,
                model_id="cache",
                complexity_score=0.0,
                semantic_latency_ms=semantic_ms,
                total_latency_ms=(time.perf_counter() - t_total) * 1000,
                diagnostics=diagnostics,
            )

        self.metrics.record_cache_miss()

        route = self.router.route(request.query, emb.vector)
        diagnostics["route_ms"] = route.latency_ms
        diagnostics["route_rationale"] = route.rationale
        self.metrics.record_router_tier(route.tier.value)

        compression = self.compressor.compress(request.query, emb.vector, request.rag_chunks)
        diagnostics["compress_ms"] = compression.latency_ms
        diagnostics["chunks_kept"] = len(compression.selected_chunks)
        diagnostics["chunks_dropped"] = compression.dropped_count
        self.metrics.record_chunks_dropped(compression.dropped_count)

        context_block = ""
        if compression.selected_chunks:
            context_block = (
                "\n\n### Retrieved Context\n"
                + SemanticCompressor.format_context(compression.selected_chunks)
            )

        prompt = (
            f"{request.system_prompt}{context_block}\n\n"
            f"### User Query\n{request.query}\n\n### Assistant"
        )

        semantic_ms = (time.perf_counter() - t_semantic) * 1000
        diagnostics["semantic_total_ms"] = semantic_ms

        if semantic_ms > self.latency_budget_ms:
            logger.warning("Semantic layer exceeded %.1fms budget: %.1fms", self.latency_budget_ms, semantic_ms)
            self.metrics.record_budget_violation()

        t_infer = time.perf_counter()
        response_text = self.inference_fn(
            model=route.model_id,
            prompt=prompt,
            max_tokens=route.max_tokens,
            temperature=route.temperature,
        )
        infer_ms = (time.perf_counter() - t_infer) * 1000
        diagnostics["inference_ms"] = infer_ms
        self.metrics.observe_inference_latency(route.model_id, infer_ms)

        store_metadata = {
            "model": route.model_id,
            "session": request.session_id,
            "context_key": context_key,
        }
        if self.async_cache_write:
            self._executor.submit(
                self.cache.store,
                request.query,
                response_text,
                emb.vector,
                store_metadata,
            )
        else:
            self.cache.store(
                request.query,
                response_text,
                emb.vector,
                store_metadata,
            )

        return PipelineResponse(
            text=response_text,
            cache_hit=False,
            model_id=route.model_id,
            complexity_score=route.complexity_score,
            semantic_latency_ms=semantic_ms,
            total_latency_ms=(time.perf_counter() - t_total) * 1000,
            diagnostics=diagnostics,
        )

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False)
