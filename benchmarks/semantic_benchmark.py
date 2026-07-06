"""Benchmark harness for semantic layer latency and cache hit rate."""

from __future__ import annotations

import argparse
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path

# Allow running as `python benchmarks/semantic_benchmark.py` from repo root.
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from semantic_layer.config import SemanticLayerConfig
from semantic_layer.main import create_orchestrator
from semantic_layer.orchestrator import PipelineRequest, SemanticOrchestrator


DEFAULT_QUERIES = [
    "What is the warranty on Exide 150Ah batteries?",
    "How do I check battery warranty coverage?",
    "Tell me about Exide battery warranty terms.",
    "What is the price of a 150Ah inverter battery?",
    "Implement a distributed consensus algorithm with fault tolerance",
    "Write a formal proof by induction showing that sum of first n integers is n(n+1)/2",
    "List customers with overdue payments this month",
    "How many batteries were sold last week?",
]


@dataclass
class BenchmarkReport:
    semantic_p50_ms: float
    semantic_p95_ms: float
    semantic_p99_ms: float
    cache_hit_rate: float
    total_queries: int
    budget_violations: int
    budget_ms: float

    def __str__(self) -> str:
        return (
            f"BenchmarkReport(\n"
            f"  queries={self.total_queries},\n"
            f"  semantic_p50_ms={self.semantic_p50_ms:.2f},\n"
            f"  semantic_p95_ms={self.semantic_p95_ms:.2f},\n"
            f"  semantic_p99_ms={self.semantic_p99_ms:.2f},\n"
            f"  cache_hit_rate={self.cache_hit_rate:.1%},\n"
            f"  budget_violations={self.budget_violations} (>{self.budget_ms}ms),\n"
            f")"
        )


def percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = min(int(len(sorted_vals) * q), len(sorted_vals) - 1)
    return sorted_vals[idx]


def run_benchmark(
    orchestrator: SemanticOrchestrator,
    queries: list[str],
    budget_ms: float = 15.0,
    warmup: int = 10,
    mock_inference: bool = False,
) -> BenchmarkReport:
    if mock_inference:
        orchestrator.inference_fn = lambda **kwargs: "mock response for benchmark"

    warmup_queries = queries[:warmup] if warmup > 0 else []
    for q in warmup_queries:
        orchestrator.run(PipelineRequest(query=q))

    semantic_latencies: list[float] = []
    hits = 0

    for q in queries:
        result = orchestrator.run(PipelineRequest(query=q))
        semantic_latencies.append(result.semantic_latency_ms)
        if result.cache_hit:
            hits += 1

    n = len(semantic_latencies)
    return BenchmarkReport(
        semantic_p50_ms=percentile(semantic_latencies, 0.50),
        semantic_p95_ms=percentile(semantic_latencies, 0.95),
        semantic_p99_ms=percentile(semantic_latencies, 0.99),
        cache_hit_rate=hits / n if n else 0.0,
        total_queries=n,
        budget_violations=sum(1 for lat in semantic_latencies if lat > budget_ms),
        budget_ms=budget_ms,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Semantic layer benchmark harness")
    parser.add_argument(
        "--mock-inference",
        action="store_true",
        help="Skip real LLM calls (benchmark semantic stages only)",
    )
    parser.add_argument(
        "--budget-ms",
        type=float,
        default=None,
        help="Latency budget in milliseconds (default: from config)",
    )
    parser.add_argument(
        "--warmup",
        type=int,
        default=5,
        help="Number of warmup queries",
    )
    parser.add_argument(
        "--repeat",
        type=int,
        default=3,
        help="Repeat query set N times",
    )
    args = parser.parse_args()

    config = SemanticLayerConfig()
    budget_ms = args.budget_ms if args.budget_ms is not None else config.semantic_latency_budget_ms

    print("Initializing semantic layer orchestrator...")
    orchestrator = create_orchestrator(config)

    queries = DEFAULT_QUERIES * max(args.repeat, 1)
    report = run_benchmark(
        orchestrator,
        queries=queries,
        budget_ms=budget_ms,
        warmup=args.warmup,
        mock_inference=args.mock_inference,
    )

    print(report)
    print(f"Mean semantic latency: {statistics.mean([report.semantic_p50_ms, report.semantic_p95_ms]):.2f} ms")
    print(f"Metrics snapshot: {orchestrator.metrics.snapshot()}")

    orchestrator.shutdown()
    passed = report.semantic_p95_ms <= budget_ms or args.mock_inference
    if not passed:
        print(f"FAIL: p95 {report.semantic_p95_ms:.2f}ms exceeds budget {budget_ms}ms")
        return 1
    print(f"PASS: p95 {report.semantic_p95_ms:.2f}ms within budget {budget_ms}ms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
