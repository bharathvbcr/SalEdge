/**
 * E-invoice integrity: a failed live GSP call must NEVER silently fall back
 * to fabricated IRNs — it must reject. Mock output must be distinctly marked.
 */
(globalThis as Record<string, unknown>).localStorage = {
    getItem: () => null,
    setItem: () => { },
    removeItem: () => { },
};

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    generateEInvoice,
    generateEWayBill,
    requiresEInvoice,
    requiresEWayBill,
    isValidIrn,
} from '../utils/eInvoiceService.ts';
import type { Transaction } from '../types.ts';

const baseTransaction = {
    id: 'TRN-test',
    firmId: 'FIRM001',
    type: 'Sale' as const,
    date: new Date().toISOString(),
    customerName: 'Test Buyer',
    customerGst: '07AAAAA0000A1Z5',
    items: [],
    subtotal: 60000,
    discount: { type: 'fixed' as const, value: 0 },
    taxRegime: 'Regular' as const,
    taxAmount: 0,
    total: 60000,
    payments: [],
    status: 'Paid' as const,
} as Transaction;

describe('generateEInvoice', () => {
    beforeEach(() => {
        // Simulate an unreachable server/GSP for every live-mode test.
        (globalThis as { fetch?: unknown }).fetch = async () => {
            throw new Error('network down');
        };
    });

    it('LIVE mode REJECTS on failure instead of fabricating an IRN', async () => {
        await assert.rejects(
            () => generateEInvoice(baseTransaction, 'live'),
            /network down/,
        );
    });

    it('mock output is explicitly marked MockGenerated (never "Generated")', async () => {
        const result = await generateEInvoice(baseTransaction, 'mock');
        assert.equal(result.status, 'MockGenerated');
        assert.ok(isValidIrn(result.irn));
        assert.match(result.ackNo, /^\d{1,15}$/);
    });
});

describe('generateEWayBill', () => {
    beforeEach(() => {
        (globalThis as { fetch?: unknown }).fetch = async () => {
            throw new Error('network down');
        };
    });

    it('LIVE mode rejects loudly on failure', async () => {
        await assert.rejects(
            () => generateEWayBill(baseTransaction, 'live'),
            /network down/,
        );
    });

    it('mock output is explicitly marked MockGenerated', async () => {
        const result = await generateEWayBill(baseTransaction, 'mock');
        assert.equal(result.status, 'MockGenerated');
        assert.match(result.eWayBillNo, /^\d{12}$/);
    });
});

describe('applicability rules', () => {
    it('e-invoice applies to B2B when the turnover mandate is enabled — regardless of invoice value', () => {
        // Regression: old logic keyed on ₹50k invoice value, which is the
        // E-WAY BILL threshold; the e-invoice mandate is turnover-based.
        const smallB2B = { ...baseTransaction, total: 5000 };
        assert.equal(requiresEInvoice(smallB2B, true), true);
        assert.equal(requiresEInvoice(smallB2B, false), false);
    });

    it('B2C invoices never require an IRN even with the mandate on', () => {
        const b2c = { ...baseTransaction, customerGst: undefined };
        assert.equal(requiresEInvoice(b2c, true), false);
    });

    it('e-way bill still keys on the ₹50k movement threshold for sales', () => {
        assert.equal(requiresEWayBill({ ...baseTransaction, total: 49999 }), false);
        assert.equal(requiresEWayBill({ ...baseTransaction, total: 50000 }), true);
        assert.equal(requiresEWayBill({ ...baseTransaction, total: 99999, type: 'Return' as const }), false);
    });
});
