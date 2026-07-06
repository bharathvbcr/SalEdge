"""FastAPI server exposing the semantic layer pipeline."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

from semantic_layer.backends.base import BaseInferenceBackend
from semantic_layer.backends.huggingface import HuggingFaceBackend
from semantic_layer.backends.llamacpp import LlamaCppBackend
from semantic_layer.backends.ollama import OllamaBackend
from semantic_layer.cache import SemanticCache
from semantic_layer.threshold import ThresholdConfig, ThresholdTuner
from semantic_layer.compressor import DocumentChunk, SemanticCompressor
from semantic_layer.config import InferenceBackend, SemanticLayerConfig
from semantic_layer.embedder import EmbedderService
from semantic_layer.metrics import SemanticMetrics
from semantic_layer.orchestrator import PipelineRequest, SemanticOrchestrator
from semantic_layer.router import SemanticRouter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

config = SemanticLayerConfig()
orchestrator: SemanticOrchestrator | None = None
metrics = SemanticMetrics()
backend: BaseInferenceBackend | None = None


def create_backend(cfg: SemanticLayerConfig) -> BaseInferenceBackend:
    if cfg.inference_backend == InferenceBackend.OLLAMA:
        return OllamaBackend(base_url=cfg.ollama_base_url)
    if cfg.inference_backend == InferenceBackend.LLAMACPP:
        return LlamaCppBackend(base_url=cfg.llamacpp_base_url)
    if cfg.inference_backend == InferenceBackend.HUGGINGFACE:
        return HuggingFaceBackend(
            model_id=cfg.hf_model_id,
            device=cfg.hf_device,
            max_new_tokens=cfg.hf_max_new_tokens,
            default_model=cfg.tier_medium_model,
        )
    raise ValueError(f"Unsupported inference backend: {cfg.inference_backend}")


def create_orchestrator(
    cfg: SemanticLayerConfig,
    inference_backend: BaseInferenceBackend | None = None,
) -> SemanticOrchestrator:
    embedder = EmbedderService(
        model_name=cfg.embedder_model,
        device=cfg.embedder_device,
        normalize=cfg.normalize_embeddings,
    )
    cache = SemanticCache(
        cache_dir=cfg.cache_dir,
        max_entries=cfg.cache_max_entries,
        ttl_seconds=cfg.cache_ttl_seconds,
        initial_threshold=cfg.similarity_threshold,
        threshold_tuner=ThresholdTuner(
            ThresholdConfig(
                initial_threshold=cfg.similarity_threshold,
                threshold_min=cfg.threshold_min,
                threshold_max=cfg.threshold_max,
                learning_rate=cfg.threshold_learning_rate,
                target_fpr=cfg.target_fpr,
                target_hit_rate=cfg.target_hit_rate,
                ood_gamma=cfg.ood_gamma,
                ood_delta=cfg.ood_delta,
            ),
        ),
    )
    router = SemanticRouter(
        tier_small_model=cfg.tier_small_model,
        tier_medium_model=cfg.tier_medium_model,
        tier_large_model=cfg.tier_large_model,
        threshold_low=cfg.complexity_threshold_low,
        threshold_high=cfg.complexity_threshold_high,
    )
    compressor = SemanticCompressor(
        embedder=embedder,
        relevance_threshold=cfg.relevance_threshold,
        max_context_tokens=cfg.max_context_tokens,
    )
    backend_instance = inference_backend or create_backend(cfg)
    if not backend_instance.health_check():
        logger.warning(
            "Inference backend %s not reachable; requests may fail at inference stage",
            cfg.inference_backend.value,
        )

    orch = SemanticOrchestrator(
        embedder=embedder,
        cache=cache,
        router=router,
        compressor=compressor,
        inference_fn=backend_instance.generate,
        async_cache_write=cfg.async_cache_write,
        enable_ood_penalty=cfg.enable_ood_penalty,
        ood_gamma=cfg.ood_gamma,
        ood_delta=cfg.ood_delta,
        metrics=metrics,
        latency_budget_ms=cfg.semantic_latency_budget_ms,
    )
    orch.initialize()
    return orch


@asynccontextmanager
async def lifespan(app: FastAPI):
    global orchestrator, backend
    backend = create_backend(config)
    orchestrator = create_orchestrator(config, inference_backend=backend)
    yield
    if orchestrator is not None:
        orchestrator.shutdown()
    if backend is not None:
        backend.close()


app = FastAPI(title="Semantic Layer", version="1.0.0", lifespan=lifespan)


class ChunkInput(BaseModel):
    id: str
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class QueryInput(BaseModel):
    query: str
    rag_chunks: list[ChunkInput] = Field(default_factory=list)
    system_prompt: str = "You are a helpful assistant."
    session_id: str | None = None


class QueryOutput(BaseModel):
    response: str
    cache_hit: bool
    model_id: str
    complexity_score: float
    semantic_latency_ms: float
    total_latency_ms: float
    diagnostics: dict[str, Any]


class FeedbackInput(BaseModel):
    entry_id: str
    was_valid: bool
    similarity: float = 0.0


@app.post("/v1/query", response_model=QueryOutput)
def query_endpoint(body: QueryInput) -> QueryOutput:
    if orchestrator is None:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")

    chunks = [DocumentChunk(id=c.id, text=c.text, metadata=c.metadata) for c in body.rag_chunks]
    result = orchestrator.run(
        PipelineRequest(
            query=body.query,
            rag_chunks=chunks,
            system_prompt=body.system_prompt,
            session_id=body.session_id,
        )
    )
    return QueryOutput(
        response=result.text,
        cache_hit=result.cache_hit,
        model_id=result.model_id,
        complexity_score=result.complexity_score,
        semantic_latency_ms=result.semantic_latency_ms,
        total_latency_ms=result.total_latency_ms,
        diagnostics=result.diagnostics,
    )


@app.post("/v1/cache/feedback")
def cache_feedback(body: FeedbackInput) -> dict[str, str]:
    if orchestrator is None:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    orchestrator.cache.submit_feedback(body.entry_id, body.was_valid, body.similarity)
    if not body.was_valid:
        metrics.record_false_positive()
    return {"status": "ok"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/metrics")
def prometheus_metrics() -> Response:
    return Response(content=metrics.to_prometheus_text(), media_type="text/plain; version=0.0.4")


@app.get("/metrics/snapshot")
def metrics_snapshot() -> dict[str, Any]:
    return metrics.snapshot()
