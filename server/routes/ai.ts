import { Request, Response } from 'express';
import type { AiBusinessSnapshot, AiActionContext, AiChatMessage, AiSettings, PurchaseExtractionResult } from '../../types.ts';
import {
    clearOllamaModelCache,
    createAiProvider,
    detectMimeType,
    fetchOllamaModelNames,
    resolveAiSettings,
    resolveOllamaModels,
} from '../services/ai/index.js';
import { checkSemanticLayerHealth } from '../services/ai/semanticLayerClient.js';
import { getActiveSemanticLayerUrl } from '../services/ai/semanticLayerProcess.js';
import { getSecret } from './secrets.js';
import crypto from 'crypto';

// Vision extraction is expensive; identical re-scans ("Re-extract", repeat
// uploads) replay the cached result instead of repaying full token cost.
const EXTRACTION_CACHE_MAX = 20;
const extractionCache = new Map<string, { result: PurchaseExtractionResult; at: number }>();

function cacheKey(imageBase64: string): string {
    return crypto.createHash('sha256').update(imageBase64).digest('hex');
}

function getCachedExtraction(key: string): PurchaseExtractionResult | undefined {
    const hit = extractionCache.get(key);
    if (!hit) return undefined;
    // Refresh recency for LRU ordering.
    extractionCache.delete(key);
    extractionCache.set(key, hit);
    return hit.result;
}

function storeCachedExtraction(key: string, result: PurchaseExtractionResult): void {
    if (extractionCache.size >= EXTRACTION_CACHE_MAX) {
        const oldest = extractionCache.keys().next().value;
        if (oldest !== undefined) extractionCache.delete(oldest);
    }
    extractionCache.set(key, { result, at: Date.now() });
}

function getAiSettings(body: { aiSettings?: AiSettings }): AiSettings {
    const settings = body.aiSettings;
    if (!settings) {
        throw new Error('AI settings are required.');
    }
    // Client-supplied credentials are never trusted — the Gemini key lives
    // server-side (_secrets store or env). See applyStoredSecret below.
    return { ...settings, geminiApiKey: undefined };
}

function resolveSettingsSecure(body: { aiSettings?: AiSettings }) {
    const resolved = resolveAiSettings(getAiSettings(body));
    const stored = getSecret('geminiApiKey');
    return {
        ...resolved,
        geminiApiKey: stored ?? (process.env.GEMINI_API_KEY?.trim() || undefined),
    };
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

        const resolved = resolveSettingsSecure(req.body);
        if (!assertAiEnabled(resolved, res)) return;

        const key = cacheKey(image);
        const cached = getCachedExtraction(key);
        if (cached) {
            res.json({ ...cached, warnings: [...cached.warnings, 'Served from extraction cache (identical image).'] });
            return;
        }

        const provider = createAiProvider(resolved);
        const mimeType = detectMimeType(image);
        const result = await provider.extractPurchaseInvoice(image, mimeType, catalog);
        storeCachedExtraction(key, result);
        res.json(result);
    } catch (err) {
        console.error('AI extract-purchase-invoice error:', err);
        res.status(500).json({ error: 'Invoice extraction failed. Check AI settings and connectivity.' });
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

        const resolved = resolveSettingsSecure(req.body);
        if (!assertAiEnabled(resolved, res)) return;

        const provider = createAiProvider(resolved);
        const periodLabel = period || businessSnapshot.period || 'current period';
        const result = await provider.generateInsights(businessSnapshot, periodLabel);
        res.json({ ...result, generatedAt: new Date().toISOString() });
    } catch (err) {
        console.error('AI insights error:', err);
        res.status(500).json({ error: 'Insights generation failed. Check AI settings and connectivity.' });
    }
}

export async function testConnectionHandler(req: Request, res: Response): Promise<void> {
    try {
        const resolved = resolveSettingsSecure(req.body);
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
        res.status(500).json({ error: 'Semantic status check failed.' });
    }
}

export async function ollamaModelsHandler(req: Request, res: Response): Promise<void> {
    try {
        const { aiSettings } = req.body as { aiSettings?: AiSettings };
        const resolved = aiSettings ? resolveAiSettings(aiSettings) : resolveAiSettings({
            enabled: true,
            provider: 'ollama',
        });

        // Settings refresh should see newly pulled models, not a stale 30s cache.
        clearOllamaModelCache(resolved.ollamaBaseUrl);
        const available = await fetchOllamaModelNames(resolved.ollamaBaseUrl);
        const models = await resolveOllamaModels({
            baseUrl: resolved.ollamaBaseUrl,
            visionModel: resolved.ollamaVisionModel,
            textModel: resolved.ollamaTextModel,
        });

        res.json({
            available,
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
            error: 'Could not reach Ollama. Verify it is running at the configured URL.',
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

        const resolved = resolveSettingsSecure(req.body);
        if (!assertAiEnabled(resolved, res)) return;

        const provider = createAiProvider(resolved);
        const result = await provider.chat(messages, businessSnapshot, actionContext);
        res.json(result);
    } catch (err) {
        console.error('AI chat error:', err);
        res.status(500).json({ error: 'Chat request failed. Check AI settings and connectivity.' });
    }
}
