"""Central configuration for the semantic layer."""

from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class VectorBackend(str, Enum):
    FAISS = "faiss"
    CHROMA = "chroma"


class InferenceBackend(str, Enum):
    OLLAMA = "ollama"
    LLAMACPP = "llamacpp"
    HUGGINGFACE = "huggingface"


class SemanticLayerConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SEMANTIC_", env_file=".env", extra="ignore")

    # Embedding
    embedder_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedder_device: Literal["cpu", "cuda", "mps"] = "cpu"
    embedder_batch_size: int = 32
    normalize_embeddings: bool = True

    # Cache
    vector_backend: VectorBackend = VectorBackend.FAISS
    cache_dir: Path = Path("./data/semantic_cache")
    similarity_threshold: float = Field(default=0.88, ge=0.0, le=1.0)
    threshold_min: float = 0.82
    threshold_max: float = 0.98
    threshold_learning_rate: float = 0.005
    target_fpr: float = 0.01
    target_hit_rate: float = 0.30
    cache_max_entries: int = 10_000
    cache_ttl_seconds: int = 86_400  # 24h
    enable_ood_penalty: bool = True
    ood_gamma: float = 0.02
    ood_delta: float = 2.0

    # Router — empty defaults; resolved from Ollama tags at startup or via env overrides
    tier_small_model: str = ""
    tier_medium_model: str = ""
    tier_large_model: str = ""
    complexity_threshold_low: float = 0.4
    complexity_threshold_high: float = 0.7

    # Compressor
    relevance_threshold: float = 0.35
    max_context_tokens: int = 4096
    context_budget_ratio: float = 0.6

    # Backend
    inference_backend: InferenceBackend = InferenceBackend.OLLAMA
    ollama_base_url: str = "http://localhost:11434"
    llamacpp_base_url: str = "http://localhost:8080"
    hf_model_id: str = "meta-llama/Llama-3.2-3B-Instruct"
    hf_device: Literal["cpu", "cuda", "mps", "auto"] = "auto"
    hf_max_new_tokens: int = 1024

    # Performance
    semantic_latency_budget_ms: float = 15.0
    async_cache_write: bool = True
