import type { AiSettings } from '../../../types.ts';
import { createGeminiProvider } from './geminiProvider.js';
import { createOllamaProvider } from './ollamaProvider.js';
import { getActiveSemanticLayerUrl } from './semanticLayerProcess.js';
import type { AiProvider, ResolvedAiSettings } from './types.js';

export { parseJsonFromText, validatePurchaseExtraction, validateInsights, detectMimeType } from './jsonUtils.js';
export {
    fetchOllamaModelNames,
    resolveOllamaModels,
    resolveModelsFromList,
    type ResolvedOllamaModels,
} from './ollamaModels.js';

function parseBoolEnv(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined || value === '') return defaultValue;
    return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

export function resolveAiSettings(settings: AiSettings): ResolvedAiSettings {
    const semanticLayerUrl =
        settings.semanticLayerUrl?.trim()
        || getActiveSemanticLayerUrl();

    const semanticLayerEnabled =
        settings.provider === 'ollama'
        && parseBoolEnv(process.env.SEMANTIC_LAYER_ENABLED, true);

    // #region agent log
    fetch('http://127.0.0.1:7410/ingest/11210a20-398c-4579-9076-302a1d1ea18d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a96a9c'},body:JSON.stringify({sessionId:'a96a9c',runId:'audit',hypothesisId:'H4-H7',location:'server/services/ai/index.ts:resolveAiSettings',message:'Resolved AI settings',data:{enabled:settings.enabled,provider:settings.provider,ollamaBaseUrl:settings.ollamaBaseUrl?.trim()||process.env.OLLAMA_BASE_URL?.trim()||'http://127.0.0.1:11434',ollamaVisionModel:settings.ollamaVisionModel?.trim()||'auto',ollamaTextModel:settings.ollamaTextModel?.trim()||'auto',semanticLayerEnabled,semanticLayerUrl,clientSemanticLayerEnabled:settings.semanticLayerEnabled},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    return {
        enabled: settings.enabled,
        provider: settings.provider,
        geminiApiKey: settings.geminiApiKey?.trim() || process.env.GEMINI_API_KEY?.trim() || undefined,
        geminiModel: settings.geminiModel?.trim() || 'gemini-2.0-flash',
        ollamaBaseUrl: settings.ollamaBaseUrl?.trim() || process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434',
        ollamaVisionModel: settings.ollamaVisionModel?.trim() || 'auto',
        ollamaTextModel: settings.ollamaTextModel?.trim() || 'auto',
        semanticLayerEnabled: settings.provider === 'ollama' && semanticLayerEnabled,
        semanticLayerUrl,
    };
}

export function createAiProvider(settings: ResolvedAiSettings): AiProvider {
    if (settings.provider === 'ollama') {
        return createOllamaProvider(settings);
    }
    return createGeminiProvider(settings);
}
