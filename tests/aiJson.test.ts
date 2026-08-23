import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonFromText, validatePurchaseExtraction } from '../server/services/ai/jsonUtils.ts';

describe('parseJsonFromText robustness', () => {
    it('parses fenced JSON', () => {
        assert.deepEqual(parseJsonFromText('```json\n{"a":1}\n```'), { a: 1 });
    });

    it('tolerates an UNCLOSED fence (truncated response) — previously a raw SyntaxError', () => {
        const text = '```json\n{"supplierName":"Exide","items":[]}';
        assert.deepEqual(parseJsonFromText(text), { supplierName: 'Exide', items: [] });
    });

    it('recovers balanced JSON from trailing prose', () => {
        const text = 'Here is the extraction: {"total": 100} hope this helps!';
        assert.deepEqual(parseJsonFromText(text), { total: 100 });
    });

    it('repairs truncated nested objects instead of failing outright', () => {
        const text = '{"items":[{"description":"Battery","quantity":1';
        const parsed = parseJsonFromText(text) as { items: unknown[] };
        assert.ok(Array.isArray(parsed.items));
    });

    it('still throws a clean error when no JSON exists', () => {
        assert.throws(() => parseJsonFromText('no structured data here'), /did not contain valid JSON/);
    });
});

describe('validatePurchaseExtraction numeric bounds', () => {
    const base = { confidence: 'high', items: [{ description: 'Battery 150Ah', quantity: 2, unitPrice: 5000 }] };

    it('REJECTS empty-string prices (previously became ₹0 free line items)', () => {
        assert.throws(
            () => validatePurchaseExtraction({ ...base, items: [{ description: 'x', quantity: 1, unitPrice: '' }] }),
            /invalid unit price/i,
        );
    });

    it('rejects zero and negative unit prices', () => {
        for (const price of [0, -100]) {
            assert.throws(
                () => validatePurchaseExtraction({ ...base, items: [{ description: 'x', quantity: 1, unitPrice: price }] }),
                /invalid unit price/i,
            );
        }
    });

    it('rejects absurd quantities (LLM hallucination guard)', () => {
        assert.throws(
            () => validatePurchaseExtraction({ ...base, items: [{ description: 'x', quantity: 1e9, unitPrice: 10 }] }),
            /invalid quantity/i,
        );
    });

    it('clamps tax rate into the statutory range and MRP non-negative', () => {
        const result = validatePurchaseExtraction({
            ...base,
            items: [{ description: 'x', quantity: 1, unitPrice: 10, mrp: -5, taxRate: -18 }],
        });
        assert.equal(result.items[0]!.taxRate, 0);
        assert.equal(result.items[0]!.mrp, 0);
    });

    it('drops NaN totals instead of propagating them into purchases', () => {
        const result = validatePurchaseExtraction({ ...base, subtotal: 'abc', totalTax: NaN, totalAmount: undefined });
        assert.equal(result.subtotal, undefined);
        assert.equal(result.totalTax, undefined);
        assert.equal(result.totalAmount, undefined);
    });

    it('downgrades LLM-claimed HIGH confidence when invoice identity is missing', () => {
        const result = validatePurchaseExtraction({ ...base, supplierName: 'Exide' });
        assert.equal(result.confidence, 'medium'); // claimed high, but no invoice no./date
    });

    it('missing supplier forces LOW regardless of claim', () => {
        const result = validatePurchaseExtraction(base);
        assert.equal(result.confidence, 'low');
    });

    it('forces LOW confidence with no items or supplier', () => {
        const result = validatePurchaseExtraction({ confidence: 'high', items: [], supplierName: undefined });
        assert.equal(result.confidence, 'low');
    });

    it('keeps genuine high confidence when identity fields are present', () => {
        const result = validatePurchaseExtraction({
            ...base,
            supplierName: 'Exide',
            supplierInvoiceNumber: 'INV-1',
            date: '2026-08-01',
        });
        assert.equal(result.confidence, 'high');
    });
});
