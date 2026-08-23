import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeSaleTotals, extractGstFromFinalMulti, buildGstRateBuckets } from '../utils/salePricing.ts';
import { CartItem } from '../components/sales/types.ts';
import { computeBalances } from '../utils/bankingBalances.ts';
import { computeDayBook } from '../utils/periodSummary.ts';
import { normalizeLegacyReturnSigns, hasLegacyNegativeReturns } from '../utils/canonicalReturns.ts';
import type { Transaction } from '../types.ts';

// Deterministic PRNG so failures reproduce.
function mulberry32(seed: number) {
    let a = seed;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const RATES = [0, 5, 12, 18, 28];

function randomCartItem(rand: () => number, i: number): CartItem {
    const isBuyback = rand() < 0.3;
    return {
        itemId: `i${i}`,
        name: isBuyback ? 'Buyback' : 'Battery',
        quantity: 1 + Math.floor(rand() * 3),
        price: isBuyback
            ? -Math.round(rand() * 8000)
            : Math.round(rand() * 30000),
        serialNumbers: ['SN'],
        discount: rand() < 0.2 ? { type: 'fixed', value: Math.round(rand() * 500) } : { type: 'fixed', value: 0 },
        gstRate: RATES[Math.floor(rand() * RATES.length)],
        isBuyback,
    };
}

describe('stress: mixed-sign GST extraction under fuzzing', () => {
    const rand = mulberry32(20260822);

    it('1000 random carts keep taxable + tax reconciled to total (paise-exact)', () => {
        for (let round = 0; round < 1000; round++) {
            const cart = Array.from({ length: 1 + Math.floor(rand() * 5) }, (_, i) => randomCartItem(rand, i));
            // Skip carts that net to ~zero — the degenerate branch handles them.
            const base = cart.reduce((s, it) => s + it.price * it.quantity, 0);
            if (Math.abs(base) < 100) continue;

            const totals = computeSaleTotals({
                cart,
                overallDiscount: { type: 'fixed', value: 0 },
                additionalCharges: { description: '', amount: 0 },
                pointsToRedeem: 0,
                pointsRedemptionValue: 0,
                taxRegime: 'Regular',
                gstRate: 18,
                finalPriceOverride: null,
                finalPriceLocked: false,
                pricingMode: 'discount-drives',
                isReturnMode: false,
                clubBuybackWithDiscount: false,
                isInterstate: false,
            });
            assert.ok(
                Math.abs(totals.taxableAmount + totals.taxAmount - totals.total) <= 0.02,
                `round ${round}: taxable+tax ${totals.taxableAmount + totals.taxAmount} != total ${totals.total}`,
            );
        }
    });

    it('mixed-sign carts reconcile to the invoice across every pricing path', () => {
        // NOTE: with offsetting buckets at DIFFERENT rates, no simple pro-rata
        // scheme yields a single-rate statutory ceiling (embedded tax does not
        // net linearly across heads). What MUST hold everywhere is exact
        // reconciliation: taxableAmount + taxAmount == total, on every path.
        for (let round = 0; round < 1500; round++) {
            const cart = Array.from({ length: 1 + Math.floor(rand() * 5) }, (_, i) => randomCartItem(rand, i));
            const base = cart.reduce((s, it) => s + it.price * it.quantity, 0);
            if (Math.abs(base) < 100) continue;

            const useFinalOverride = rand() < 0.4;
            const totals = computeSaleTotals({
                cart,
                overallDiscount: rand() < 0.3 ? { type: 'percentage', value: Math.round(rand() * 15) } : { type: 'fixed', value: 0 },
                additionalCharges: { description: '', amount: rand() < 0.25 ? Math.round(rand() * 500) : 0 },
                pointsToRedeem: 0,
                pointsRedemptionValue: 0,
                taxRegime: 'Regular',
                gstRate: 18,
                finalPriceOverride: useFinalOverride ? Math.max(50, Math.round(Math.abs(base) * (0.8 + rand() * 0.3))) : null,
                finalPriceLocked: useFinalOverride,
                pricingMode: useFinalOverride ? 'final-drives' : 'discount-drives',
                isReturnMode: false,
                clubBuybackWithDiscount: false,
                isInterstate: rand() < 0.5,
            });
            assert.ok(
                Math.abs(totals.taxableAmount + totals.taxAmount - totals.total) <= 0.02,
                `round ${round}: taxable ${totals.taxableAmount} + tax ${totals.taxAmount} != total ${totals.total}`,
            );
            // Stored halves must reassemble the stored tax exactly (signed).
            const headSum = totals.totalIgst
                ? totals.totalIgst
                : totals.totalCgst + totals.totalSgst;
            assert.ok(
                Math.abs(headSum - totals.taxAmount) <= 0.02,
                `round ${round}: split heads ${headSum} drift from taxAmount ${totals.taxAmount}`,
            );
        }
    });

    it('tax on a fully-positive cart never exceeds the statutory maximum share (+ paise tolerance)', () => {
        for (let round = 0; round < 500; round++) {
            const cart = Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, i) => ({
                ...randomCartItem(rand, i), isBuyback: false, price: Math.abs(Math.round(rand() * 20000)) + 10,
            }));
            const totals = computeSaleTotals(paramsFor(cart));
            if (totals.total <= 0) continue;
            // Independent per-bucket paise rounding can nudge tiny invoices
            // above the exact 28/128 share — allow two paise.
            assert.ok(
                totals.taxAmount <= totals.total * (0.28 / 1.28) + 0.02,
                `round ${round}: tax ${totals.taxAmount} on ${totals.total} exceeds ceiling`,
            );
        }
    });

    function paramsFor(cart: CartItem[]) {
        return {
            cart,
            overallDiscount: { type: 'fixed' as const, value: 0 },
            additionalCharges: { description: '', amount: 0 },
            pointsToRedeem: 0,
            pointsRedemptionValue: 0,
            taxRegime: 'Regular' as const,
            gstRate: 18,
            finalPriceOverride: null,
            finalPriceLocked: false,
            pricingMode: 'discount-drives' as const,
            isReturnMode: false,
            clubBuybackWithDiscount: false,
            isInterstate: false,
        };
    }
});

describe('stress: refund storms against money ledgers', () => {
    function txn(partial: Partial<Transaction>): Transaction {
        return {
            id: 'T', firmId: 'F1', type: 'Sale', date: new Date().toISOString(),
            customerName: 'C', customerPhone: '9', items: [], subtotal: 0,
            discount: { type: 'fixed', value: 0 }, taxRegime: 'Regular',
            taxAmount: 0, total: 1000, payments: [], status: 'Paid', ...partial,
        };
    }

    it('200 interleaved sales+refunds leave drawer/bank exactly at Σsales − Σrefunds', () => {
        const rand = mulberry32(777);
        let expectedCash = 0;
        let expectedBank = 0;
        const txns: Transaction[] = [];
        for (let i = 0; i < 200; i++) {
            const isReturn = rand() < 0.4;
            const amount = Math.round(100 + rand() * 9000);
            const method = rand() < 0.5 ? 'Cash' : 'UPI';
            txns.push(txn({
                id: `T${i}`, type: isReturn ? 'Return' : 'Sale',
                total: amount,
                payments: [{ method: method as 'Cash' | 'UPI', amount }],
            }));
            const delta = isReturn ? -amount : amount;
            if (method === 'Cash') expectedCash += delta; else expectedBank += delta;
        }
        const { cashBalance, bankBalance } = computeBalances(txns, [], [], []);
        assert.equal(cashBalance, expectedCash);
        assert.equal(bankBalance, expectedBank);
    });

    it('day book across 30 days with returns never overstates expected cash', () => {
        const rand = mulberry32(888);
        const start = Date.now();
        const txns: Transaction[] = [];
        const perDayExpected = new Map<string, number>();
        for (let d = 0; d < 30; d++) {
            const date = new Date(start - d * 86_400_000).toISOString();
            const key = date.slice(0, 10);
            for (let n = 0; n < 5; n++) {
                const isReturn = rand() < 0.35;
                const amount = Math.round(50 + rand() * 4000);
                txns.push(txn({
                    id: `D${d}N${n}`, type: isReturn ? 'Return' : 'Sale', date,
                    total: amount,
                    payments: [{ method: 'Cash', amount }],
                }));
                perDayExpected.set(key, (perDayExpected.get(key) ?? 0) + (isReturn ? -amount : amount));
            }
        }
        for (const [key, expected] of perDayExpected) {
            const book = computeDayBook(txns, [], key);
            assert.equal(book.expectedCash, expected, `day ${key}`);
        }
    });

    it('legacy heal converges after one pass and is idempotent', () => {
        const legacy: Transaction[] = [
            txn({ id: 'R1', type: 'Return', total: -11800, taxAmount: -1800, subtotal: -10000 }),
            txn({ id: 'S1', total: 5000 }),
        ];
        assert.equal(hasLegacyNegativeReturns(legacy), true);
        const once = normalizeLegacyReturnSigns(legacy);
        assert.equal(once[0].total, 11800);
        assert.equal(once[0].taxAmount, 1800);
        assert.deepEqual(normalizeLegacyReturnSigns(once), once, 'second pass must be a no-op');
        assert.equal(hasLegacyNegativeReturns(once), false);
    });

    it('heal leaves canonical data byte-identical (no save churn)', () => {
        const canonical: Transaction[] = [
            txn({ id: 'R1', type: 'Return', total: 11800, taxAmount: 1800 }),
            txn({ id: 'S1', total: 5000 }),
        ];
        assert.deepEqual(normalizeLegacyReturnSigns(canonical), canonical);
        assert.equal(hasLegacyNegativeReturns(canonical), false);
    });
});
