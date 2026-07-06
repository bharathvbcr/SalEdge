import type { AiBusinessSnapshot, AiActionContext, AiChatMessage, AiChatResult, AiInsightsResult, PurchaseExtractionResult } from '../../../types.ts';
import { CHAT_SYSTEM, INSIGHTS_SYSTEM, buildChatPrompt, buildInsightsPrompt, buildInvoiceExtractionPrompt, TEST_CONNECTION_PROMPT } from './prompts.js';
import { parseJsonFromText, parseChatResponseText, validateInsights, validatePurchaseExtraction } from './jsonUtils.js';
import { buildChatRagChunks, buildInsightsRagChunks } from './ragChunks.js';
import { checkSemanticLayerHealth, semanticLayerQuery } from './semanticLayerClient.js';
import type { AiProvider, ResolvedAiSettings } from './types.js';

interface OllamaChatResponse {
    message?: { content?: string };
    error?: string;
}

async function ollamaChat(
    baseUrl: string,
    model: string,
    messages: { role: string; content: string; images?: string[] }[],
    options?: { jsonFormat?: boolean },
): Promise<string> {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages,
            stream: false,
            ...(options?.jsonFormat ? { format: 'json' } : {}),
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Ollama error (${res.status}): ${body || res.statusText}`);
    }

    const data = await res.json() as OllamaChatResponse;
    if (data.error) throw new Error(data.error);
    const content = data.message?.content;
    if (!content) throw new Error('Empty response from Ollama.');
    return content;
}

async function withSemanticFallback<T>(
    settings: ResolvedAiSettings,
    semanticFn: () => Promise<T>,
    directFn: () => Promise<T>,
): Promise<T> {
    if (!settings.semanticLayerEnabled) {
        return directFn();
    }
    try {
        return await semanticFn();
    } catch (err) {
        console.warn('Semantic layer unavailable, falling back to direct Ollama:', err);
        return directFn();
    }
}

export function createOllamaProvider(settings: ResolvedAiSettings): AiProvider {
    const baseUrl = settings.ollamaBaseUrl;
    const visionModel = settings.ollamaVisionModel;

    return {
        async testConnection() {
            const checks: string[] = [];

            if (settings.semanticLayerEnabled) {
                const semanticHealth = await checkSemanticLayerHealth(settings.semanticLayerUrl);
                checks.push(
                    semanticHealth.available
                        ? 'Smart caching is active.'
                        : 'Smart caching is starting — responses work via Ollama until ready.',
                );
            }

            try {
                const text = await ollamaChat(baseUrl, visionModel, [
                    { role: 'user', content: TEST_CONNECTION_PROMPT },
                ], { jsonFormat: true });
                parseJsonFromText(text);
                const ollamaMsg = `Connected to Ollama (${visionModel}).`;
                return {
                    ok: true,
                    message: checks.length ? `${checks.join(' ')} ${ollamaMsg}` : ollamaMsg,
                };
            } catch (err) {
                return { ok: false, message: err instanceof Error ? err.message : 'Ollama connection failed.' };
            }
        },

        async extractPurchaseInvoice(imageBase64, mimeType, catalog): Promise<PurchaseExtractionResult> {
            void mimeType;
            const prompt = buildInvoiceExtractionPrompt(catalog);
            const text = await ollamaChat(baseUrl, visionModel, [
                { role: 'user', content: prompt, images: [imageBase64] },
            ], { jsonFormat: true });
            return validatePurchaseExtraction(parseJsonFromText(text));
        },

        async generateInsights(snapshot: AiBusinessSnapshot, periodLabel: string): Promise<AiInsightsResult> {
            return withSemanticFallback(
                settings,
                async () => {
                    const result = await semanticLayerQuery(settings.semanticLayerUrl, {
                        query: `Period: ${periodLabel}\n\nProduce actionable battery-shop business insights as JSON per the system instructions.`,
                        rag_chunks: buildInsightsRagChunks(snapshot),
                        system_prompt: INSIGHTS_SYSTEM,
                    });
                    return validateInsights(parseJsonFromText(result.response));
                },
                async () => {
                    const prompt = buildInsightsPrompt(snapshot, periodLabel);
                    const text = await ollamaChat(baseUrl, visionModel, [
                        { role: 'user', content: prompt },
                    ], { jsonFormat: true });
                    return validateInsights(parseJsonFromText(text));
                },
            );
        },

        async chat(messages: AiChatMessage[], snapshot: AiBusinessSnapshot, actionContext: AiActionContext): Promise<AiChatResult> {
            if (messages.length === 0) {
                throw new Error('At least one message is required.');
            }

            return withSemanticFallback(
                settings,
                async () => {
                    const latest = messages[messages.length - 1]?.content ?? '';
                    const result = await semanticLayerQuery(settings.semanticLayerUrl, {
                        query: `${latest}\n\nRespond with JSON only:`,
                        rag_chunks: buildChatRagChunks(snapshot, actionContext, messages),
                        system_prompt: CHAT_SYSTEM,
                    });
                    return parseChatResponseText(result.response);
                },
                async () => {
                    const prompt = buildChatPrompt(snapshot, actionContext, messages);
                    const text = await ollamaChat(baseUrl, visionModel, [
                        { role: 'user', content: prompt },
                    ], { jsonFormat: true });
                    return parseChatResponseText(text);
                },
            );
        },
    };
}
