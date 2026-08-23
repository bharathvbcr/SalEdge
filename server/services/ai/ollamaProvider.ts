import type { AiBusinessSnapshot, AiActionContext, AiChatMessage, AiChatResult, AiInsightsResult, PurchaseExtractionResult } from '../../../types.ts';
import { CHAT_SYSTEM, INSIGHTS_SYSTEM, buildChatPrompt, buildInsightsPrompt, buildInvoiceExtractionPrompt, TEST_CONNECTION_PROMPT } from './prompts.js';
import { parseJsonFromText, parseChatResponseText, validateInsights, validatePurchaseExtraction } from './jsonUtils.js';
import { buildChatRagChunks, buildInsightsRagChunks } from './ragChunks.js';
import { checkSemanticLayerHealth, semanticLayerQuery } from './semanticLayerClient.js';
import { clearOllamaModelCache, isVisionCapableModel, resolveOllamaModels, type ResolvedOllamaModels } from './ollamaModels.js';
import type { AiProvider, ResolvedAiSettings } from './types.js';

interface OllamaChatResponse {
    message?: { content?: string };
    error?: string;
}

const CHAT_TIMEOUT_MS = 120_000;
const VISION_TIMEOUT_MS = 180_000;

async function ollamaChat(
    baseUrl: string,
    model: string,
    messages: { role: string; content: string; images?: string[] }[],
    options?: { jsonFormat?: boolean },
): Promise<string> {
    const hasImages = messages.some(m => m.images && m.images.length > 0);
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Bound generation so a wedged model load can't hang API requests.
        signal: AbortSignal.timeout(hasImages ? VISION_TIMEOUT_MS : CHAT_TIMEOUT_MS),
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

async function resolveModels(settings: ResolvedAiSettings): Promise<ResolvedOllamaModels> {
    return resolveOllamaModels({
        baseUrl: settings.ollamaBaseUrl,
        visionModel: settings.ollamaVisionModel,
        textModel: settings.ollamaTextModel,
    });
}

async function withSemanticFallback<T>(
    settings: ResolvedAiSettings,
    models: ResolvedOllamaModels,
    semanticFn: () => Promise<T>,
    directFn: () => Promise<T>,
    op: string,
): Promise<T> {
    if (!settings.semanticLayerEnabled) {
        return directFn();
    }
    try {
        const result = await semanticFn();
        return result;
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn('Semantic layer unavailable, falling back to direct Ollama:', err);
        return directFn();
    }
}

export function createOllamaProvider(settings: ResolvedAiSettings): AiProvider {
    const baseUrl = settings.ollamaBaseUrl;

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
                clearOllamaModelCache(baseUrl);
                const models = await resolveModels(settings);
                const text = await ollamaChat(baseUrl, models.textModel, [
                    { role: 'user', content: TEST_CONNECTION_PROMPT },
                ], { jsonFormat: true });
                parseJsonFromText(text);

                const modelSummary = `Text: ${models.textModel}, Vision: ${models.visionModel} (${models.available.length} model${models.available.length === 1 ? '' : 's'} available).`;
                const ollamaMsg = `Connected to Ollama. Using ${modelSummary}`;
                return {
                    ok: true,
                    message: checks.length ? `${checks.join(' ')} ${ollamaMsg}` : ollamaMsg,
                };
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : 'Ollama connection failed.';
                return { ok: false, message: errMsg };
            }
        },

        async extractPurchaseInvoice(imageBase64, mimeType, catalog): Promise<PurchaseExtractionResult> {
            void mimeType;
            const models = await resolveModels(settings);

            // Sending an invoice to a TEXT-only model yields hallucinated
            // bills that look legitimate — hard-fail instead.
            if (!isVisionCapableModel(models.visionModel)) {
                throw new Error(
                    `No vision-capable Ollama model found (selected "${models.visionModel}" cannot read images). ` +
                    'Install one, e.g.: ollama pull llama3.2-vision'
                );
            }

            const prompt = buildInvoiceExtractionPrompt(catalog);
            const text = await ollamaChat(baseUrl, models.visionModel, [
                { role: 'user', content: prompt, images: [imageBase64] },
            ], { jsonFormat: true });
            return validatePurchaseExtraction(parseJsonFromText(text));
        },

        async generateInsights(snapshot: AiBusinessSnapshot, periodLabel: string): Promise<AiInsightsResult> {
            const models = await resolveModels(settings);
            return withSemanticFallback(
                settings,
                models,
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
                    const text = await ollamaChat(baseUrl, models.textModel, [
                        { role: 'user', content: prompt },
                    ], { jsonFormat: true });
                    return validateInsights(parseJsonFromText(text));
                },
                'generateInsights',
            );
        },

        async chat(messages: AiChatMessage[], snapshot: AiBusinessSnapshot, actionContext: AiActionContext): Promise<AiChatResult> {
            if (messages.length === 0) {
                throw new Error('At least one message is required.');
            }

            const models = await resolveModels(settings);
            return withSemanticFallback(
                settings,
                models,
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
                    const text = await ollamaChat(baseUrl, models.textModel, [
                        { role: 'user', content: prompt },
                    ], { jsonFormat: true });
                    return parseChatResponseText(text);
                },
                'chat',
            );
        },
    };
}
