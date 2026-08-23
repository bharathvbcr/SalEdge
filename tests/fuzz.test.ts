/**
 * ADVERSARIAL FUZZ SUITE
 *
 * Seeded (deterministic) property tests that try to break the pure layers:
 * random garbage through matching/scoring, random money values through GST
 * math, and truncation fuzzing of LLM-JSON parsing. Nothing may crash with
 * unexpected exception types, NaNs, or violated invariants.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scorePair, findSupplier, findProduct } from '../utils/purchaseMatching.ts';
import { splitTaxAmount, calculateGSTSplit, roundPaise } from '../indianGST.ts';
import { computeSaleTotals, extractGstFromFinal } from '../utils/salePricing.ts';
import { parseJsonFromText } from '../server/services/ai/jsonUtils.ts';
import type { CartItem } from '../components/sales/types.ts';

// Deterministic LCG so failures reproduce exactly.
let seed = 0x2f6e2b1;
function rnd(): number {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
}
function pick<T>(arr: T[]): T { return arr[Math.floor(rnd() * arr.length)]!; }
function randLen(max: number): number { return Math.floor(rnd() * max); }

const ALPHABET = ['a', 'Z', '5', ' ', '-', '.', '\u00e9', '中', '🚀', '"', '\\', '\n', '|', '/', "'", '\t', '₹', '%'];
const SUPPLIER_NAMES = ['Exide Industries', 'Amaron Batteries', 'Livguard Energy', 'Exide Power Storage', 'SF Sonic', '塔塔绿色能源'];
const PRODUCT_NAMES = [
    { brandName: 'Exide', name: '150Ah Tubular Battery' },
    { brandName: 'Exide', name: '100Ah Flat Plate' },
    { brandName: 'Amaron', name: '150Ah Tubular Battery' },
    { brandName: 'Livguard', name: '100Ah Lithium Battery' },
];

describe('fuzz: purchase matching', () => {
    it('scorePair stays finite within [0,1] across 800 garbage pairs', () => {
        for (let i = 0; i < 800; i++) {
            const a = Array.from({ length: randLen(80) }, () => pick(ALPHABET)).join('');
            const b = Array.from({ length: randLen(80) }, () => pick(ALPHABET)).join('');
            const score = scorePair(a, b);
            assert.ok(Number.isFinite(score), `non-finite for ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
            assert.ok(score >= 0 && score <= 1);
        }
    });

    it('findSupplier/findProduct never throw on hostile input (400 rounds)', () => {
        for (let i = 0; i < 400; i++) {
            const needle = Array.from({ length: randLen(120) }, () => pick(ALPHABET)).join('');
            assert.doesNotThrow(() => {
                findSupplier(SUPPLIER_NAMES.map((name, id) => ({ id: String(id), name, contactPerson: '', phone: '', gstin: '' })), needle);
                findProduct(PRODUCT_NAMES as never, needle);
            }, `threw on ${JSON.stringify(needle)}`);
        }
    });

    it('empty/whitespace needles are always rejected, never matched', () => {
        for (const needle of ['', '   ', '\n\t']) {
            assert.equal(findSupplier(SUPPLIER_NAMES.map((name, id) => ({ id: String(id), name, contactPerson: '', phone: '', gstin: '' })), needle), undefined);
        }
    });
});

describe('fuzz: GST money invariants', () => {
    function randMoney(): number {
        const magnitude = Math.pow(10, randLen(7));
        return Math.round((rnd() * 2 - 1) * magnitude * 100) / 100;
    }

    it('CGST + SGST always reconcile to total at paise precision (1000 samples)', () => {
        for (let i = 0; i < 1000; i++) {
            const tax = randMoney();
            for (const interstate of [false, true]) {
                const s = splitTaxAmount(tax, interstate);
                const sum = s.cgst + s.sgst + s.igst;
                assert.equal(
                    roundPaise(sum),
                    roundPaise(tax),
                    `split drift for tax=${tax} interstate=${interstate}`,
                );
            }
        }
    });

    it('calculateGSTSplit components reconcile for arbitrary amounts/rates (600 samples)', () => {
        for (let i = 0; i < 600; i++) {
            const amount = Math.abs(randMoney());
            const rate = pick([0, 0.25, 5, 12, 18, 28, 3.75]);
            const s = calculateGSTSplit(amount, rate, rnd() > 0.5);
            assert.ok(Number.isFinite(s.total));
            assert.equal(roundPaise(s.cgst + s.sgst + s.igst), roundPaise(s.total));
        }
    });

    it('computeSaleTotals: uniform carts match legacy formula EXACTLY; mixed carts stay self-consistent (300 samples)', () => {
        for (let i = 0; i < 300; i++) {
            const rate = pick([18, 28, 12]);
            const cart: CartItem[] = Array.from({ length: 1 + randLen(4) }, (_, j) => ({
                itemId: `i${j}`, name: 'Battery', quantity: 1 + randLen(3),
                price: Math.round(randMoney() * 100) / 100,
                serialNumbers: [],
                discount: { type: rnd() > 0.5 ? 'fixed' : 'percentage', value: Math.round(rnd() * 15 * 100) / 100 },
                ...(rnd() > 0.7 ? {} : { gstRate: rate }),
            }));

            const totals = computeSaleTotals({
                cart,
                overallDiscount: { type: 'fixed', value: Math.round(rnd() * 500) },
                additionalCharges: { description: '', amount: 0 },
                pointsToRedeem: 0, pointsRedemptionValue: 0,
                taxRegime: 'Regular', gstRate: rate,
                finalPriceOverride: null, finalPriceLocked: false,
                pricingMode: 'discount-drives', isReturnMode: false,
                clubBuybackWithDiscount: false,
            });

            // Self-consistency: extracted tax + taxable reconstructs the total.
            assert.ok(
                Math.abs(totals.taxAmount + totals.taxableAmount - totals.total) < 0.02,
                `tax+taxable != total for total=${totals.total}`,
            );
            // Stored splits reconcile with filed tax.
            assert.ok(
                Math.abs((totals.totalCgst ?? 0) + (totals.totalSgst ?? 0) + (totals.totalIgst ?? 0) - totals.taxAmount) < 0.02,
            );

            // Uniform-rate equivalence: strip item stamps → must equal legacy math.
            const uniformCart = cart.map(it => ({ ...it, gstRate: undefined }));
            const uniformTotals = computeSaleTotals({
                cart: uniformCart,
                overallDiscount: { type: 'fixed', value: 0 },
                additionalCharges: { description: '', amount: 0 },
                pointsToRedeem: 0, pointsRedemptionValue: 0,
                taxRegime: 'Regular', gstRate: rate,
                finalPriceOverride: null, finalPriceLocked: false,
                pricingMode: 'discount-drives', isReturnMode: false,
                clubBuybackWithDiscount: false,
            });
            const legacyTax = extractGstFromFinal(uniformTotals.total, rate, 'Regular').taxAmount;
            assert.equal(uniformTotals.taxAmount, legacyTax, 'uniform-rate regression against legacy formula');
        }
    });
});

describe('fuzz: LLM JSON parser under truncation', () => {
    const DOC = JSON.stringify({
        supplierName: 'Exide Industries Ltd',
        supplierGstin: '07AAACE348H1Z5',
        date: '2026-08-14',
        confidence: 'high',
        items: Array.from({ length: 8 }, (_, i) => ({
            description: `Battery 1${i}0Ah Tubular`,
            quantity: 2,
            unitPrice: 4500.5,
            mrp: 5850,
            taxRate: 28,
        })),
        subtotal: 72008, totalTax: 20162.24, totalAmount: 92170.24,
        warnings: [],
    });

    const CUT_POINTS = Array.from({ length: 40 }, () => 2 + Math.floor(rnd() * (DOC.length - 4)));

    it('truncations NEVER leak a raw SyntaxError — parse or clean error only', () => {
        let parsedOk = 0;
        for (const cut of CUT_POINTS) {
            const fragment = DOC.slice(0, cut) + pick(['', '```', '...truncated by model']);
            try {
                const result = parseJsonFromText(fragment);
                assert.ok(result && typeof result === 'object');
                parsedOk++;
            } catch (err) {
                assert.ok(err instanceof Error, 'must be an Error');
                assert.match(err.message, /did not contain valid JSON/, `raw error escaped: ${err.message}`);
                assert.equal(err.constructor.name, 'Error', 'no raw SyntaxError may escape');
            }
        }
        assert.ok(parsedOk >= CUT_POINTS.length / 4, `repair recovered too little (${parsedOk}/${CUT_POINTS.length})`);
    });

    it('deep nesting does not blow the stack (10k levels)', () => {
        const deep = '{"a":'.repeat(10_000) + '1' + '}'.repeat(10_000);
        const result = parseJsonFromText(deep.slice(0, 60_000)) as { a?: unknown };
        assert.ok(typeof result === 'object');
    });

    it('prose-wrapped and fenced responses still parse', () => {
        assert.deepEqual(parseJsonFromText(`Sure! \`\`\`json\n{"ok":true}\n\`\`\` done`), { ok: true });
        assert.deepEqual(parseJsonFromText(`Answer: {"ok":false} thanks`), { ok: false });
    });
});
