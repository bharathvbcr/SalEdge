import { PaymentVoucher, Transaction } from '../types.ts';

export interface CustomerFinancials {
    totalSpent: number;
    totalDue: number;
    loyaltyPoints: number;
}

interface LoyaltySettings {
    enabled: boolean;
    earnRate: number;
}

function pointsFor(amount: number, loyalty: LoyaltySettings): number {
    if (!loyalty.enabled || loyalty.earnRate <= 0) return 0;
    return Math.floor(Math.max(0, amount) / loyalty.earnRate);
}

/**
 * Canonical per-customer financial aggregates.
 *
 * Single owner for figures shown on the Customers page AND the sales form:
 * - Quotations are ignored entirely (no spend, no phantom dues, no points).
 * - Returns REVERSE spend/dues and claw back earned points instead of
 *   counting as positive sales.
 * - Receipt/Payment vouchers against the customer settle outstanding dues.
 *
 * Previously each surface re-derived these numbers with different rules,
 * so refunds earned points again and dues ignored voucher receipts.
 */
export function computeCustomerFinancials(
    transactions: Transaction[],
    paymentVouchers: PaymentVoucher[],
    loyalty: LoyaltySettings
): CustomerFinancials {
    let totalSpent = 0;
    let totalDue = 0;
    let loyaltyPoints = 0;

    transactions.forEach(t => {
        if (t.status === 'Quotation') return;

        const paidOnInvoice = (t.payments ?? []).reduce((sum, p) => sum + p.amount, 0);
        const isReturn = t.type === 'Return';
        const sign = isReturn ? -1 : 1;

        totalSpent += sign * t.total;
        totalDue += sign * (t.total - paidOnInvoice);

        loyaltyPoints += sign * pointsFor(t.total, loyalty);
        loyaltyPoints -= t.redeemedPoints ?? 0;
    });

    paymentVouchers.forEach(v => {
        if (v.type === 'Receipt') {
            totalDue -= v.amount;
        } else if (v.type === 'Payment') {
            totalDue += v.amount;
        }
    });

    return {
        totalSpent,
        totalDue: Math.max(0, totalDue),
        loyaltyPoints: Math.max(0, loyaltyPoints),
    };
}
