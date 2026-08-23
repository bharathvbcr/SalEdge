import { Transaction, Expense, PaymentVoucher } from '../types.ts';
import { PeriodSummarySnapshot, MonthlyBreakdownRow } from '../types.ts';
import { roundPaise } from '../indianGST.ts';

export type DayBookTotals = {
    cashIn: number;
    upiIn: number;
    cardIn: number;
    bankIn: number;
    cashExpenses: number;
    totalExpenses: number;
    expectedCash: number;
    /** Cash moved into the bank via Contra deposits (reduces drawer). */
    cashDepositedToBank: number;
};

function isCashExpense(expense: Expense): boolean {
    return !expense.method || expense.method === 'Cash';
}

/**
 * Expected drawer contents for a day.
 *
 * Includes standalone Receipt/Payment vouchers — udhaar collections and cash
 * supplier payments are real drawer movements that previously made every
 * collection day look like a shortage. Contra vouchers move money between
 * the drawer and the bank: method Cash = deposit (cash→bank), any other
 * method = withdrawal (bank→cash).
 */
export function computeDayBook(
    transactions: Transaction[],
    expenses: Expense[],
    dateKey: string,
    firmId?: string,
    paymentVouchers: PaymentVoucher[] = []
): DayBookTotals {
    const inDay = (date: string) => date.startsWith(dateKey);
    const inDayInFirm = (date: string, ownerFirmId: string) => {
        return inDay(date) && (!firmId || firmId === 'all' || ownerFirmId === firmId);
    };

    const dayTxns = transactions.filter(t => inDayInFirm(t.date, t.firmId));
    const dayExps = expenses.filter(e => inDay(e.date));
    // Contra entries move money between the drawer and the bank, so they are
    // shop-wide rather than per-firm.
    const dayVouchers = paymentVouchers.filter(v =>
        v.type === 'Contra' ? inDay(v.date) : inDayInFirm(v.date, v.firmId)
    );

    let cashIn = 0;
    let upiIn = 0;
    let cardIn = 0;
    let bankIn = 0;

    dayTxns.forEach(t => {
        // Return payments are refund payouts — they must reduce the day's
        // collections, mirroring computePeriodSummary. Otherwise every
        // collection day after a refund looks like a cash shortage.
        const direction = t.type === 'Return' ? -1 : 1;
        t.payments.forEach(p => {
            if (p.method === 'Cash') cashIn += direction * p.amount;
            else if (p.method === 'UPI') upiIn += direction * p.amount;
            else if (p.method === 'Card') cardIn += direction * p.amount;
            else if (p.method === 'Bank Transfer') bankIn += direction * p.amount;
        });
    });

    // Vouchers: Receipts add to the drawer/bank, Payments subtract.
    dayVouchers.forEach(v => {
        const delta = v.type === 'Receipt' ? v.amount : -v.amount;
        if (v.type === 'Contra') return; // handled below
        if (v.method === 'Cash') cashIn += delta;
        else if (v.method === 'UPI') upiIn += delta;
        else if (v.method === 'Card') cardIn += delta;
        else bankIn += delta;
    });

    let cashDepositedToBank = 0;
    dayVouchers.filter(v => v.type === 'Contra').forEach(v => {
        if (v.method === 'Cash') {
            // Drawer → bank deposit.
            cashIn -= v.amount;
            bankIn += v.amount;
            cashDepositedToBank += v.amount;
        } else {
            // Bank → drawer withdrawal.
            bankIn -= v.amount;
            cashIn += v.amount;
        }
    });

    const totalExpenses = dayExps.reduce((sum, e) => sum + e.amount, 0);
    const cashExpenses = dayExps.filter(isCashExpense).reduce((sum, e) => sum + e.amount, 0);

    return {
        cashIn,
        upiIn,
        cardIn,
        bankIn,
        cashExpenses,
        totalExpenses,
        expectedCash: roundPaise(cashIn - cashExpenses),
        cashDepositedToBank,
    };
}

function accumulateItemProfit(
    items: Transaction['items'],
    direction: 1 | -1
): number {
    let profitDelta = 0;
    items.forEach(item => {
        if (item.isBuyback) return;
        const itemRevenue = item.price * item.quantity;
        const itemDiscount = item.discount
            ? (item.discount.type === 'percentage'
                ? itemRevenue * (item.discount.value / 100)
                : item.discount.value * item.quantity)
            : 0;
        profitDelta += (itemRevenue - itemDiscount) - (item.purchasePrice ?? 0) * item.quantity;
    });
    return direction * profitDelta;
}

export function computePeriodSummary(
    transactions: Transaction[],
    expenses: Expense[]
): PeriodSummarySnapshot {
    let revenue = 0;
    let grossProfit = 0;
    let transactionCount = 0;
    let cashIn = 0;
    let upiIn = 0;
    let cardIn = 0;

    transactions.forEach(t => {
        if (t.status === 'Quotation') return;

        if (t.type === 'Return') {
            // Credit notes reduce the period's revenue/profit instead of
            // vanishing from the close.
            revenue -= t.total;
            grossProfit -= accumulateItemProfit(t.items, 1);
            t.payments.forEach(p => {
                if (p.method === 'Cash') cashIn -= p.amount;
                else if (p.method === 'UPI') upiIn -= p.amount;
                else if (p.method === 'Card') cardIn -= p.amount;
            });
            return;
        }

        transactionCount++;
        revenue += t.total;
        grossProfit += accumulateItemProfit(t.items, 1);
        t.payments.forEach(p => {
            if (p.method === 'Cash') cashIn += p.amount;
            else if (p.method === 'UPI') upiIn += p.amount;
            else if (p.method === 'Card') cardIn += p.amount;
        });
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const cashExpenses = expenses.filter(isCashExpense).reduce((sum, e) => sum + e.amount, 0);

    return {
        revenue: roundPaise(revenue),
        expenses: totalExpenses,
        grossProfit: roundPaise(grossProfit),
        netProfit: roundPaise(grossProfit - totalExpenses),
        transactionCount,
        cashIn: roundPaise(cashIn),
        upiIn: roundPaise(upiIn),
        cardIn: roundPaise(cardIn),
        cashExpenses: roundPaise(cashExpenses),
    };
}

export function computeMonthlyBreakdownForYear(
    transactions: Transaction[],
    expenses: Expense[],
    year: number
): MonthlyBreakdownRow[] {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const rows: MonthlyBreakdownRow[] = [];

    for (let month = 0; month < 12; month++) {
        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
        const monthTxns = transactions.filter(t => {
            const d = new Date(t.date);
            return d >= start && d <= end;
        });
        const monthExps = expenses.filter(e => {
            const d = new Date(e.date);
            return d >= start && d <= end;
        });
        const summary = computePeriodSummary(monthTxns, monthExps);
        rows.push({
            month: month + 1,
            label: monthNames[month],
            revenue: summary.revenue,
            expenses: summary.expenses,
            profit: summary.netProfit,
            transactionCount: summary.transactionCount,
        });
    }

    return rows;
}
