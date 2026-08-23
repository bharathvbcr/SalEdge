import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeSaleTotals, extractGstFromFinalMulti } from '../utils/salePricing.ts';
import { CartItem } from '../components/sales/types.ts';
import { computeBalances } from '../utils/bankingBalances.ts';
import { computeDayBook, computePeriodSummary } from '../utils/periodSummary.ts';
import { computeGstr3b } from '../utils/gstReports.ts';
import { isValidSaleDraft } from '../utils/saleDraft.ts';
import { parsePurchaseJson } from '../utils/purchaseImport.ts';
import type { Transaction } from '../types.ts';

// ---------------------------------------------------------------------------
// Canonical return convention (credit notes): total > 0, taxAmount > 0,
// payments[].amount > 0. This is what SalesForm now persists and what the
// one-shot AppDataContext heal produces.
// ---------------------------------------------------------------------------

function txn(partial: Partial<Transaction>): Transaction {
    return {
        id: 'T1', firmId: 'F1', type: 'Sale', date: new Date().toISOString(),
        customerName: 'C', customerPhone: '9', items: [], subtotal: 0,
        discount: { type: 'fixed', value: 0 }, taxRegime: 'Regular',
        taxAmount: 0, total: 1000, payments: [], status: 'Paid', ...partial,
    };
}

function cartItem(partial: Partial<CartItem>): CartItem {
    return {
        itemId: 'x', name: 'Battery', quantity: 1, price: 1000,
        serialNumbers: ['SN1'], discount: { type: 'fixed', value: 0 },
        ...partial,
    };
}

describe('audit fixes: mixed-sign GST extraction', () => {
    it('buyback offsets GST instead of being taxed as a positive supply', () => {
        // ₹10,000 net @28% + ₹5,000 buyback @18% → ₹5,000 invoice.
        // Pre-fix: both buckets abs()'d → tax 2187.50 + 762.71 = 2950.21 (~2x).
        const result = extractGstFromFinalMulti(5000, 18, 'Regular', [
            { rate: 28, net: 10000 },
            { rate: 18, net: -5000 },
        ]);
        assert.equal(result.taxAmount, 1424.79); // 2187.50 − 762.71
        assert.deepEqual(result.perRateTax.find(p => p.rate === 18)!.tax, -762.71);
        assert.ok(Math.abs(result.taxableAmount + result.taxAmount - 5000) < 0.02);
    });

    it('pure-credit carts keep negative tax without double sign-flipping', () => {
        const result = extractGstFromFinalMulti(-12000, 18, 'Regular', [
            { rate: 28, net: -10000 },
            { rate: 18, net: -2000 },
        ]);
        assert.equal(result.taxAmount, -(2187.5 + 305.08));
        assert.ok(Math.abs(result.taxableAmount + result.taxAmount + 12000) < 0.02);
    });

    it('exchange sale end-to-end: offsets keep their sign under pro-rata allocation', () => {
        const totals = computeSaleTotals({
            cart: [
                cartItem({ itemId: 'bat', price: 28000, gstRate: 28 }),
                cartItem({ itemId: 'old', name: 'Buyback', price: -14000, isBuyback: true }),
            ],
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
        assert.equal(totals.total, 14000);
        // Allocation factor = |final| / |netted base| = 14000/14000 = 1:
        // bucket 28 → +6125.00, bucket 18 → −2135.59. The pre-fix Math.abs()
        // charged BOTH positively: 8260.59 (59% effective rate).
        assert.equal(totals.taxAmount, 3989.41);
        assert.ok(Math.abs(totals.taxableAmount + totals.taxAmount - totals.total) < 0.02);
    });

    it('uniform-rate path is byte-identical to the legacy formula', () => {
        const legacy = extractGstFromFinalMulti(32509, 18, 'Regular', [{ rate: 18, net: 27550 }]);
        assert.equal(legacy.perRateTax.length, 1);
        assert.equal(legacy.taxAmount, Math.round((32509 * 18 / 118) * 100) / 100);
    });
});

describe('audit fixes: refund money direction', () => {
    it('computeBalances subtracts cash refunds instead of adding them', () => {
        const balances = computeBalances(
            [
                txn({ total: 10000, payments: [{ method: 'Cash' as const, amount: 10000 }] }),
                txn({ id: 'R1', type: 'Return' as const, total: 4000, payments: [{ method: 'Cash' as const, amount: 4000 }] }),
            ],
            [], [], [],
        );
        // Pre-fix: 14,000 — refunds made the drawer richer.
        assert.equal(balances.cashBalance, 6000);
        assert.equal(balances.bankBalance, 0);
    });

    it('computeBalances subtracts non-cash refunds from the bank ledger', () => {
        const balances = computeBalances(
            [txn({ total: 2500, type: 'Return' as const, payments: [{ method: 'UPI' as const, amount: 2500 }] })],
            [], [], [],
        );
        assert.equal(balances.bankBalance, -2500);
    });

    it("computeDayBook counts a same-day refund payout as money OUT", () => {
        const day = new Date().toISOString();
        const book = computeDayBook(
            [
                txn({ date: day, total: 10000, payments: [{ method: 'Cash' as const, amount: 10000 }] }),
                txn({ id: 'R1', type: 'Return' as const, date: day, total: 4000, payments: [{ method: 'Cash' as const, amount: 4000 }] }),
            ],
            [], day.slice(0, 10),
        );
        assert.equal(book.cashIn, 6000);
        assert.equal(book.expectedCash, 6000);
    });

    it("a refund day on its own shows NEGATIVE expected cash (money left the drawer)", () => {
        const day = new Date().toISOString();
        const book = computeDayBook(
            [txn({ id: 'R1', type: 'Return' as const, date: day, total: 4000, payments: [{ method: 'Cash' as const, amount: 4000 }] })],
            [], day.slice(0, 10),
        );
        assert.equal(book.expectedCash, -4000);
    });

    it('day book matches period summary on mixed sale+refund days', () => {
        const day = new Date().toISOString();
        const txns = [
            txn({ date: day, total: 8000, payments: [{ method: 'Cash' as const, amount: 8000 }] }),
            txn({ id: 'R1', type: 'Return' as const, date: day, total: 3000, payments: [{ method: 'Cash' as const, amount: 3000 }] }),
            txn({ id: 'T9', date: day, total: 2000, payments: [{ method: 'UPI' as const, amount: 2000 }] }),
        ];
        const book = computeDayBook(txns, [], day.slice(0, 10));
        const period = computePeriodSummary(txns, []);
        assert.equal(book.cashIn, period.cashIn);
        assert.equal(book.upiIn, period.upiIn);
    });
});

describe('audit fixes: GSTR-3B credit-note netting', () => {
    it('nets credit notes against outward supplies instead of dropping them', () => {
        const summary = computeGstr3b(
            [
                txn({ total: 59000, taxAmount: 9000, totalCgst: 4500, totalSgst: 4500 }),
                txn({ id: 'R1', type: 'Return' as const, total: 5900, taxAmount: 900, totalCgst: 450, totalSgst: 450 }),
            ],
            [],
        );
        // Pre-fix: outward taxable 50,000/tax 9,000 (return dropped entirely).
        assert.equal(summary.outwardTaxable, 45000);
        assert.equal(summary.outwardTax, 8100);
        assert.equal(summary.outwardCgst, 4050);
        assert.equal(summary.outwardSgst, 4050);
    });

    it('reports excess ITC as negative net payable (carryforward), not masked zero', () => {
        const summary = computeGstr3b(
            [txn({ total: 1180, taxAmount: 180 })],
            [{
                id: 'P1', supplierId: 'S1', firmId: 'F1', supplierInvoiceNumber: 'INV-1', date: new Date().toISOString(),
                status: 'Received' as const, paymentStatus: 'Due' as const, paidAmount: 0,
                items: [{ productTypeId: 'PT1', type: 'New' as const, quantity: 10, unitPrice: 100, mrp: 130, taxRate: 18, taxAmount: 180, total: 1180 }],
                subtotal: 1000, totalTax: 180, totalAmount: 1180, entryDate: new Date().toISOString(), paymentMethod: 'UPI' as const,
            }],
        );
        assert.equal(summary.inputTaxCredit, 180);
        assert.equal(summary.netTaxPayable, 0); // exact offset nets to zero
    });

    it('genuinely negative positions flow through as credit carryforward', () => {
        const summary = computeGstr3b([], [{
            id: 'P1', supplierId: 'S1', firmId: 'F1', supplierInvoiceNumber: 'INV-1', date: new Date().toISOString(),
            status: 'Received' as const, paymentStatus: 'Due' as const, paidAmount: 0,
            items: [{ productTypeId: 'PT1', type: 'New' as const, quantity: 10, unitPrice: 100, mrp: 130, taxRate: 18, taxAmount: 180, total: 1180 }],
            subtotal: 1000, totalTax: 180, totalAmount: 1180, entryDate: new Date().toISOString(), paymentMethod: 'UPI' as const,
        }]);
        assert.equal(summary.netTaxPayable, -180);
    });
});

describe('audit fixes: purchase import validation', () => {
    const ctx = {
        suppliers: [{ id: 'S1', name: 'Exide Depot', contactPerson: '', phone: '' }],
        productTypes: [{
            id: 'PT1', brandName: 'Exide', name: 'Battery', category: 'Automotive',
            specifications: { capacity: '150Ah', voltage: '12V' },
        }],
        defaultFirmId: 'F1',
    };

    it('rejects negative GST rates that previously reduced bill totals', () => {
        const result = parsePurchaseJson(JSON.stringify([{
            supplierName: 'Exide Depot', supplierInvoiceNumber: 'X-1', firmId: 'F1', status: 'Ordered',
            items: [{ productName: 'Battery', quantity: 2, unitPrice: 1000, mrp: 1200, taxRate: -18 }],
        }]), ctx);
        assert.equal(result.purchases.length, 0);
        assert.ok(result.errors.some(e => e.includes('GST rate')));
    });

    it('rejects out-of-statutory-range rates (>28%)', () => {
        const result = parsePurchaseJson(JSON.stringify([{
            supplierName: 'Exide Depot', supplierInvoiceNumber: 'X-2', firmId: 'F1', status: 'Ordered',
            items: [{ productName: 'Battery', quantity: 1, unitPrice: 100, mrp: 120, taxRate: 999 }],
        }]), ctx);
        assert.equal(result.purchases.length, 0);
    });

    it('still accepts legitimate statutory rates', () => {
        const result = parsePurchaseJson(JSON.stringify([{
            supplierName: 'Exide Depot', supplierInvoiceNumber: 'X-3', firmId: 'F1', status: 'Ordered',
            items: [{ productName: 'Battery', quantity: 1, unitPrice: 100, mrp: 120, taxRate: 28 }],
        }]), ctx);
        assert.equal(result.errors.length, 0);
        assert.equal(result.purchases[0].items[0].taxAmount, 28);
    });
});

describe('audit fixes: sale draft validation', () => {
    const validDraft = {
        savedAt: new Date().toISOString(),
        selectedFirmId: 'F1', saleDate: '2026-08-22', customerName: 'A', customerPhone: '',
        customerGst: '', billingAddress: '', vehicleNumber: '', vehicleModel: '',
        saleCategory: '', placeOfSupply: '',
        cart: [{ itemId: 'a', name: 'B', quantity: 1, price: 100, serialNumbers: [''], discount: { type: 'fixed', value: 0 } }],
        payments: [{ id: 1, method: 'Cash', amount: 100 }],
        notes: '', wizardStep: 0,
    };

    it('accepts well-formed drafts', () => {
        assert.equal(isValidSaleDraft(validDraft), true);
    });

    it('rejects drafts with corrupted cart items (missing serialNumbers array)', () => {
        const bad = { ...validDraft, cart: [{ ...validDraft.cart[0], serialNumbers: undefined }] };
        assert.equal(isValidSaleDraft(bad as never), false);
    });

    it('rejects NaN prices and negative payment amounts', () => {
        assert.equal(isValidSaleDraft({ ...validDraft, cart: [{ ...validDraft.cart[0], price: NaN }] }), false);
        assert.equal(isValidSaleDraft({ ...validDraft, payments: [{ id: 1, method: 'Cash', amount: -5 }] }), false);
    });

    it('rejects non-array or missing cart/payments wholesale', () => {
        assert.equal(isValidSaleDraft({ ...validDraft, cart: 'nope' as never }), false);
        assert.equal(isValidSaleDraft({ ...validDraft, payments: null as never }), false);
    });
});
