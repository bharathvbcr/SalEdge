# Semantic Layer — Production Architecture Blueprint

> **Target:** <15 ms p95 semantic-layer overhead (excluding LLM inference) on edge hardware.  
> **Stack:** `all-MiniLM-L6-v2` (384-d) + FAISS `IndexFlatIP` (default; optional ChromaDB backend) + adaptive threshold + tiered routing + RAG compression.

---

## System Architecture & Data Flow

### End-to-End Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT / API GATEWAY                               │
│                    POST /v1/query  { query, rag_chunks, session_id }            │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  STAGE 0: EMBEDDER SERVICE                                    ~3–8 ms (CPU p95)   │
│  ─────────────────────────────────────────────────────────────────────────────  │
│  SentenceTransformer(all-MiniLM-L6-v2) → L2-normalized 384-d vector             │
│  Warm-start on boot; OMP_NUM_THREADS=1 to avoid contention with LLM             │
│  OOD proxy: z-score of embedding L2 norm vs running Welford stats               │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ query_embedding, ood_score
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  STAGE 1: SEMANTIC CACHE (Vector DB Interceptor)              ~0.1–0.5 ms       │
│  ─────────────────────────────────────────────────────────────────────────────  │
│  FAISS IndexFlatIP top-10 search → cosine similarity sim                        │
│  τ_eff = clip(τ + γ·max(0, z_ood − δ), τ_min, τ_max)                           │
│                                                                                 │
│  IF sim ≥ τ_eff AND entry NOT expired → CACHE HIT → return response           │
│  ELSE → CACHE MISS → continue pipeline                                          │
└───────────────┬─────────────────────────────────────────┬───────────────────────┘
                │ CACHE HIT                               │ CACHE MISS
                ▼                                         ▼
         ┌──────────────┐                    ┌────────────────────────────────────┐
         │ Return cached│                    │ STAGE 2: SEMANTIC ROUTER  ~0.05 ms │
         │ response     │                    │ ────────────────────────────────── │
         │ (skip LLM)   │                    │ C(q) = w₁·f_len + w₂·f_ent         │
         └──────────────┘                    │      + w₃·f_syn + w₄·f_sem         │
                                             │ Route: SMALL (1–3B) | MED | LARGE  │
                                             └────────────────┬───────────────────┘
                                                              │
                                                              ▼
                                             ┌────────────────────────────────────┐
                                             │ STAGE 3: SEMANTIC COMPRESSOR       │
                                             │ ────────────────────────────────── │
                                             │ Score RAG chunks: rel = q·chunk    │
                                             │ Filter rel < θ_rel; pack by token  │
                                             │ budget (default 4096 tokens)       │
                                             └────────────────┬───────────────────┘
                                                              │
                                                              ▼
                                             ┌────────────────────────────────────┐
                                             │ STAGE 4: LLM INFERENCE ENGINE      │
                                             │ Ollama | llama.cpp | HuggingFace   │
                                             │ Model selected by router tier      │
                                             └────────────────┬───────────────────┘
                                                              │
                                                              ▼
                                             ┌────────────────────────────────────┐
                                             │ ASYNC CACHE WRITE (non-blocking)   │
                                             │ store(query, response, embedding)│
                                             │ TTL=24h, LRU eviction @ 10k entries│
                                             └────────────────────────────────────┘
```

### Component Interaction Matrix

| Component        | Input                          | Output                         | Latency Budget |
|-----------------|--------------------------------|--------------------------------|----------------|
| Embedder        | query string                   | 384-d unit vector, OOD z-score | 3–8 ms         |
| Semantic Cache  | query vector                   | hit/miss + cached response     | <1 ms          |
| Semantic Router | query + vector                 | model tier + gen params        | <0.1 ms        |
| Compressor      | query vector + RAG chunks      | filtered context block         | 1–5 ms*        |
| LLM Backend     | composed prompt                | generated text                 | 100 ms–30 s    |

\* Compressor latency scales with chunk count; batch embedding amortizes cost.

### Cache Hit Fast Path vs Full Path

```
FAST PATH (cache hit):
  Client → Embed → Cache Lookup → Response
  Semantic overhead ≈ embed_ms + cache_ms  (typically 4–9 ms)

FULL PATH (cache miss):
  Client → Embed → Cache Miss → Router → Compressor → LLM → Async Store
  Semantic overhead ≈ embed + cache + route + compress  (target <15 ms p95)
```

---

## Mathematical Optimization & Thresholding Logic

### Cosine Similarity (FAISS Inner Product)

Embeddings are L2-normalized before indexing. For unit vectors **u**, **v**:

```
cos(u, v) = u · v        (IndexFlatIP returns inner product directly)
sim ∈ [-1, 1], typically [0.5, 1.0] for paraphrase pairs
```

**Cache hit condition:**

```
HIT  ⟺  sim(q, q_cached) ≥ τ_eff(q)  ∧  entry NOT expired
MISS ⟺  otherwise
```

### Adaptive Threshold (Dual-Constraint Controller)

Base threshold **τ** is tuned online from feedback:

```
τ_eff(q) = clip( τ + γ · max(0, z_ood(q) − δ),  τ_min, τ_max )

where:
  z_ood(q) = |‖e(q)‖ − μ_norm| / σ_norm     (Welford running stats, n≥10)
  γ = 0.02   (OOD penalty gain)
  δ = 2.0    (OOD z-score deadband)
  τ_min = 0.82, τ_max = 0.98
```

**Feedback update (every MIN_SAMPLES=20 in window W=500):**

```
FPR_hat = count(valid=false) / |W|
HR_hat  = cache_hits / total_queries

IF FPR_hat > FPR* (0.01):
    τ ← τ + η · (FPR_hat − FPR*)          # raise threshold → fewer false positives
ELIF HR_hat < HR* (0.30) AND FPR_hat < FPR*/2:
    τ ← τ − η · (HR* − HR_hat)            # lower threshold → more hits (safe regime)

τ ← clip(τ, τ_min, τ_max)
η = 0.005 (learning rate)
```

### Complexity Score for Routing

```
C(q) = clip( w₁·f_len + w₂·f_ent + w₃·f_syn + w₄·f_sem , 0, 1 )

f_len = min(1, |tokens| / 512)
f_ent = min(1, H(q) / 8)                    Shannon entropy, bits
f_syn = syntactic_heuristics(q) / 5         code blocks, reasoning verbs, multi-step
f_sem = max_i ( prototype_i · e(q) )        similarity to "hard query" prototypes

Routing:
   C < 0.4  → SMALL   (256 tokens, T=0.3)
   C < 0.7  → MEDIUM  (1024 tokens, T=0.5)
   C ≥ 0.7  → LARGE   (4096 tokens, T=0.7)

Tier models are NOT fixed: they are discovered at startup from the Ollama
model catalog (/api/tags) — smallest/median/largest completion-capable model
per tier — or pinned via SEMANTIC_TIER_SMALL_MODEL / _MEDIUM_ / _LARGE_ env
vars. If discovery fails, tiers fall back to unassigned and requests fail at
the inference stage instead of crashing startup.
```

### RAG Context Compression

For chunk **cᵢ** with embedding **vᵢ** and query **q**:

```
rel_i = q · v_i                           (cosine, both normalized)
Keep cᵢ IF rel_i ≥ θ_rel (default 0.35)
Pack greedily by descending rel_i until Σ tokens ≤ budget (4096)
Guarantee min_chunks=1 (top chunk always kept if any pass filter)
```

### Threshold Selection Heuristics (Cold Start)

| Scenario              | Initial τ | Rationale                                      |
|-----------------------|-----------|------------------------------------------------|
| Factual Q&A (shop app)| 0.88      | High precision; paraphrases cluster tightly    |
| Creative generation   | 0.92–0.95 | Lower tolerance for semantic drift             |
| Code assistance       | 0.90      | Syntax changes invalidate cache quickly        |
| Empty cache           | N/A       | All queries miss; τ irrelevant until feedback  |

---

## Production-Grade Python Implementation

The implementation lives in `semantic_layer/`. Key modules:

| Module            | Responsibility                                      |
|-------------------|-----------------------------------------------------|
| `embedder.py`     | SentenceTransformer wrapper, warm-start, OOD score |
| `cache.py`        | FAISS cache, TTL, LRU, ChromaDB optional backend    |
| `threshold.py`    | Adaptive τ controller with feedback loop            |
| `router.py`       | Complexity scoring, tier selection                    |
| `compressor.py`   | RAG relevance filtering + token budget packing      |
| `orchestrator.py` | Pipeline coordinator with latency budget enforcement|
| `ollama_discovery.py` | Tier-model discovery from the Ollama `/api/tags` catalog |
| `main.py`         | FastAPI server (port 8090)                          |
| `benchmark.py`    | Per-component latency harness                       |

### Minimal Standalone Usage

```python
from semantic_layer import (
    EmbedderService, SemanticCache, SemanticRouter,
    SemanticCompressor, SemanticOrchestrator, PipelineRequest,
)

embedder = EmbedderService(device="cpu")
cache = SemanticCache(initial_threshold=0.88)
router = SemanticRouter()
compressor = SemanticCompressor(embedder=embedder)

def mock_llm(**kwargs) -> str:
    return f"[{kwargs['model']}] response to prompt"

orch = SemanticOrchestrator(
    embedder=embedder, cache=cache, router=router,
    compressor=compressor, inference_fn=mock_llm,
)
orch.initialize()

result = orch.run(PipelineRequest(query="What is the warranty on Exide 150Ah?"))
print(result.cache_hit, result.model_id, result.semantic_latency_ms)
```

### API Integration

```bash
curl -X POST http://127.0.0.1:8090/v1/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What batteries are low in stock?", "rag_chunks": []}'
```

### Cache Invalidation Strategy

1. **TTL (time-to-live):** Default 86,400 s (24 h). Expired entries purged on lookup/store.
2. **LRU eviction:** When `len(entries) ≥ max_entries` (10,000), evict oldest by access order.
3. **Index rebuild:** Triggered after every 500 removals since the last rebuild (or when the index empties) to keep FAISS consistent. Lookups inspect the top-10 neighbours and skip tombstoned vectors left in the index between rebuilds.
4. **Feedback invalidation:** False-positive feedback raises τ AND deletes the flagged entry so it is not served again.
5. **Context scoping:** Each entry stores a `context_key` fingerprint of the RAG chunks present at store time; a lookup only hits when the request carries the *same* context. Identical questions over different business data or reporting periods never share a stale cached answer.
6. **Persistence:** JSON files per entry in `cache_dir` (written atomically via tmp-file + rename); rebuilt into FAISS on startup; expired/corrupt files are removed at load time.

---

## Resource Management & Benchmarking Strategy

### VRAM / RAM Allocation

```
┌─────────────────────────────────────────────────────────────┐
│  EDGE DEVICE (example: 16 GB RAM, 8 GB VRAM)               │
├─────────────────────────────────────────────────────────────┤
│  Embedder (CPU, INT8 optional)     ~90 MB RAM               │
│  FAISS index (10k × 384-d × 4 B)   ~15 MB RAM               │
│  LLM SMALL (phi3:mini Q4)          ~2 GB VRAM               │
│  LLM MEDIUM (llama3.2:3b Q4)       ~2.5 GB VRAM             │
│  LLM LARGE (llama3.1:8b Q4)        ~5 GB VRAM               │
└─────────────────────────────────────────────────────────────┘

Resource contention mitigation:
  • Embedder on CPU (SEMANTIC_EMBEDDER_DEVICE=cpu) — keeps GPU for LLM
  • OMP_NUM_THREADS=1 for embedder — avoids thread starvation
  • Async cache writes — inference path never blocks on disk I/O
  • Ollama model unloading — only one tier loaded at a time via router
```

### Latency Budget Breakdown (p95 targets)

| Stage              | CPU p95  | GPU embed p95 | Notes                    |
|--------------------|----------|---------------|--------------------------|
| Embedder           | 3–8 ms   | 1–3 ms        | Dominates semantic cost  |
| Cache lookup       | <0.5 ms  | <0.5 ms       | FAISS flat index         |
| Router             | <0.1 ms  | <0.1 ms       | Pure Python heuristics   |
| Threshold          | <0.01 ms | <0.01 ms      | Scalar math              |
| Compressor (32 ch) | 2–5 ms   | 1–3 ms        | Batch embed chunks       |
| **Total semantic** | **<15 ms** | **<12 ms** | Budget enforced in orchestrator |

### Benchmark Commands

```bash
# Component benchmarks (no LLM)
npm run semantic:benchmark -- --skip-embedder
npm run semantic:benchmark -- --component threshold

# Full pipeline (mock inference)
python benchmarks/semantic_benchmark.py --mock-inference

# Prometheus metrics
curl http://127.0.0.1:8090/metrics
curl http://127.0.0.1:8090/metrics/snapshot
```

### Key Metrics to Monitor

| Metric                              | Alert Threshold        | Action                          |
|-------------------------------------|------------------------|---------------------------------|
| `semantic_embed_latency_ms{p95}`    | >10 ms                 | Check CPU load, reduce threads  |
| `semantic_cache_hit_rate`           | <10% after warm-up     | Lower τ if FPR acceptable       |
| `semantic_cache_false_positive_total`| >1% of hits           | Raise τ, review OOD penalty     |
| `semantic_budget_violation_total`   | >5% of requests        | Profile compressor chunk count  |
| `semantic_llm_inference_latency_ms` | tier-dependent         | Router may be over-provisioning |

---

## Edge Cases & Failure Modes

### Out-of-Distribution (OOD) Queries

**Problem:** Embedding model trained on general text may produce unreliable similarity for domain jargon, code, or multilingual input.

**Mitigation (implemented):**
- Track L2 norm distribution via Welford online stats
- Compute `z_ood = |‖e‖ − μ| / σ`
- Raise effective threshold: `τ_eff += γ · max(0, z_ood − δ)`
- OOD queries require higher similarity to hit cache → fewer false positives

**Fallback:** If OOD score persistently high (>5σ), bypass cache entirely (configurable extension).

### Cold Start (Empty Cache)

**Behavior:**
- FAISS index `ntotal == 0` → immediate miss (<0.1 ms)
- All queries route through full pipeline
- Responses stored asynchronously after first inference
- Hit rate climbs over 24–48 h as paraphrase clusters form

**Optimization:** Pre-seed cache with FAQ pairs from domain knowledge base at deploy time.

### Hardware Resource Contention

**Problem:** Embedder and LLM compete for GPU memory/compute.

**Mitigation:**
| Strategy                    | Config / Code                              |
|----------------------------|--------------------------------------------|
| CPU embedder               | `SEMANTIC_EMBEDDER_DEVICE=cpu`             |
| Single-threaded BLAS       | `OMP_NUM_THREADS=1` in `embedder.py`       |
| Async cache writes         | `SEMANTIC_ASYNC_CACHE_WRITE=true`          |
| Tiered model loading       | Ollama unloads unused models automatically |
| Batch RAG embedding        | `embed_batch()` in compressor              |

### False Positive Cache Hits

**Detection:** User feedback via `POST /v1/cache/feedback { was_valid: false }`

**Response:**
1. Increment `semantic_cache_false_positive_total`
2. Feed into `ThresholdTuner.record_feedback()` → raises τ
3. Invalidate (delete) the flagged entry by ID so the same wrong answer is never served again

### Stale Cache Entries

**Detection:** TTL expiry (24 h default) or business rule changes (manual cache clear).

**Response:** `_purge_expired()` on every lookup/store; LRU rebuild when evicting.

### Backend Unavailable

**Behavior:** `health_check()` warns at startup; inference fails with HTTP 500 from backend.
**Fallback:** Node.js app (`semanticLayerClient.ts`) falls back to direct Ollama if semantic layer unreachable.

**Stale-process guard:** `GET /health` echoes an `instance` token from `SEMANTIC_INSTANCE_TOKEN`, so the Node launcher can verify it reached *its own* child process rather than a stale orphan of a previous app version occupying the port.

---

## Deployment Checklist

- [ ] `npm run semantic:setup` — install Python deps
- [ ] Pull Ollama models: `phi3:mini`, `llama3.2:3b`, `llama3.1:8b`
- [ ] Set `SEMANTIC_EMBEDDER_DEVICE=cpu` on GPU-constrained edge nodes
- [ ] Configure `SEMANTIC_SIMILARITY_THRESHOLD` for domain (start 0.88)
- [ ] Enable semantic layer in app Settings → AI Assistant
- [ ] Run `python benchmarks/semantic_benchmark.py --mock-inference` to validate p95
- [ ] Monitor `/metrics` for hit rate and false positives after 24 h production traffic
