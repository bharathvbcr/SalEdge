import type { AiSettings, AiActionContext, AiBusinessSnapshot, AiChatMessage, AiChatResult, AiInsightsResult, PurchaseExtractionResult } from '../../../types.ts';

export interface ResolvedAiSettings {
    enabled: boolean;
    provider: 'gemini' | 'ollama';
    geminiApiKey?: string;
    geminiModel: string;
    ollamaBaseUrl: string;
    ollamaVisionModel: string;
    ollamaTextModel: string;
    semanticLayerEnabled: boolean;
    semanticLayerUrl: string;
}

export interface AiProvider {
    testConnection(): Promise<{ ok: boolean; message: string }>;
    extractPurchaseInvoice(
        imageBase64: string,
        mimeType: string,
        catalog?: { suppliers: { name: string }[]; productTypes: { brandName: string; name: string }[] },
    ): Promise<PurchaseExtractionResult>;
    generateInsights(snapshot: AiBusinessSnapshot, periodLabel: string): Promise<AiInsightsResult>;
    chat(messages: AiChatMessage[], snapshot: AiBusinessSnapshot, actionContext: AiActionContext): Promise<AiChatResult>;
}

export type { AiSettings, AiBusinessSnapshot, AiInsightsResult, PurchaseExtractionResult };
