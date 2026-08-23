import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AiBusinessSnapshot, AiActionContext, AiChatMessage, AiChatResult, AiInsightsResult, PurchaseExtractionResult } from '../../../types.ts';
import { buildChatPrompt, buildInsightsPrompt, buildInvoiceExtractionPrompt, TEST_CONNECTION_PROMPT } from './prompts.js';
import { parseJsonFromText, parseChatResponseText, validateInsights, validatePurchaseExtraction } from './jsonUtils.js';
import type { AiProvider, ResolvedAiSettings } from './types.js';

export function createGeminiProvider(settings: ResolvedAiSettings): AiProvider {
    const apiKey = settings.geminiApiKey;
    if (!apiKey) {
        throw new Error('Gemini API key is not configured.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = settings.geminiModel;

    async function generateText(prompt: string, image?: { data: string; mimeType: string }): Promise<string> {
        // Deterministic, bounded, JSON-typed output for what is a structured
        // extraction task (defaults are temperature 1 + prose-friendly).
        const model = genAI.getGenerativeModel(
            {
                model: modelName,
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 4096,
                    responseMimeType: 'application/json',
                },
            },
            { timeout: 120_000 }
        );
        const parts: Array<string | { inlineData: { data: string; mimeType: string } }> = [prompt];
        if (image) {
            parts.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
        }
        const result = await model.generateContent(parts);
        const text = result.response.text();
        if (!text) throw new Error('Empty response from Gemini.');
        return text;
    }

    return {
        async testConnection() {
            try {
                const text = await generateText(TEST_CONNECTION_PROMPT);
                parseJsonFromText(text);
                return { ok: true, message: `Connected to Gemini (${modelName}).` };
            } catch (err) {
                return { ok: false, message: err instanceof Error ? err.message : 'Gemini connection failed.' };
            }
        },

        async extractPurchaseInvoice(imageBase64, mimeType, catalog) {
            const prompt = buildInvoiceExtractionPrompt(catalog);
            const text = await generateText(prompt, { data: imageBase64, mimeType });
            return validatePurchaseExtraction(parseJsonFromText(text));
        },

        async generateInsights(snapshot: AiBusinessSnapshot, periodLabel: string): Promise<AiInsightsResult> {
            const prompt = buildInsightsPrompt(snapshot, periodLabel);
            const text = await generateText(prompt);
            return validateInsights(parseJsonFromText(text));
        },

        async chat(messages: AiChatMessage[], snapshot: AiBusinessSnapshot, actionContext: AiActionContext): Promise<AiChatResult> {
            if (messages.length === 0) {
                throw new Error('At least one message is required.');
            }
            const prompt = buildChatPrompt(snapshot, actionContext, messages, { redactPii: true });
            const text = await generateText(prompt);
            return parseChatResponseText(text);
        },
    };
}
