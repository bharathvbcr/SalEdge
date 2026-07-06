"""Dynamic cosine similarity threshold auto-tuning for semantic cache."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class ThresholdConfig:
    """Configuration for adaptive similarity threshold control."""

    initial_threshold: float = 0.88
    threshold_min: float = 0.82
    threshold_max: float = 0.98
    learning_rate: float = 0.005
    target_fpr: float = 0.01
    target_hit_rate: float = 0.30
    feedback_window: int = 500
    min_feedback_samples: int = 20
    ood_gamma: float = 0.02
    ood_delta: float = 2.0


@dataclass
class ThresholdState:
    """Runtime statistics for threshold tuning."""

    queries: int = 0
    hits: int = 0
    feedback: list[tuple[float, bool]] = field(default_factory=list)


class ThresholdTuner:
    """
    Online dual-constraint threshold controller.

    Maintains base threshold τ and adjusts it from:
    - False-positive rate (FPR) feedback → raise τ
    - Hit-rate deficit → lower τ (only when FPR is well below target)

    Effective threshold for a query:
        τ_eff = clip(τ + γ · max(0, z_norm - δ), τ_min, τ_max)
    """

    def __init__(
        self,
        config: ThresholdConfig | None = None,
        *,
        threshold: float | None = None,
        threshold_min: float = 0.82,
        threshold_max: float = 0.98,
        learning_rate: float = 0.005,
        target_fpr: float = 0.01,
        target_hit_rate: float = 0.30,
    ) -> None:
        if config is not None:
            self.config = config
        else:
            self.config = ThresholdConfig(
                initial_threshold=threshold if threshold is not None else 0.88,
                threshold_min=threshold_min,
                threshold_max=threshold_max,
                learning_rate=learning_rate,
                target_fpr=target_fpr,
                target_hit_rate=target_hit_rate,
            )
        self._threshold = self.config.initial_threshold
        self._state = ThresholdState()

    @property
    def threshold(self) -> float:
        return self._threshold

    def record_query(self, was_hit: bool) -> None:
        self._state.queries += 1
        if was_hit:
            self._state.hits += 1

    def record_feedback(self, similarity: float, was_valid: bool) -> None:
        """Record user or LLM-judge feedback on a cache hit."""
        self._state.feedback.append((similarity, was_valid))
        if len(self._state.feedback) > self.config.feedback_window:
            self._state.feedback.pop(0)
        self._maybe_update()

    def effective_threshold(
        self,
        ood_score: float = 0.0,
        ood_gamma: float | None = None,
        ood_delta: float | None = None,
    ) -> float:
        """Compute query-specific threshold with OOD penalty."""
        cfg = self.config
        gamma = cfg.ood_gamma if ood_gamma is None else ood_gamma
        delta = cfg.ood_delta if ood_delta is None else ood_delta
        penalty = gamma * max(0.0, ood_score - delta)
        return float(np.clip(self._threshold + penalty, cfg.threshold_min, cfg.threshold_max))

    def _maybe_update(self) -> None:
        if len(self._state.feedback) < self.config.min_feedback_samples:
            return

        fp_count = sum(1 for _, valid in self._state.feedback if not valid)
        fpr_hat = fp_count / len(self._state.feedback)
        hr_hat = self._state.hits / max(self._state.queries, 1)

        cfg = self.config
        old = self._threshold

        if fpr_hat > cfg.target_fpr:
            self._threshold += cfg.learning_rate * (fpr_hat - cfg.target_fpr)
        elif hr_hat < cfg.target_hit_rate and fpr_hat < cfg.target_fpr / 2:
            self._threshold -= cfg.learning_rate * (cfg.target_hit_rate - hr_hat)

        self._threshold = float(np.clip(self._threshold, cfg.threshold_min, cfg.threshold_max))

        if abs(self._threshold - old) > 1e-6:
            logger.debug(
                "Threshold updated %.4f → %.4f (FPR=%.4f, HR=%.4f)",
                old,
                self._threshold,
                fpr_hat,
                hr_hat,
            )

    @staticmethod
    def pseudocode() -> str:
        """Reference pseudocode for threshold auto-tuning (documented in README)."""
        return """
PSEUDOCODE: Adaptive Cosine Threshold Auto-Tuning
──────────────────────────────────────────────────
INPUT:  τ (base threshold), feedback window W, targets (FPR*, HR*)
OUTPUT: τ_eff per query

ON each cache lookup(query_embedding):
    z_norm ← OOD_score(query_embedding)
    τ_eff  ← clip(τ + γ·max(0, z_norm - δ), τ_min, τ_max)
    (sim, entry) ← top1_cosine_search(index, query_embedding)

    IF sim ≥ τ_eff AND entry NOT expired:
        RETURN cache_hit(entry)
    ELSE:
        RETURN cache_miss → fall through to router/LLM

ON cache_hit_feedback(similarity, was_valid):
    APPEND (similarity, was_valid) to W
    IF |W| < MIN_SAMPLES: RETURN

    FPR_hat ← count(valid=false in W) / |W|
    HR_hat  ← cache_hits / total_queries

    IF FPR_hat > FPR*:
        τ ← τ + η · (FPR_hat - FPR*)
    ELIF HR_hat < HR* AND FPR_hat < FPR*/2:
        τ ← τ - η · (HR* - HR_hat)

    τ ← clip(τ, τ_min, τ_max)
"""
