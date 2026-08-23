import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeSaleTotals, extractGstFromFinalMulti, buildGstRateBuckets, extractGstFromFinal } from '../utils/salePricing.ts';
import { CartItem } from '../components/sales/types.ts';

function cartItem(partial: Partial<CartItem>): CartItem {
    return {
        itemId: 'x',
        name: 'Battery',
        quantity: 1,
        price: 1000,
        serialNumbers: ['SN1'],
        discount: { type: 'fixed', value: 0 },
        ...partial,
    };
}

describe('buildGstRateBuckets', () => {
    it('groups lines by their stamped HSN rate with firm-rate fallback', () => {
        const buckets = buildGstRateBuckets([
            cartItem({ itemId: 'a', hsnCode: '8507', gstRate: 28 }),
            cartItem({ itemId: 'b', hsnCode: '85076000', gstRate: 18 }),
            cartItem({ itemId: 'c' }), // no stamp → fallback
        ], 0, 18);
        assert.deepEqual(buckets.sort((a, b) => a.rate - b.rate), [
            { rate: 18, net: 2000 },
            { rate: 28, net: 1000 },
        ]);
    });

    it('applies line discounts before bucketing and adds charges at the firm rate', () => {
        const buckets = buildGstRateBuckets([
            cartItem({ itemId: 'a', gstRate: 28, price: 100, quantity: 2 }),
            // fixed discount value is per-unit: 50 − 10×1 = 40 net
            cartItem({ itemId: 'b', gstRate: 28, price: 50, quantity: 1, discount: { type: 'fixed', value: 10 } }),
        ], 25, 28);
        const net = buckets.find(b => b.rate === 28)!.net;
        assert.equal(net, 200 + 40 + 25);
    });
});

describe('extractGstFromFinalMulti', () => {
    it('uniform carts match the legacy single-rate formula EXACTLY', () => {
        const total = 32509;
        const legacy = extractGstFromFinal(total, 18, 'Regular');
        const multi = extractGstFromFinalMulti(total, 18, 'Regular', [
            { rate: 18, net: 27550 },
        ]);
        assert.equal(multi.taxAmount, legacy.taxAmount);
        assert.equal(multi.taxableAmount, legacy.taxableAmount);
    });

    it('mixed-rate carts tax each bucket at its own statutory rate (not one blended rate)', () => {
        // ₹12,800 final: ₹10,000 net @28% + ₹2,000 net @18% (price-inclusive).
        const buckets = [
            { rate: 28, net: 10000 },
            { rate: 18, net: 2000 },
        ];
        const total = 12000;
        const result = extractGstFromFinalMulti(total, 18, 'Regular', buckets);

        // No overall discount → allocation factor 1 → per-bucket inclusive tax.
        const expected28 = Math.round(10000 * 28 / 128 * 100) / 100;   // 2187.5
        const expected18 = Math.round(2000 * 18 / 118 * 100) / 100;    // 305.08...
        assert.equal(result.taxAmount, Math.round((expected28 + expected18) * 100) / 100);
        assert.ok(Math.abs(result.taxAmount + result.taxableAmount - total) < 0.02);

        // The old behaviour taxed everything at ONE rate — demonstrably different.
        const legacyWrong = extractGstFromFinal(total, 18, 'Regular').taxAmount;
        assert.notEqual(result.taxAmount, legacyWrong);
    });

    it('allocation shrinks each bucket proportionally when a discount applies', () => {
        const buckets = [
            { rate: 28, net: 10000 },
            { rate: 18, net: 2000 },
        ];
        const total = 11000; // ₹1,000 knocked off ₹12,000 base
        const result = extractGstFromFinalMulti(total, 18, 'Regular', buckets);
        const k = 11000 / 12000;
        const expected28 = Math.round((10000 * k * 28 / 128) * 100) / 100;
        const expected18 = Math.round((2000 * k * 18 / 118) * 100) / 100;
        assert.equal(result.perRateTax.find(p => p.rate === 28)!.tax, expected28);
        assert.equal(result.perRateTax.find(p => p.rate === 18)!.tax, expected18);
    });

    it('composition regime yields zero tax regardless of rates', () => {
        const r = extractGstFromFinalMulti(5000, 18, 'Composition', [{ rate: 28, net: 5000 }]);
        assert.equal(r.taxAmount, 0);
    });
});

describe('computeSaleTotals end-to-end', () => {
    const params = (cart: CartItem[], extra: Record<string, unknown> = {}) => ({
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
        ...extra,
    });

    it('produces reconciled CGST+SGST that sum to taxAmount', () => {
        const totals = computeSaleTotals(params([
            cartItem({ itemId: 'a', price: 14500, quantity: 2, gstRate: 28 }),
            cartItem({ itemId: 'b', price: 9000, quantity: 1, gstRate: 18 }),
        ]));
        assert.equal(totals.totalCgst! + totals.totalSgst!, totals.taxAmount);
        assert.ok(totals.totalCgst! > 0);
        assert.equal(totals.totalIgst ?? 0, 0);
    });

    it('interstate sales put the whole tax on IGST', () => {
        const totals = computeSaleTotals(params(
            [cartItem({ itemId: 'a', price: 10000, quantity: 1, gstRate: 28 })],
            { isInterstate: true },
        ));
        assert.equal(totals.totalIgst, totals.taxAmount);
        assert.equal(totals.totalCgst ?? 0, 0);
        assert.equal(totals.totalSgst ?? 0, 0);
    });

    it('unstamped items fall back to the firm rate (back-compat)', () => {
        const totals = computeSaleTotals(params([cartItem({ itemId: 'a', price: 11800 })]));
        assert.equal(totals.taxAmount, 1800); // 18% inclusive extraction, unchanged
    });
});
