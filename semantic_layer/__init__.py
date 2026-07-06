"""Semantic layer for local LLM pipelines: cache, route, compress, infer."""

from semantic_layer.cache import CacheConfig, CacheLookupResult, SemanticCache
from semantic_layer.compressor import CompressorConfig, CompressionResult, DocumentChunk, SemanticCompressor
from semantic_layer.config import InferenceBackend, SemanticLayerConfig, VectorBackend
from semantic_layer.embedder import DEFAULT_MODEL, EMBED_DIM, EmbedderService, EmbeddingResult
from semantic_layer.orchestrator import PipelineRequest, PipelineResponse, SemanticOrchestrator
from semantic_layer.router import ModelTier, RouteDecision, RouterConfig, SemanticRouter
from semantic_layer.threshold import ThresholdConfig, ThresholdTuner

__all__ = [
    "CacheConfig",
    "CacheLookupResult",
    "CompressionResult",
    "CompressorConfig",
    "DEFAULT_MODEL",
    "DocumentChunk",
    "EMBED_DIM",
    "EmbedderService",
    "EmbeddingResult",
    "InferenceBackend",
    "ModelTier",
    "PipelineRequest",
    "PipelineResponse",
    "RouteDecision",
    "RouterConfig",
    "SemanticCache",
    "SemanticCompressor",
    "SemanticLayerConfig",
    "SemanticOrchestrator",
    "SemanticRouter",
    "ThresholdConfig",
    "ThresholdTuner",
    "VectorBackend",
]

__version__ = "1.1.0"
