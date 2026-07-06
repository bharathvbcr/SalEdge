# Semantic Layer

Production-grade semantic middleware for local LLM pipelines: **semantic caching**, **intent-based routing**, and **RAG context compression**.

Targets **<15 ms p95** semantic-layer overhead on consumer hardware (excluding LLM inference).

## Features

- **Semantic cache** — FAISS `IndexFlatIP` with cosine similarity, TTL, LRU eviction, and adaptive threshold tuning (`threshold.py`)
- **Semantic router** — Complexity scoring routes queries to small/medium/large model tiers
- **Semantic compressor** — Filters irrelevant RAG chunks before LLM context window
- **Backends** — Ollama, llama.cpp server, Hugging Face Transformers
- **Metrics** — Prometheus-style counters, gauges, and latency histograms
- **Benchmarks** — Per-component and end-to-end latency harness

## Quick Start

### 1. Install dependencies (one command)

From the repository root:

```bash
npm run semantic:setup
```

This creates `.venv-semantic/` and installs `requirements-semantic.txt`. Manual equivalent:

```bash
python3 -m venv .venv-semantic && source .venv-semantic/bin/activate
pip install -r requirements-semantic.txt
```

### 2. Start a local LLM backend

**Ollama (default):**

```bash
ollama pull phi3:mini
ollama pull llama3.2:3b
ollama pull llama3.1:8b
ollama serve
```

**llama.cpp server:**

```bash
export SEMANTIC_INFERENCE_BACKEND=llamacpp
export SEMANTIC_LLAMACPP_BASE_URL=http://localhost:8080
```

**Hugging Face:**

```bash
export SEMANTIC_INFERENCE_BACKEND=huggingface
export SEMANTIC_HF_MODEL_ID=meta-llama/Llama-3.2-3B-Instruct
```

### 3. Run the semantic layer API

```bash
npm run semantic:serve
# or with the full dev stack:
npm run dev:full
```

Default URL: http://127.0.0.1:8090

### 4. Send a query

```bash
curl -X POST http://127.0.0.1:8090/v1/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the warranty on Exide 150Ah batteries?"}'
```

### 5. Run benchmarks

Component benchmarks (no LLM required):

```bash
npm run semantic:benchmark -- --skip-embedder
npm run semantic:benchmark -- --component cache
```

Full pipeline benchmark (orchestrator + optional mock inference):

```bash
python benchmarks/semantic_benchmark.py --mock-inference
```

## Configuration

All settings use the `SEMANTIC_` environment prefix (see `config.py`):

| Variable | Default | Description |
|----------|---------|-------------|
| `SEMANTIC_EMBEDDER_DEVICE` | `cpu` | Embedder device (`cpu`, `cuda`, `mps`) |
| `SEMANTIC_SIMILARITY_THRESHOLD` | `0.88` | Initial cache similarity threshold |
| `SEMANTIC_INFERENCE_BACKEND` | `ollama` | `ollama`, `llamacpp`, or `huggingface` |
| `SEMANTIC_OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API URL |
| `SEMANTIC_CACHE_DIR` | `./data/semantic_cache` | Persistent cache directory |
| `SEMANTIC_ASYNC_CACHE_WRITE` | `true` | Non-blocking cache writes |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/query` | Run full semantic pipeline |
| `POST` | `/v1/cache/feedback` | Submit cache hit validity feedback |
| `GET` | `/health` | Health check |
| `GET` | `/metrics` | Prometheus text metrics |
| `GET` | `/metrics/snapshot` | JSON metrics snapshot |

## Architecture

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full production blueprint: data-flow diagrams, threshold math, edge-case handling, and benchmarking strategy.

```
Client → Embed → Cache Lookup → Router → Compressor → LLM → Async Cache Write
                ↳ cache hit → return immediately
```

Threshold auto-tuning pseudocode: `python -c "from semantic_layer.threshold import ThresholdTuner; print(ThresholdTuner.pseudocode())"`

Minimal standalone demo: `python semantic_layer/examples/minimal_pipeline.py`

## Package Layout

```
semantic_layer/
├── config.py          # Pydantic settings
├── embedder.py        # Sentence-transformers wrapper
├── threshold.py       # Adaptive cosine threshold tuner
├── cache.py           # FAISS cache + TTL/LRU
├── router.py          # Complexity-based routing
├── compressor.py      # RAG chunk filtering
├── orchestrator.py    # Pipeline coordinator (FastAPI)
├── benchmark.py       # Component latency benchmarks
├── metrics.py         # Prometheus helpers
├── main.py            # FastAPI entrypoint
└── backends/          # Ollama, llama.cpp, HuggingFace
```

## Integration with Battery Shop App

When **Ollama** is selected as the AI provider, the semantic layer starts **automatically** with the Express API server (`npm run dev`). No separate terminal or manual setup after the first run.

**First run only:** the server creates `.venv-semantic/` and installs Python deps (~1–2 min). After that, startup is fast.

**Wiring:**
- `npm run dev` — API + Vite + semantic layer (auto-started)
- `npm run semantic:setup` — manual one-time setup (optional; auto-runs on first start)
- Server: `server/services/ai/semanticLayerProcess.ts` (lifecycle)
- Client: `server/services/ai/semanticLayerClient.ts` (queries + fallback)
- RAG chunks: `server/services/ai/ragChunks.ts`

Chat and insights use semantic caching/routing transparently. Invoice OCR uses Ollama vision directly. If the semantic layer is unavailable, requests fall back to direct Ollama with no user action required.

Configure `SEMANTIC_LAYER_URL` or set `SEMANTIC_LAYER_AUTO_START=false` in `.env` to disable auto-start.
