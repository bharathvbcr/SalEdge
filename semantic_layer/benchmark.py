"""Benchmarking utilities for semantic layer overhead (<15ms p95 target)."""

from __future__ import annotations

import argparse
import logging
import statistics
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np

from semantic_layer.cache import CacheConfig, SemanticCache
from semantic_layer.compressor import DocumentChunk, SemanticCompressor
from semantic_layer.embedder import EMBED_DIM, EmbedderService
from semantic_layer.router import SemanticRouter
from semantic_layer.threshold import ThresholdTuner

logger = logging.getLogger(__name__)

TARGET_P95_MS = 15.0


@dataclass(frozen=True, slots=True)
class BenchmarkReport:
    name: str
    samples: int
    mean_ms: float
    p50_ms: float
    p95_ms: float
    p99_ms: float
    max_ms: float
    meets_target: bool


def _percentile(values: Sequence[float], pct: float) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = int(len(sorted_vals) * pct)
    idx = min(idx, len(sorted_vals) - 1)
    return sorted_vals[idx]


def _report(name: str, latencies: list[float]) -> BenchmarkReport:
    return BenchmarkReport(
        name=name,
        samples=len(latencies),
        mean_ms=statistics.mean(latencies) if latencies else 0.0,
        p50_ms=_percentile(latencies, 0.50),
        p95_ms=_percentile(latencies, 0.95),
        p99_ms=_percentile(latencies, 0.99),
        max_ms=max(latencies) if latencies else 0.0,
        meets_target=_percentile(latencies, 0.95) < TARGET_P95_MS,
    )


def benchmark_embedder(iterations: int = 100, device: str = "cpu") -> BenchmarkReport:
    embedder = EmbedderService(device=device)
    embedder.warm_start()

    latencies: list[float] = []
    queries = [f"What is the warranty policy for battery SKU-{i}?" for i in range(iterations)]

    for q in queries:
        t0 = time.perf_counter()
        embedder.embed(q)
        latencies.append((time.perf_counter() - t0) * 1000)

    return _report("embedder", latencies)


def _random_embedding(seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    vec = rng.standard_normal(EMBED_DIM).astype(np.float32)
    return vec / np.linalg.norm(vec)


def benchmark_cache_lookup(iterations: int = 500, *, use_embedder: bool = True) -> BenchmarkReport:
    cache = SemanticCache(CacheConfig(cache_dir=Path("/tmp/semantic_bench_cache")))

    seed_queries = [f"cache seed query {i}" for i in range(50)]
    if use_embedder:
        embedder = EmbedderService()
        embedder.warm_start()
        for i, q in enumerate(seed_queries):
            emb = embedder.embed(q)
            cache.store(q, f"response {q}", emb.vector)
    else:
        for i, q in enumerate(seed_queries):
            cache.store(q, f"response {q}", _random_embedding(i))

    latencies: list[float] = []
    for i in range(iterations):
        vec = (
            embedder.embed(f"cache seed query {i % 50}").vector
            if use_embedder
            else _random_embedding(i % 50)
        )
        t0 = time.perf_counter()
        cache.lookup(vec)
        latencies.append((time.perf_counter() - t0) * 1000)

    return _report("cache_lookup", latencies)


def benchmark_router(iterations: int = 1000, *, use_embedder: bool = True) -> BenchmarkReport:
    router = SemanticRouter()

    queries = [
        "What is 2+2?",
        "Explain quantum entanglement step by step with mathematical proof.",
        "List warranty terms for Exide batteries.",
        "Implement a distributed cache invalidation protocol in Rust.",
    ]

    embedder = None
    if use_embedder:
        embedder = EmbedderService()
        embedder.warm_start()

    latencies: list[float] = []
    for i in range(iterations):
        q = queries[i % len(queries)]
        vec = embedder.embed(q).vector if embedder is not None else _random_embedding(i)
        t0 = time.perf_counter()
        router.route(q, vec)
        latencies.append((time.perf_counter() - t0) * 1000)

    return _report("router", latencies)


def benchmark_compressor(iterations: int = 50) -> BenchmarkReport:
    embedder = EmbedderService()
    embedder.warm_start()
    compressor = SemanticCompressor(embedder)

    chunks = [
        DocumentChunk(id=str(i), text=f"RAG chunk about battery inventory row {i}. " * 20)
        for i in range(32)
    ]
    query_emb = embedder.embed("What batteries are low in stock?").vector

    latencies: list[float] = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        compressor.compress("", query_emb, chunks)
        latencies.append((time.perf_counter() - t0) * 1000)

    return _report("compressor", latencies)


def benchmark_threshold(iterations: int = 10_000) -> BenchmarkReport:
    tuner = ThresholdTuner()
    latencies: list[float] = []

    for i in range(iterations):
        t0 = time.perf_counter()
        tuner.effective_threshold(ood_score=float(i % 5))
        latencies.append((time.perf_counter() - t0) * 1000)

    return _report("threshold", latencies)


def run_all_benchmarks(
    *,
    embed_iterations: int = 100,
    skip_embedder: bool = False,
) -> list[BenchmarkReport]:
    reports: list[BenchmarkReport] = []

    if not skip_embedder:
        reports.append(benchmark_embedder(embed_iterations))

    reports.extend([
        benchmark_cache_lookup(use_embedder=not skip_embedder),
        benchmark_router(use_embedder=not skip_embedder),
        benchmark_threshold(),
    ])

    return reports


def print_report(report: BenchmarkReport) -> None:
    status = "PASS" if report.meets_target else "FAIL"
    print(
        f"[{status}] {report.name}: "
        f"n={report.samples} mean={report.mean_ms:.2f}ms "
        f"p50={report.p50_ms:.2f}ms p95={report.p95_ms:.2f}ms "
        f"p99={report.p99_ms:.2f}ms max={report.max_ms:.2f}ms "
        f"(target p95 < {TARGET_P95_MS}ms)"
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Semantic layer benchmark suite")
    parser.add_argument("--skip-embedder", action="store_true", help="Skip SentenceTransformer bench")
    parser.add_argument("--iterations", type=int, default=100)
    parser.add_argument("--component", choices=["all", "embedder", "cache", "router", "compressor", "threshold"])
    args = parser.parse_args()

    reports: list[BenchmarkReport] = []

    if args.component in (None, "all"):
        reports = run_all_benchmarks(
            embed_iterations=args.iterations,
            skip_embedder=args.skip_embedder,
        )
        if not args.skip_embedder:
            reports.append(benchmark_compressor())
    elif args.component == "embedder":
        reports = [benchmark_embedder(args.iterations)]
    elif args.component == "cache":
        reports = [benchmark_cache_lookup()]
    elif args.component == "router":
        reports = [benchmark_router()]
    elif args.component == "compressor":
        reports = [benchmark_compressor()]
    elif args.component == "threshold":
        reports = [benchmark_threshold()]

    print(f"\nSemantic Layer Benchmark (target: p95 < {TARGET_P95_MS}ms overhead)\n{'=' * 60}")
    for r in reports:
        print_report(r)

    overhead_components = [r for r in reports if r.name in ("cache_lookup", "router", "threshold")]
    if overhead_components:
        combined_p95 = sum(r.p95_ms for r in overhead_components)
        print(f"\nCombined non-embed overhead p95 estimate: {combined_p95:.2f}ms")


if __name__ == "__main__":
    main()
