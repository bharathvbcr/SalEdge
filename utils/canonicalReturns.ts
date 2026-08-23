import { Transaction } from '../types.ts';

/**
 * Canonical storage convention for credit notes (type 'Return'):
 * total > 0, taxAmount > 0, item prices > 0, payments > 0. Report helpers
 * flip direction off the type field and assume magnitudes are positive.
 *
 * SalesForm used to persist returns with NEGATIVE totals/tax/prices (an
 * artifact of reusing the pricing engine with negated cart lines). This
 * heals such records; it is idempotent and a no-op for canonical data.
 */
export function normalizeLegacyReturnSigns(transactions: Transaction[]): Transaction[] {
    if (!transactions.some(t =>
        t.type === 'Return'
        && (t.total < 0 || t.taxAmount < 0 || t.items.some(i => i.price < 0))
    )) {
        return transactions;
    }
    return transactions.map(t => {
        if (t.type !== 'Return') return t;
        const abs = (n: number | undefined) => (n == null ? n : Math.abs(n));
        return {
            ...t,
            total: Math.abs(t.total),
            taxAmount: Math.abs(t.taxAmount),
            subtotal: Math.abs(t.subtotal),
            additionalCharges: t.additionalCharges
                ? { ...t.additionalCharges, amount: Math.abs(t.additionalCharges.amount) }
                : t.additionalCharges,
            items: t.items.map(i => ({ ...i, price: Math.abs(i.price) })),
            totalCgst: abs(t.totalCgst),
            totalSgst: abs(t.totalSgst),
            totalIgst: abs(t.totalIgst),
        };
    });
}

export function hasLegacyNegativeReturns(transactions: Transaction[]): boolean {
    return transactions.some(t =>
        t.type === 'Return'
        && (t.total < 0 || t.taxAmount < 0 || t.items.some(i => i.price < 0))
    );
}
