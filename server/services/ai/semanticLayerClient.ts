export interface SemanticRagChunk {
    id: string;
    text: string;
    metadata?: Record<string, unknown>;
}

export interface SemanticQueryRequest {
    query: string;
    rag_chunks?: SemanticRagChunk[];
    system_prompt?: string;
    session_id?: string;
}

export interface SemanticQueryResponse {
    response: string;
    cache_hit: boolean;
    model_id: string;
    complexity_score: number;
    semantic_latency_ms: number;
    total_latency_ms: number;
    diagnostics: Record<string, unknown>;
}

export interface SemanticHealthStatus {
    available: boolean;
    url: string;
    message: string;
    latencyMs?: number;
}

function normalizeBaseUrl(url: string): string {
    return url.replace(/\/$/, '');
}

export async function checkSemanticLayerHealth(
    baseUrl: string,
    timeoutMs = 3000,
): Promise<SemanticHealthStatus> {
    const url = normalizeBaseUrl(baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();

    try {
        const res = await fetch(`${url}/health`, { signal: controller.signal });
        const latencyMs = Date.now() - started;
        if (!res.ok) {
            // #region agent log
            fetch('http://127.0.0.1:7410/ingest/11210a20-398c-4579-9076-302a1d1ea18d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a96a9c'},body:JSON.stringify({sessionId:'a96a9c',runId:'audit',hypothesisId:'H1',location:'server/services/ai/semanticLayerClient.ts:checkSemanticLayerHealth',message:'Health check HTTP error',data:{url,status:res.status,latencyMs},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            return {
                available: false,
                url,
                message: `Semantic layer health check failed (${res.status}).`,
                latencyMs,
            };
        }
        const bodyText = await res.text().catch(() => '');
        let bodyJson: Record<string, unknown> = {};
        try { bodyJson = JSON.parse(bodyText) as Record<string, unknown>; } catch { /* ignore */ }
        const isBsmsSemantic = bodyJson.status === 'ok' && !('service' in bodyJson);
        // #region agent log
        fetch('http://127.0.0.1:7410/ingest/11210a20-398c-4579-9076-302a1d1ea18d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a96a9c'},body:JSON.stringify({sessionId:'a96a9c',runId:'audit',hypothesisId:'H1',location:'server/services/ai/semanticLayerClient.ts:checkSemanticLayerHealth',message:'Health check body inspected',data:{url,latencyMs,isBsmsSemantic,bodyKeys:Object.keys(bodyJson),foreignService:typeof bodyJson.service==='string'?bodyJson.service:null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (!isBsmsSemantic) {
            return {
                available: false,
                url,
                message: `Port ${url} is occupied by another service (${String(bodyJson.service ?? 'unknown')}), not the BSMS semantic layer.`,
                latencyMs,
            };
        }
        return {
            available: true,
            url,
            message: `Semantic layer is healthy (${url}).`,
            latencyMs,
        };
    } catch (err) {
        const message =
            err instanceof Error && err.name === 'AbortError'
                ? `Semantic layer timed out after ${timeoutMs}ms (${url}).`
                : `Semantic layer unreachable at ${url}: ${err instanceof Error ? err.message : 'connection failed'}`;
        return { available: false, url, message };
    } finally {
        clearTimeout(timer);
    }
}

export async function semanticLayerQuery(
    baseUrl: string,
    body: SemanticQueryRequest,
    timeoutMs = 120_000,
): Promise<SemanticQueryResponse> {
    const url = normalizeBaseUrl(baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(`${url}/v1/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: body.query,
                rag_chunks: body.rag_chunks ?? [],
                system_prompt: body.system_prompt ?? 'You are a helpful assistant.',
                session_id: body.session_id,
            }),
            signal: controller.signal,
        });

        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Semantic layer error (${res.status}): ${detail || res.statusText}`);
        }

        return (await res.json()) as SemanticQueryResponse;
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(`Semantic layer query timed out after ${timeoutMs}ms.`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}
