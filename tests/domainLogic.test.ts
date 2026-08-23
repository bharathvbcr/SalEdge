import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeCustomerFinancials } from '../utils/customerStats.ts';
import { computeProfitLoss } from '../utils/reports.ts';
import { computeDayBook, computePeriodSummary } from '../utils/periodSummary.ts';
import { computeBalances } from '../utils/bankingBalances.ts';
import { addMonthsClamped, computeWarrantyEnds, calendarDaysUntil, isOnOrBeforeDay } from '../utils/warrantyDates.ts';
import { getWarrantyStatus } from '../utils/warrantyLookup.ts';
import { toDateKey } from '../utils/reportPeriods.ts';
import { toDateKeyLocal } from '../utils/localDate.ts';
import { setSaleQueue, getSaleQueue, MobileSaleQueueItem } from '../utils/mobileSaleQueue.ts';
import { Expense, PaymentVoucher, Transaction, WarrantyLog } from '../types.ts';

const LOYALTY = { enabled: true, earnRate: 1000 };

function txn(partial: Partial<Transaction>): Transaction {
    return {
        id: 'T1', firmId: 'F1', type: 'Sale', date: new Date().toISOString(),
        customerName: 'C', customerPhone: '9', items: [], subtotal: 0,
        discount: { type: 'fixed', value: 0 }, taxRegime: 'Regular',
        taxAmount: 0, total: 1000, payments: [{ method: 'Cash', amount: 1000 }],
        status: 'Paid', ...partial,
    };
}

describe('customerStats (canonical aggregates)', () => {
    it('ignores quotations entirely — no phantom dues or points', () => {
        const f = computeCustomerFinancials(
            [txn({ status: 'Quotation', total: 50000 })], [], LOYALTY,
        );
        assert.equal(f.totalSpent, 0);
        assert.equal(f.totalDue, 0);
        assert.equal(f.loyaltyPoints, 0);
    });

    it('returns REVERSE spend and dues instead of adding to them', () => {
        // Regression: returns were counted as positive sales (totals stay positive).
        const f = computeCustomerFinancials(
            [
                txn({ total: 10000, payments: [{ method: 'Cash', amount: 10000 }] }), // fully paid
                txn({ id: 'R1', type: 'Return', total: 4000, payments: [] }),
            ], [], LOYALTY,
        );
        assert.equal(f.totalSpent, 6000);
        assert.equal(f.totalDue, 0); // return leaves a credit position, clamped at zero
    });

    it('claws back loyalty points earned on refunded sales', () => {
        const f = computeCustomerFinancials(
            [
                txn({ total: 10000 }),                       // earns 10
                txn({ id: 'R1', type: 'Return', total: 5000, payments: [] }), // claw back 5
            ], [], LOYALTY,
        );
        assert.equal(f.loyaltyPoints, 5);
    });

    it('unpaid dues count only the unpaid remainder', () => {
        const f = computeCustomerFinancials(
            [txn({ status: 'Due', total: 12000, payments: [{ method: 'Cash', amount: 2000 }] })],
            [], LOYALTY,
        );
        assert.equal(f.totalDue, 10000);
    });

    it('voucher receipts settle dues (the udhaar-collection flow)', () => {
        const vouchers: PaymentVoucher[] = [{
            id: 'V1', date: new Date().toISOString(), type: 'Receipt', firmId: 'F1',
            partyType: 'Customer', partyId: 'c|9', partyName: 'C', amount: 3000,
            method: 'Cash',
        }];
        const f = computeCustomerFinancials(
            [txn({ status: 'Due', total: 8000, payments: [] })],
            vouchers, LOYALTY,
        );
        assert.equal(f.totalDue, 5000);
    });
});

describe('profit & loss with returns', () => {
    it('netRevenue SUBTRACTS returns — a return can no longer increase profit', () => {
        const pl = computeProfitLoss(
            [
                txn({ total: 11800, taxAmount: 1800 }),                    // ex-tax 10000
                txn({ id: 'R1', type: 'Return', total: 5900, taxAmount: 900, payments: [] }),
            ],
            [],
        );
        assert.equal(pl.revenue, 10000);
        assert.equal(pl.returns, 5000);          // ex-tax basis
        assert.equal(pl.netRevenue, 5000);       // was 10000 before the fix
    });
});

describe('daily close day book with vouchers', () => {
    it('includes cash Receipt vouchers in expected drawer cash', () => {
        // Regression: udhaar collections made every close look like a shortage.
        const db = computeDayBook([], [], '2026-08-22', 'all', [
            { id: 'V1', date: '2026-08-22T10:00:00Z', type: 'Receipt', firmId: 'F1', partyName: 'C', amount: 2500, method: 'Cash' },
        ]);
        assert.equal(db.cashIn, 2500);
        assert.equal(db.expectedCash, 2500);
    });

    it('Contra deposits move drawer cash OUT; non-cash Contra withdrawals move it IN', () => {
        const deposited = computeDayBook([], [], '2026-08-22', 'all', [
            { id: 'C1', date: '2026-08-22T10:00:00Z', type: 'Contra', firmId: 'F1', partyName: 'x', amount: 7000, method: 'Cash' },
        ]);
        assert.equal(deposited.expectedCash, -7000);
        assert.equal(deposited.bankIn, 7000);

        const withdrawn = computeDayBook([], [], '2026-08-22', 'all', [
            { id: 'C2', date: '2026-08-22T10:00:00Z', type: 'Contra', firmId: 'F1', partyName: 'x', amount: 3000, method: 'UPI' },
        ]);
        assert.equal(withdrawn.expectedCash, 3000);
        assert.equal(withdrawn.bankIn, -3000);
    });

    it('banking balances handle contra in BOTH directions (was silently ignored)', () => {
        const b = computeBalances([], [], [], [
            { id: 'C1', date: '', type: 'Contra', firmId: 'F1', partyName: 'x', amount: 1000, method: 'Cash' },
            { id: 'C2', date: '', type: 'Contra', firmId: 'F1', partyName: 'x', amount: 400, method: 'Bank Transfer' },
        ]);
        // Deposit moves cash→bank (−1000/+1000); withdrawal bank→cash (+400/−400).
        assert.equal(b.cashBalance, -1000 + 400);
        assert.equal(b.bankBalance, 1000 - 400);
    });
});

describe('period summary with credit notes', () => {
    it('returns reduce revenue/profit instead of vanishing from closes', () => {
        const s = computePeriodSummary(
            [
                txn({ total: 10000 }),
                txn({ id: 'R1', type: 'Return', total: 2500, payments: [] }),
            ],
            [],
        );
        assert.equal(s.revenue, 7500);
    });

    it('rounds money accumulations to paise', () => {
        const s = computePeriodSummary([txn({ total: 999.999 })], []);
        assert.equal(s.revenue, Math.round(999.999 * 100) / 100);
    });
});

describe('warranty date math (month-end clamping)', () => {
    it('Jan 31 + 1 month ends Feb 28/29 — NOT Mar 3', () => {
        const end = addMonthsClamped(new Date(2026, 0, 31), 1);   // non-leap year
        assert.deepEqual([end.getMonth(), end.getDate()], [1, 28]);
        const leap = addMonthsClamped(new Date(2028, 0, 31), 1);
        assert.deepEqual([leap.getMonth(), leap.getDate()], [1, 29]);
    });

    it('Aug 31 + 1 month lands on Sep 30', () => {
        const end = addMonthsClamped(new Date(2026, 7, 31), 1);
        assert.deepEqual([end.getMonth(), end.getDate()], [8, 30]);
    });

    it('leap-day sale + 12 months stays in February', () => {
        const end = addMonthsClamped(new Date(2028, 1, 29), 12);
        assert.equal(end.getMonth(), 1); // February
        assert.ok(end.getDate() <= 28);
    });

    it('computeWarrantyEnds chains guarantee + pro-rata windows from the SALE date', () => {
        const w = computeWarrantyEnds(new Date(2026, 0, 31), 1, 11);
        // Guarantee ends Feb (clamped); warranty ends sale+12mo = Jan next year.
        assert.deepEqual(
            [new Date(w.guaranteeEndDate).getMonth(), new Date(w.warrantyEndDate).getMonth()],
            [1, 0],
        );
        assert.deepEqual(new Date(w.warrantyEndDate).getDate(), 31);
    });

    it('coverage does not lapse mid-morning of the expiry day', () => {
        // End stored as UTC instant 05:30 IST; "now" is earlier that same local day.
        const end = new Date(2027, 0, 31, 12, 0, 0);
        const nowSameDayEarlier = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 0, 30, 0);
        assert.equal(isOnOrBeforeDay(nowSameDayEarlier, end), true);
        assert.equal(calendarDaysUntil(end, nowSameDayEarlier), 0);
    });

    it('getWarrantyStatus uses calendar-day comparison', () => {
        const log = {
            guaranteeEndDate: new Date(2030, 0, 15).toISOString(),
            warrantyEndDate: new Date(2031, 0, 15).toISOString(),
        } as WarrantyLog;
        const duringGuarantee = getWarrantyStatus(log);
        assert.equal(duringGuarantee.text, 'In Guarantee');
    });
});

describe('local-calendar day keys (IST midnight safety)', () => {
    it('keys derive from LOCAL getters, never UTC-shifted', () => {
        // Constructed via local getters → same key regardless of machine TZ.
        const d = new Date(2026, 7, 23, 2, 0, 0); // local Aug 23, 02:00
        assert.equal(toDateKey(d), '2026-08-23');
        assert.equal(toDateKeyLocal(d), '2026-08-23');
    });
});

describe('mobile scan queue storage failures', () => {
    it('quota/security errors do not break queue writes', () => {
        const original = globalThis.sessionStorage;
        Object.defineProperty(globalThis, 'sessionStorage', {
            configurable: true,
            value: {
                getItem: () => null,
                setItem: () => { throw new Error('QuotaExceededError'); },
            },
        });
        try {
            const item: MobileSaleQueueItem = {
                inventoryItemId: 'INV-1', firmId: 'SHARED', scannedCode: 'SN1', label: 'Battery',
            };
            assert.doesNotThrow(() => setSaleQueue([item]));
            assert.deepEqual(getSaleQueue(), []); // nothing persisted, no crash
        } finally {
            Object.defineProperty(globalThis, 'sessionStorage', {
                configurable: true,
                value: original,
            });
        }
    });
});
