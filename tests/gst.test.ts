import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    splitTaxAmount,
    calculateGSTSplit,
    roundPaise,
    getGstRateForHsn,
} from '../indianGST.ts';

describe('roundPaise', () => {
    it('rounds half-away-from-zero to two decimals', () => {
        assert.equal(roundPaise(5.005), 5.01);
        assert.equal(roundPaise(2.675), 2.68);
        assert.equal(roundPaise(-5.005), -5.01);
        assert.equal(roundPaise(10), 10);
        assert.equal(roundPaise(0.0049999), 0);
    });
});

describe('splitTaxAmount reconciliation', () => {
    it('halves always sum EXACTLY to the total (₹10.01 case)', () => {
        const split = splitTaxAmount(10.01, false);
        assert.equal(split.cgst + split.sgst, split.total);
        // The classic float bug: both halves rounded independently gave 5.01 + 5.01 = 10.02.
        assert.deepEqual([split.cgst, split.sgst], [5.01, 5]);
    });

    it('odd paise remainder lands on CGST deterministically', () => {
        for (const total of [1.99, 3.33, 7.77, 100.01, 999.99]) {
            const s = splitTaxAmount(total, false);
            // Reconciliation holds at the paise level (binary float addition of
            // two exact paise values can still carry representation noise).
            assert.equal((s.cgst + s.sgst).toFixed(2), total.toFixed(2), `total ${total}`);
            assert.ok(s.cgst >= s.sgst);
        }
    });

    it('interstate puts everything on IGST', () => {
        const s = splitTaxAmount(1234.56, true);
        assert.deepEqual([s.cgst, s.sgst, s.igst], [0, 0, 1234.56]);
    });

    it('negative (return) amounts keep sign consistency', () => {
        const s = splitTaxAmount(-10.01, false);
        assert.equal(s.cgst + s.sgst, -10.01);
    });
});

describe('calculateGSTSplit', () => {
    it('computes paise-exact tax and reconciling halves', () => {
        // 28% on ₹10,000 inclusive? No — this helper taxes an exclusive amount.
        const s = calculateGSTSplit(10000, 28, false);
        assert.equal(s.total, 2800);
        assert.equal(s.cgst + s.sgst, s.total);

        const odd = calculateGSTSplit(333.33, 18, false);
        assert.equal(odd.total, roundPaise(333.33 * 0.18));
        assert.equal(odd.cgst + odd.sgst, odd.total);
    });
});

describe('getGstRateForHsn', () => {
    it('maps HSN codes to statutory rates', () => {
        assert.equal(getGstRateForHsn('8507'), 28);
        assert.equal(getGstRateForHsn('85076000'), 18);
        assert.equal(getGstRateForHsn('8541'), 12);
        assert.equal(getGstRateForHsn('unknown'), undefined);
        assert.equal(getGstRateForHsn(undefined), undefined);
    });
});
