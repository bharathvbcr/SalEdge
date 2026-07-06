/**
 * Frontend types and helpers for the semantic layer integration.
 * Text AI requests are routed server-side through /api/ai/* when Ollama + semantic layer are enabled.
 */

export interface SemanticLayerStatus {
    enabled: boolean;
    available: boolean;
    url: string;
    message: string;
    latencyMs?: number;
}

export async function fetchSemanticLayerStatus(): Promise<SemanticLayerStatus> {
    const res = await fetch('/api/ai/semantic-status');
    if (!res.ok) {
        let message = `Status check failed (${res.status})`;
        try {
            const body = await res.json();
            if (body.error) message = body.error;
        } catch { /* ignore */ }
        throw new Error(message);
    }
    return res.json() as Promise<SemanticLayerStatus>;
}
