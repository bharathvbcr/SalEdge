import type { AiActionContext, AiBusinessSnapshot, AiChatMessage } from '../../../types.ts';
import type { SemanticRagChunk } from './semanticLayerClient.js';

/**
 * The business snapshot is split into one chunk per domain (rather than a single
 * opaque JSON blob) so the semantic layer's relevance compressor can keep only
 * the domains a query actually needs. Each chunk carries a natural-language
 * headline (for the bi-encoder) and the period/as-of context (so it is
 * self-contained and the cache fingerprint changes when the data changes).
 */
function domainChunk(
    domain: string,
    headline: string,
    period: string,
    data: unknown,
): SemanticRagChunk {
    return {
        id: `snapshot-${domain}`,
        text: `${headline} (period ${period}):\n${JSON.stringify(data, null, 2)}`,
        metadata: { type: 'business_snapshot', domain, period },
    };
}

export function buildSnapshotRagChunks(snapshot: AiBusinessSnapshot): SemanticRagChunk[] {
    const period = snapshot.period;
    const scope = {
        period: snapshot.period,
        periodStartDate: snapshot.periodStartDate,
        periodEndDate: snapshot.periodEndDate,
        currency: snapshot.currency,
    };
    return [
        domainChunk('sales-profitability', 'Sales revenue, returns, COGS, margins and profit', period, {
            scope,
            sales: snapshot.sales,
        }),
        domainChunk('sales-trend', 'Sales momentum and month-over-month trend', period, {
            momGrowth: snapshot.momGrowth,
            salesTrend: snapshot.salesTrend,
        }),
        domainChunk('top-products', 'Best-selling products by revenue (ranking only)', period, {
            topProducts: snapshot.topProducts,
        }),
        domainChunk('inventory', 'Inventory health: low stock and slow-moving products', period, {
            inventory: snapshot.inventory,
        }),
        domainChunk('receivables', 'Receivables: money customers owe, aging and overdue counts', period, {
            asOfDate: snapshot.asOfDate,
            receivables: snapshot.receivables,
        }),
        domainChunk('payables', 'Payables: money owed to suppliers, aging and overdue counts', period, {
            asOfDate: snapshot.asOfDate,
            payables: snapshot.payables,
        }),
    ];
}

export function buildActionContextRagChunk(actionContext: AiActionContext): SemanticRagChunk {
    return {
        id: 'action-context',
        text: `Action context (allowed pages, parties, categories, balances):\n${JSON.stringify(actionContext, null, 2)}`,
        metadata: { type: 'action_context' },
    };
}

export function buildChatHistoryRagChunks(messages: AiChatMessage[]): SemanticRagChunk[] {
    return messages.slice(0, -1).map((message, index) => ({
        id: `chat-history-${index}`,
        text: `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`,
        metadata: { type: 'chat_history', role: message.role },
    }));
}

export function buildInsightsRagChunks(snapshot: AiBusinessSnapshot): SemanticRagChunk[] {
    return buildSnapshotRagChunks(snapshot);
}

export function buildChatRagChunks(
    snapshot: AiBusinessSnapshot,
    actionContext: AiActionContext,
    messages: AiChatMessage[],
): SemanticRagChunk[] {
    return [
        ...buildSnapshotRagChunks(snapshot),
        buildActionContextRagChunk(actionContext),
        ...buildChatHistoryRagChunks(messages),
    ];
}
