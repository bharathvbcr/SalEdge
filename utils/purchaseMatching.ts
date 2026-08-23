import { ProductType, Supplier } from '../types.ts';

/**
 * Scored fuzzy matching for OCR/CSV-sourced supplier and product names.
 *
 * Replaces the old first-match-wins `includes()` probes, where OCR noise
 * like "a" matched the first supplier in array order and "Exide" arbitrarily
 * picked whichever of several Exide variants came first. Candidates now must
 * CLEAR a similarity threshold AND beat the runner-up by a margin; otherwise
 * the item is routed to the unmatched flow for manual selection.
 *
 * Acceptance rules:
 *  - exact (normalized) equality always wins deterministically;
 *  - otherwise best score ≥ ACCEPT_SCORE and (best − runner-up) ≥ MARGIN,
 *    or there is only one candidate above a weak floor.
 */

const ACCEPT_SCORE = 0.58;
const MARGIN = 0.1;
const AMBIGUOUS_FLOOR = 0.45;

export function normalizeName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(normalized: string): string[] {
    return normalized.split(' ').filter(Boolean);
}

/** Battery-domain discriminative attributes: capacity, voltage, tech, use-case. */
const ATTRIBUTE_PATTERN = /\b(\d+\s?ah|\d+\s?v|c\d{1,2}|lithium|ion|tubular|flat|plate|smf|gel|solar|inverter)\b/g;

function extractAttributes(normalized: string): Set<string> {
    const attrs = new Set<string>();
    for (const m of normalized.matchAll(ATTRIBUTE_PATTERN)) {
        attrs.add(m[0].replace(/\s+/g, ''));
    }
    return attrs;
}

function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array<number>(b.length + 1);
    let curr = new Array<number>(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        const ca = a.charCodeAt(i - 1);
        for (let j = 1; j <= b.length; j++) {
            const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[b.length];
}

function levenshteinRatio(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen;
}

export interface PairScore { score: number }

/**
 * Similarity in [0,1]: token overlap + edit-distance blend, with bonuses for
 * meaningful containment and shared battery attributes (150Ah / 12V / C10 /
 * tubular / lithium…) — the tokens that actually discriminate SKUs.
 */
export function scorePair(needle: string, candidate: string): number {
    const n = normalizeName(needle);
    const c = normalizeName(candidate);
    if (!n || !c) return 0;
    if (n === c) return 1;

    const nTokens = new Set(tokenize(n));
    const cTokens = new Set(tokenize(c));
    let intersection = 0;
    for (const t of nTokens) if (cTokens.has(t)) intersection++;
    const union = nTokens.size + cTokens.size - intersection;
    const jaccard = union === 0 ? 0 : intersection / union;
    const levR = levenshteinRatio(n, c);

    let score = 0.55 * jaccard + 0.45 * levR;

    // A meaningful needle fully contained in the candidate is a strong signal.
    if (n.length >= 5 && c.includes(n)) {
        score = Math.max(score, 0.78);
    }

    // Shared domain attributes are highly discriminative between SKUs.
    const nAttrs = extractAttributes(n);
    const cAttrs = extractAttributes(c);
    let sharedAttrs = 0;
    for (const a of nAttrs) if (cAttrs.has(a)) sharedAttrs++;
    score += Math.min(0.3, sharedAttrs * 0.15);

    return Math.min(1, score);
}

interface ScoredCandidate<T> {
    item: T;
    score: number;
}

function bestMatches<T>(needle: string, candidates: T[], textOf: (item: T) => string): ScoredCandidate<T>[] {
    return candidates
        .map(item => ({ item, score: scorePair(needle, textOf(item)) }))
        .sort((a, b) => b.score - a.score);
}

function acceptBest<T>(needle: string, ranked: ScoredCandidate<T>[]): T | undefined {
    const best = ranked[0];
    if (!best) return undefined;

    // Exact normalized match is deterministic — no ambiguity check needed.
    if (best.score >= 1) return best.item;

    if (best.score < ACCEPT_SCORE) return undefined;

    const runnerUp = ranked[1];
    if (!runnerUp || runnerUp.score < AMBIGUOUS_FLOOR) return best.item;
    // Two plausible candidates within the margin → refuse to guess.
    return best.score - runnerUp.score >= MARGIN ? best.item : undefined;
}

function rankAndPick<T>(candidates: T[], needle: string, textOf: (item: T) => string): T | undefined {
    const trimmed = needle.trim().toLowerCase();
    if (!trimmed) return undefined;
    return acceptBest(needle, bestMatches(needle, candidates, textOf));
}

export function findSupplier(suppliers: Supplier[], name: string): Supplier | undefined {
    return rankAndPick(suppliers, name, s => s.name);
}

export function findProduct(productTypes: ProductType[], name: string): ProductType | undefined {
    return rankAndPick(productTypes, name, p => `${p.brandName} ${p.name}`);
}
