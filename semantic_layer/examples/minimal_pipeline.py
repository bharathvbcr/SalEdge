#!/usr/bin/env python3
"""Minimal standalone semantic layer pipeline (no FastAPI, no LLM backend).

Usage (from repo root):
    source .venv-semantic/bin/activate
    python semantic_layer/examples/minimal_pipeline.py
"""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from semantic_layer.compressor import DocumentChunk
from semantic_layer.main import create_orchestrator
from semantic_layer.config import SemanticLayerConfig
from semantic_layer.orchestrator import PipelineRequest


def main() -> None:
    config = SemanticLayerConfig()
    orchestrator = create_orchestrator(config)

    # Replace real LLM with mock for demo
    orchestrator.inference_fn = lambda **kwargs: (
        f"[mock/{kwargs['model']}] Processed: {kwargs['prompt'][-80:]}"
    )

    queries = [
        "What is the warranty on Exide 150Ah batteries?",
        "Tell me about Exide battery warranty coverage.",  # paraphrase → cache hit
        "Implement a distributed consensus protocol in Rust.",  # complex → large tier
    ]

    rag_chunks = [
        DocumentChunk(id="inv-1", text="Exide 150Ah inverter battery SKU-EX150. Stock: 42 units."),
        DocumentChunk(id="inv-2", text="Amaron 165Ah tubular battery. Stock: 8 units (low)."),
        DocumentChunk(id="policy-1", text="Exide batteries carry 24-month warranty on manufacturing defects."),
    ]

    print("=" * 70)
    print("Semantic Layer — Minimal Pipeline Demo")
    print("=" * 70)

    for i, query in enumerate(queries, 1):
        result = orchestrator.run(
            PipelineRequest(
                query=query,
                rag_chunks=rag_chunks if i == 1 else [],
                system_prompt="You are a battery shop assistant.",
            )
        )
        print(f"\n--- Query {i} ---")
        print(f"Query:       {query[:60]}...")
        print(f"Cache hit:   {result.cache_hit}")
        print(f"Model:       {result.model_id}")
        print(f"Complexity:  {result.complexity_score:.2f}")
        print(f"Semantic ms: {result.semantic_latency_ms:.1f}")
        print(f"Total ms:    {result.total_latency_ms:.1f}")
        print(f"Response:    {result.text[:100]}...")
        print(f"Diagnostics: {result.diagnostics}")

    print(f"\nMetrics: {orchestrator.metrics.snapshot()}")
    orchestrator.shutdown()


if __name__ == "__main__":
    main()
