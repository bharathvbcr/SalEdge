"""Prometheus-style metric recording helpers for the semantic layer."""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any


def _merge_labels(*label_groups: str) -> str:
    """Merge label groups into one canonical ``{a="b",c="d"}`` string."""
    parts: list[str] = []
    for group in label_groups:
        if not group:
            continue
        stripped = group.strip()
        if stripped.startswith("{"):
            stripped = stripped[1:]
        if stripped.endswith("}"):
            stripped = stripped[:-1]
        if stripped:
            parts.append(stripped)
    return "{" + ",".join(parts) + "}" if parts else ""


@dataclass
class _Histogram:
    """Simple in-process histogram for latency observations."""

    name: str
    _values: list[float] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def observe(self, value: float) -> None:
        with self._lock:
            self._values.append(value)
            if len(self._values) > 10_000:
                self._values = self._values[-5_000:]

    def quantile(self, q: float) -> float:
        with self._lock:
            if not self._values:
                return 0.0
            sorted_vals = sorted(self._values)
            idx = min(int(len(sorted_vals) * q), len(sorted_vals) - 1)
            return sorted_vals[idx]

    def count(self) -> int:
        with self._lock:
            return len(self._values)

    def to_sample_lines(self, extra_labels: str = "") -> list[str]:
        base = _merge_labels(extra_labels)
        q50 = _merge_labels(base, 'quantile="0.50"')
        q95 = _merge_labels(base, 'quantile="0.95"')
        q99 = _merge_labels(base, 'quantile="0.99"')
        return [
            f"{self.name}{q50} {self.quantile(0.50):.4f}",
            f"{self.name}{q95} {self.quantile(0.95):.4f}",
            f"{self.name}{q99} {self.quantile(0.99):.4f}",
            f"{self.name}_count{base} {self.count()}",
        ]

    def to_prometheus_lines(self) -> list[str]:
        return [
            f"# TYPE {self.name} summary",
            *self.to_sample_lines(),
        ]


@dataclass
class _Counter:
    """Simple in-process counter."""

    name: str
    _value: float = 0.0
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def inc(self, amount: float = 1.0) -> None:
        with self._lock:
            self._value += amount

    @property
    def value(self) -> float:
        with self._lock:
            return self._value

    def to_prometheus_line(self, labels: str = "") -> str:
        return f"{self.name}{_merge_labels(labels)} {self.value:.0f}"


@dataclass
class _Gauge:
    """Simple in-process gauge."""

    name: str
    _value: float = 0.0
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def set(self, value: float) -> None:
        with self._lock:
            self._value = value

    @property
    def value(self) -> float:
        with self._lock:
            return self._value

    def to_prometheus_line(self, labels: str = "") -> str:
        return f"{self.name}{_merge_labels(labels)} {self.value:.4f}"


class SemanticMetrics:
    """Collects semantic-layer metrics with Prometheus export helpers."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.embed_latency = _Histogram("semantic_embed_latency_ms")
        self.cache_lookup_latency = _Histogram("semantic_cache_lookup_ms")
        self.inference_latency: dict[str, _Histogram] = defaultdict(
            lambda: _Histogram("semantic_llm_inference_latency_ms")
        )
        self.cache_hits = _Counter("semantic_cache_hit_total")
        self.cache_misses = _Counter("semantic_cache_miss_total")
        self.false_positives = _Counter("semantic_cache_false_positive_total")
        self.budget_violations = _Counter("semantic_budget_violation_total")
        self.chunks_dropped = _Counter("semantic_compress_chunks_dropped_total")
        self.router_tier: dict[str, _Counter] = defaultdict(
            lambda: _Counter("semantic_router_tier_total")
        )
        self.threshold = _Gauge("semantic_threshold_current")
        self._start_time = time.time()

    def observe_embed_latency(self, ms: float) -> None:
        self.embed_latency.observe(ms)

    def observe_cache_lookup_latency(self, ms: float) -> None:
        self.cache_lookup_latency.observe(ms)

    def observe_inference_latency(self, model: str, ms: float) -> None:
        self.inference_latency[model].observe(ms)

    def record_cache_hit(self) -> None:
        self.cache_hits.inc()

    def record_cache_miss(self) -> None:
        self.cache_misses.inc()

    def record_false_positive(self) -> None:
        self.false_positives.inc()

    def record_budget_violation(self) -> None:
        self.budget_violations.inc()

    def record_chunks_dropped(self, count: int) -> None:
        if count > 0:
            self.chunks_dropped.inc(count)

    def record_router_tier(self, tier: str) -> None:
        self.router_tier[tier].inc()

    def set_threshold(self, value: float) -> None:
        self.threshold.set(value)

    def cache_hit_rate(self) -> float:
        total = self.cache_hits.value + self.cache_misses.value
        if total == 0:
            return 0.0
        return self.cache_hits.value / total

    @staticmethod
    def _family(lines: list[str], name: str, mtype: str, help_text: str) -> None:
        lines.append(f"# HELP {name} {help_text}")
        lines.append(f"# TYPE {name} {mtype}")

    def to_prometheus_text(self) -> str:
        lines: list[str] = []

        # Single-instance summary families.
        self._family(lines, "semantic_embed_latency_ms", "summary", "Embedder latency in milliseconds.")
        lines.extend(self.embed_latency.to_sample_lines())
        self._family(lines, "semantic_cache_lookup_ms", "summary", "Semantic cache lookup latency in milliseconds.")
        lines.extend(self.cache_lookup_latency.to_sample_lines())

        # Counter families.
        for counter, help_text in (
            (self.cache_hits, "Total semantic cache hits."),
            (self.cache_misses, "Total semantic cache misses."),
            (self.false_positives, "Cache false positives reported via feedback."),
            (self.budget_violations, "Semantic-layer latency budget violations."),
            (self.chunks_dropped, "RAG chunks dropped by compression."),
        ):
            self._family(lines, counter.name, "counter", help_text)
            lines.append(counter.to_prometheus_line())

        # Gauge family.
        self._family(lines, "semantic_threshold_current", "gauge", "Current adaptive similarity threshold.")
        lines.append(self.threshold.to_prometheus_line())

        # Multi-instance families: exactly ONE TYPE line, labeled samples below.
        if self.router_tier:
            self._family(lines, "semantic_router_tier_total", "counter", "Queries routed per complexity tier.")
            for tier in sorted(self.router_tier):
                counter = self.router_tier[tier]
                lines.append(counter.to_prometheus_line(f'tier="{tier}"'))
        if self.inference_latency:
            self._family(
                lines,
                "semantic_llm_inference_latency_ms",
                "summary",
                "LLM inference latency in milliseconds per model.",
            )
            for model in sorted(self.inference_latency):
                hist = self.inference_latency[model]
                lines.extend(hist.to_sample_lines(f'model="{model}"'))

        return "\n".join(lines) + "\n"

    def snapshot(self) -> dict[str, Any]:
        return {
            "embed_latency_p95_ms": self.embed_latency.quantile(0.95),
            "cache_lookup_p95_ms": self.cache_lookup_latency.quantile(0.95),
            "cache_hit_rate": self.cache_hit_rate(),
            "cache_hits": self.cache_hits.value,
            "cache_misses": self.cache_misses.value,
            "false_positives": self.false_positives.value,
            "budget_violations": self.budget_violations.value,
            "chunks_dropped": self.chunks_dropped.value,
            "threshold_current": self.threshold.value,
            "uptime_seconds": time.time() - self._start_time,
        }
