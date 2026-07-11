import { Request, Response } from 'express';
import type { AiBusinessSnapshot, AiActionContext, AiChatMessage, AiSettings } from '../../types.ts';
import {
    createAiProvider,
    detectMimeType,
    resolveAiSettings,
    resolveOllamaModels,
} from '../services/ai/index.js';
import { checkSemanticLayerHealth } from '../services/ai/semanticLayerClient.js';
import { getActiveSemanticLayerUrl } from '../services/ai/semanticLayerProcess.js';

function getAiSettings(body: { aiSettings?: AiSettings }): AiSettings {
    const settings = body.aiSettings;
    if (!settings) {
        throw new Error('AI settings are required.');
    }
    return settings;
}

function assertAiEnabled(resolved: ReturnType<typeof resolveAiSettings>, res: Response): boolean {
    if (!resolved.enabled) {
        res.status(400).json({ error: 'AI assistant is disabled in settings.' });
        return false;
    }
    if (resolved.provider === 'gemini' && !resolved.geminiApiKey) {
        res.status(400).json({ error: 'Gemini API key is not configured.' });
        return false;
    }
    return true;
}

export async function extractPurchaseInvoiceHandler(req: Request, res: Response): Promise<void> {
    try {
        const { image, catalog } = req.body as {
            image?: string;
            aiSettings?: AiSettings;
            catalog?: { suppliers: { name: string }[]; productTypes: { brandName: string; name: string }[] };
        };

        if (!image || typeof image !== 'string') {
            res.status(400).json({ error: 'Image is required (base64, without data-URL prefix).' });
            return;
        }

        const resolved = resolveAiSettings(getAiSettings(req.body));
        if (!assertAiEnabled(resolved, res)) return;

        const provider = createAiProvider(resolved);
        const mimeType = detectMimeType(image);
        const result = await provider.extractPurchaseInvoice(image, mimeType, catalog);
        res.json(result);
    } catch (err) {
        console.error('AI extract-purchase-invoice error:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Invoice extraction failed.' });
    }
}

export async function insightsHandler(req: Request, res: Response): Promise<void> {
    try {
        const { period, businessSnapshot } = req.body as {
            aiSettings?: AiSettings;
            period?: string;
            businessSnapshot?: AiBusinessSnapshot;
        };

        if (!businessSnapshot) {
            res.status(400).json({ error: 'businessSnapshot is required.' });
            return;
        }

        const resolved = resolveAiSettings(getAiSettings(req.body));
        if (!assertAiEnabled(resolved, res)) return;

        const provider = createAiProvider(resolved);
        const periodLabel = period || businessSnapshot.period || 'current period';
        const result = await provider.generateInsights(businessSnapshot, periodLabel);
        res.json({ ...result, generatedAt: new Date().toISOString() });
    } catch (err) {
        console.error('AI insights error:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Insights generation failed.' });
    }
}

export async function testConnectionHandler(req: Request, res: Response): Promise<void> {
    try {
        const resolved = resolveAiSettings(getAiSettings(req.body));
        if (!resolved.enabled) {
            res.json({ ok: false, message: 'AI assistant is disabled. Enable it in Settings first.' });
            return;
        }
        if (resolved.provider === 'gemini' && !resolved.geminiApiKey) {
            res.json({ ok: false, message: 'Gemini API key is not configured.' });
            return;
        }

        const provider = createAiProvider(resolved);
        const result = await provider.testConnection();
        res.json(result);
    } catch (err) {
        console.error('AI test-connection error:', err);
        res.json({ ok: false, message: err instanceof Error ? err.message : 'Connection test failed.' });
    }
}

export async function semanticStatusHandler(req: Request, res: Response): Promise<void> {
    try {
        const settings = (req.body as { aiSettings?: AiSettings }).aiSettings;
        const resolved = settings ? resolveAiSettings(settings) : {
            semanticLayerEnabled: false,
            semanticLayerUrl: getActiveSemanticLayerUrl(),
        } as ReturnType<typeof resolveAiSettings>;

        if (!resolved.semanticLayerEnabled) {
            res.json({
                enabled: false,
                available: false,
                url: resolved.semanticLayerUrl,
                message: 'Smart caching applies only when Ollama is the AI provider.',
            });
            return;
        }

        const health = await checkSemanticLayerHealth(resolved.semanticLayerUrl);
        res.json({
            enabled: true,
            available: health.available,
            url: health.url,
            message: health.message,
            latencyMs: health.latencyMs,
        });
    } catch (err) {
        console.error('AI semantic-status error:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Semantic status check failed.' });
    }
}

export async function ollamaModelsHandler(req: Request, res: Response): Promise<void> {
    try {
        const { aiSettings } = req.body as { aiSettings?: AiSettings };
        const resolved = aiSettings ? resolveAiSettings(aiSettings) : resolveAiSettings({
            enabled: true,
            provider: 'ollama',
        });

        const models = await resolveOllamaModels({
            baseUrl: resolved.ollamaBaseUrl,
            visionModel: resolved.ollamaVisionModel,
            textModel: resolved.ollamaTextModel,
        });

        res.json({
            available: models.available,
            selected: {
                visionModel: models.visionModel,
                textModel: models.textModel,
                tierSmall: models.tierSmall,
                tierMedium: models.tierMedium,
                tierLarge: models.tierLarge,
            },
        });
    } catch (err) {
        console.error('AI ollama-models error:', err);
        res.status(502).json({
            error: err instanceof Error ? err.message : 'Failed to list Ollama models.',
            available: [],
        });
    }
}

export async function chatHandler(req: Request, res: Response): Promise<void> {
    try {
        const { messages, businessSnapshot, actionContext } = req.body as {
            aiSettings?: AiSettings;
            messages?: AiChatMessage[];
            businessSnapshot?: AiBusinessSnapshot;
            actionContext?: AiActionContext;
        };

        if (!businessSnapshot) {
            res.status(400).json({ error: 'businessSnapshot is required.' });
            return;
        }
        if (!actionContext) {
            res.status(400).json({ error: 'actionContext is required.' });
            return;
        }
        if (!messages?.length) {
            res.status(400).json({ error: 'At least one message is required.' });
            return;
        }
        if (messages[messages.length - 1]?.role !== 'user') {
            res.status(400).json({ error: 'Last message must be from the user.' });
            return;
        }

        const resolved = resolveAiSettings(getAiSettings(req.body));
        if (!assertAiEnabled(resolved, res)) return;

        const provider = createAiProvider(resolved);
        const result = await provider.chat(messages, businessSnapshot, actionContext);
        res.json(result);
    } catch (err) {
        console.error('AI chat error:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Chat request failed.' });
    }
}
