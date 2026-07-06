"""Prometheus-style metric recording helpers for the semantic layer."""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any


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

    def to_prometheus_lines(self) -> list[str]:
        lines = [
            f"# TYPE {self.name} summary",
            f'{self.name}{{quantile="0.50"}} {self.quantile(0.50):.4f}',
            f'{self.name}{{quantile="0.95"}} {self.quantile(0.95):.4f}',
            f'{self.name}{{quantile="0.99"}} {self.quantile(0.99):.4f}',
            f"{self.name}_count {self.count()}",
        ]
        return lines


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
        suffix = labels if labels.startswith("{") else ""
        return f"{self.name}{suffix} {self.value:.0f}"


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

    def to_prometheus_line(self) -> str:
        return f"{self.name} {self.value:.4f}"


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
        hist = self.inference_latency[model]
        hist.name = f'semantic_llm_inference_latency_ms{{model="{model}"}}'
        hist.observe(ms)

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
        counter = self.router_tier[tier]
        counter.name = f'semantic_router_tier_total{{tier="{tier}"}}'
        counter.inc()

    def set_threshold(self, value: float) -> None:
        self.threshold.set(value)

    def cache_hit_rate(self) -> float:
        total = self.cache_hits.value + self.cache_misses.value
        if total == 0:
            return 0.0
        return self.cache_hits.value / total

    def to_prometheus_text(self) -> str:
        lines: list[str] = []
        lines.extend(self.embed_latency.to_prometheus_lines())
        lines.extend(self.cache_lookup_latency.to_prometheus_lines())
        lines.append(self.cache_hits.to_prometheus_line())
        lines.append(self.cache_misses.to_prometheus_line())
        lines.append(self.false_positives.to_prometheus_line())
        lines.append(self.budget_violations.to_prometheus_line())
        lines.append(self.chunks_dropped.to_prometheus_line())
        lines.append(self.threshold.to_prometheus_line())
        for tier, counter in self.router_tier.items():
            lines.append(counter.to_prometheus_line(f'{{tier="{tier}"}}'))
        for model, hist in self.inference_latency.items():
            hist.name = f'semantic_llm_inference_latency_ms{{model="{model}"}}'
            lines.extend(hist.to_prometheus_lines())
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
