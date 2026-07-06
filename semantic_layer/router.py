"""Semantic router: complexity scoring and model tier selection."""

from __future__ import annotations

import math
import re
import time
from dataclasses import dataclass
from enum import Enum

import numpy as np
from numpy.typing import NDArray


class ModelTier(str, Enum):
    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"


@dataclass(frozen=True, slots=True)
class RouterConfig:
    tier_small_model: str = "phi3:mini"
    tier_medium_model: str = "llama3.2:3b"
    tier_large_model: str = "llama3.1:8b"
    threshold_low: float = 0.4
    threshold_high: float = 0.7


@dataclass(frozen=True, slots=True)
class RouteDecision:
    tier: ModelTier
    model_id: str
    complexity_score: float
    max_tokens: int
    temperature: float
    latency_ms: float
    rationale: str


class SemanticRouter:
    def __init__(
        self,
        tier_small_model: str | None = None,
        tier_medium_model: str | None = None,
        tier_large_model: str | None = None,
        threshold_low: float = 0.4,
        threshold_high: float = 0.7,
        prototype_embeddings: NDArray[np.float32] | None = None,
        config: RouterConfig | None = None,
    ) -> None:
        # RouterConfig uses slots=True, so class-attribute access returns slot
        # descriptors rather than field defaults. Read defaults from an instance.
        defaults = RouterConfig()
        cfg = config or RouterConfig(
            tier_small_model=tier_small_model or defaults.tier_small_model,
            tier_medium_model=tier_medium_model or defaults.tier_medium_model,
            tier_large_model=tier_large_model or defaults.tier_large_model,
            threshold_low=threshold_low,
            threshold_high=threshold_high,
        )
        self.config = cfg
        self.tier_models = {
            ModelTier.SMALL: cfg.tier_small_model,
            ModelTier.MEDIUM: cfg.tier_medium_model,
            ModelTier.LARGE: cfg.tier_large_model,
        }
        self.threshold_low = cfg.threshold_low
        self.threshold_high = cfg.threshold_high
        self._prototype_embeddings = prototype_embeddings

    def set_prototype_embeddings(self, embeddings: NDArray[np.float32]) -> None:
        self._prototype_embeddings = embeddings

    def route(self, query: str, query_embedding: NDArray[np.float32]) -> RouteDecision:
        t0 = time.perf_counter()
        score = self._complexity_score(query, query_embedding)

        if score < self.threshold_low:
            tier = ModelTier.SMALL
            max_tokens, temperature = 256, 0.3
            rationale = f"Low complexity ({score:.2f}): factual/short query"
        elif score < self.threshold_high:
            tier = ModelTier.MEDIUM
            max_tokens, temperature = 1024, 0.5
            rationale = f"Medium complexity ({score:.2f}): moderate reasoning"
        else:
            tier = ModelTier.LARGE
            max_tokens, temperature = 4096, 0.7
            rationale = f"High complexity ({score:.2f}): multi-step reasoning/code"

        return RouteDecision(
            tier=tier,
            model_id=self.tier_models[tier],
            complexity_score=score,
            max_tokens=max_tokens,
            temperature=temperature,
            latency_ms=(time.perf_counter() - t0) * 1000,
            rationale=rationale,
        )

    def _complexity_score(self, query: str, query_embedding: NDArray[np.float32]) -> float:
        tokens = len(query.split())
        f_len = min(1.0, tokens / 512.0)
        f_ent = min(1.0, self._shannon_entropy(query) / 8.0)
        f_syn = min(1.0, self._syntactic_complexity(query) / 5.0)
        f_sem = self._semantic_complexity(query_embedding)

        w1, w2, w3, w4 = 0.2, 0.2, 0.3, 0.3
        return float(np.clip(w1 * f_len + w2 * f_ent + w3 * f_syn + w4 * f_sem, 0.0, 1.0))

    @staticmethod
    def _shannon_entropy(text: str) -> float:
        if not text:
            return 0.0
        freq: dict[str, int] = {}
        for ch in text.lower():
            freq[ch] = freq.get(ch, 0) + 1
        total = len(text)
        return -sum((c / total) * math.log2(c / total) for c in freq.values())

    @staticmethod
    def _syntactic_complexity(query: str) -> float:
        score = 0.0
        if re.search(r"```", query):
            score += 2.0
        if re.search(r"\b(implement|debug|prove|analyze|design|architect|optimize)\b", query, re.I):
            score += 1.5
        if re.search(r"\b(step|first|then|finally|multi.?step)\b", query, re.I):
            score += 1.0
        if query.count("?") > 1:
            score += 0.5
        if len(query) > 2000:
            score += 1.0
        return score

    def _semantic_complexity(self, query_embedding: NDArray[np.float32]) -> float:
        if self._prototype_embeddings is None or len(self._prototype_embeddings) == 0:
            return 0.3
        sims = self._prototype_embeddings @ query_embedding
        return float(np.max(sims))
