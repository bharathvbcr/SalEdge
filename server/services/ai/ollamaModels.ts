/**
 * Dynamic Ollama model discovery and task-aware selection.
 * Queries GET {baseUrl}/api/tags instead of relying on hardcoded model names.
 */

export interface OllamaModelEntry {
    name: string;
    sizeBillions: number;
}

export interface OllamaTagsResponse {
    models?: Array<{
        name: string;
        size?: number;
        capabilities?: string[];
        details?: {
            parameter_size?: string;
            [key: string]: unknown;
        };
    }>;
}

export interface ResolvedOllamaModels {
    available: string[];
    visionModel: string;
    textModel: string;
    tierSmall: string;
    tierMedium: string;
    tierLarge: string;
}

export interface OllamaModelPreferences {
    baseUrl: string;
    visionModel?: string;
    textModel?: string;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { models: OllamaModelEntry[]; fetchedAt: number }>();

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/$/, '');
}

function isAutoModel(value: string | undefined): boolean {
    if (!value) return true;
    const trimmed = value.trim().toLowerCase();
    return trimmed === '' || trimmed === 'auto';
}

function stripModelTag(name: string): string {
    return name.split(':')[0] ?? name;
}

/** Prefer models whose names suggest vision / multimodal capability. */
export function isVisionCapableModel(name: string): boolean {
    const lower = name.toLowerCase();
    return /vision|vl\b|multimodal|\bmm\b|llava|bakllava|moondream|pixtral|gemma.*vision|qwen.*vl/.test(lower);
}

/** Estimate parameter size in billions for sorting (higher = larger). */
export function parseModelSizeBillions(name: string, parameterSize?: string): number {
    if (parameterSize) {
        const fromMeta = parameterSize.trim().match(/^(\d+(?:\.\d+)?)\s*[bB]/);
        if (fromMeta) return parseFloat(fromMeta[1]!);
        const fromMetaM = parameterSize.trim().match(/^(\d+(?:\.\d+)?)\s*[mM]/);
        if (fromMetaM) return parseFloat(fromMetaM[1]!) / 1000;
    }

    const lower = name.toLowerCase();
    const paramMatch = lower.match(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)\s*b(?:\b|$|:|-)/);
    if (paramMatch) return parseFloat(paramMatch[1]!);

    if (/\bmini\b|\btiny\b|\bsmall\b|\b1b\b|\b1\.5b\b|\b2b\b/.test(lower)) return 2;
    if (/\bmedium\b|\bmid\b|\b7b\b|\b8b\b/.test(lower)) return 7;
    if (/\blarge\b|\bxl\b|\b70b\b|\b65b\b|\b35b\b|\b34b\b|\b32b\b|\bornith\b/.test(lower)) return 35;
    return 7;
}

/** Skip embedding-only models for chat / vision tasks. */
export function isCompletionCapableModel(name: string, capabilities?: string[]): boolean {
    if (capabilities?.length) {
        return capabilities.includes('completion') || capabilities.includes('vision');
    }
    const lower = name.toLowerCase();
    return !/\bembed(?:ding)?\b|minilm|nomic-embed|bge-|e5-|mxbai-embed/.test(lower);
}

export async function fetchOllamaModels(baseUrl: string): Promise<OllamaModelEntry[]> {
    const normalized = normalizeBaseUrl(baseUrl);
    const cached = cache.get(normalized);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.models;
    }

    const res = await fetch(`${normalized}/api/tags`, {
        signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Ollama tags error (${res.status}): ${body || res.statusText}`);
    }

    const data = await res.json() as OllamaTagsResponse;
    const models = (data.models ?? [])
        .filter(m => isCompletionCapableModel(m.name, m.capabilities))
        .map(m => ({
            name: m.name.trim(),
            sizeBillions: parseModelSizeBillions(m.name, m.details?.parameter_size),
        }))
        .filter(m => m.name);

    cache.set(normalized, { models, fetchedAt: Date.now() });
    return models;
}

export async function fetchOllamaModelNames(baseUrl: string): Promise<string[]> {
    const models = await fetchOllamaModels(baseUrl);
    return models.map(m => m.name);
}

function sortBySize(entries: OllamaModelEntry[]): OllamaModelEntry[] {
    return [...entries].sort((a, b) => a.sizeBillions - b.sizeBillions);
}

function pickPreferredOrAuto(
    entries: OllamaModelEntry[],
    preferred: string | undefined,
    selector: (models: OllamaModelEntry[]) => string,
): string {
    const available = entries.map(m => m.name);
    if (!isAutoModel(preferred)) {
        const pref = preferred!.trim();
        const exact = available.find(m => m === pref);
        if (exact) return exact;
        const byBase = available.find(m => stripModelTag(m) === stripModelTag(pref));
        if (byBase) return byBase;
    }
    return selector(entries);
}

function selectVisionModel(entries: OllamaModelEntry[]): string {
    const vision = entries.filter(m => isVisionCapableModel(m.name));
    if (vision.length > 0) {
        return sortBySize(vision)[0]!.name;
    }
    return sortBySize(entries)[0]!.name;
}

function selectTextModel(entries: OllamaModelEntry[]): string {
    const textOnly = entries.filter(m => !isVisionCapableModel(m.name));
    const pool = textOnly.length > 0 ? textOnly : entries;
    return sortBySize(pool)[0]!.name;
}

function selectTierModels(entries: OllamaModelEntry[]): { small: string; medium: string; large: string } {
    if (entries.length === 0) {
        throw new Error('No Ollama models installed.');
    }

    const sorted = sortBySize(entries);

    if (sorted.length === 1) {
        const only = sorted[0]!.name;
        return { small: only, medium: only, large: only };
    }

    if (sorted.length === 2) {
        return {
            small: sorted[0]!.name,
            medium: sorted[1]!.name,
            large: sorted[1]!.name,
        };
    }

    const midIdx = Math.floor(sorted.length / 2);
    return {
        small: sorted[0]!.name,
        medium: sorted[midIdx]!.name,
        large: sorted[sorted.length - 1]!.name,
    };
}

export function resolveModelsFromList(
    entries: OllamaModelEntry[],
    prefs: Pick<OllamaModelPreferences, 'visionModel' | 'textModel'>,
): ResolvedOllamaModels {
    if (entries.length === 0) {
        throw new Error(
            'No Ollama models found. Install one with `ollama pull <model>` and ensure Ollama is running.',
        );
    }

    const tiers = selectTierModels(entries);
    const available = entries.map(m => m.name);

    return {
        available,
        visionModel: pickPreferredOrAuto(entries, prefs.visionModel, selectVisionModel),
        textModel: pickPreferredOrAuto(entries, prefs.textModel, selectTextModel),
        tierSmall: tiers.small,
        tierMedium: tiers.medium,
        tierLarge: tiers.large,
    };
}

export async function resolveOllamaModels(prefs: OllamaModelPreferences): Promise<ResolvedOllamaModels> {
    const entries = await fetchOllamaModels(prefs.baseUrl);
    return resolveModelsFromList(entries, prefs);
}

export function clearOllamaModelCache(baseUrl?: string): void {
    if (baseUrl) {
        cache.delete(normalizeBaseUrl(baseUrl));
    } else {
        cache.clear();
    }
}
