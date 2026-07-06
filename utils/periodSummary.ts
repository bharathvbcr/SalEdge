import { Transaction, Expense } from '../types.ts';
import { PeriodSummarySnapshot, MonthlyBreakdownRow } from '../types.ts';

export type DayBookTotals = {
    cashIn: number;
    upiIn: number;
    cardIn: number;
    bankIn: number;
    cashExpenses: number;
    totalExpenses: number;
    expectedCash: number;
};

function isCashExpense(expense: Expense): boolean {
    return !expense.method || expense.method === 'Cash';
}

export function computeDayBook(
    transactions: Transaction[],
    expenses: Expense[],
    dateKey: string,
    firmId?: string
): DayBookTotals {
    const dayTxns = transactions.filter(t => {
        const inDay = t.date.startsWith(dateKey);
        const inFirm = !firmId || firmId === 'all' || t.firmId === firmId;
        return inDay && inFirm;
    });
    const dayExps = expenses.filter(e => e.date.startsWith(dateKey));

    let cashIn = 0;
    let upiIn = 0;
    let cardIn = 0;
    let bankIn = 0;

    dayTxns.forEach(t => {
        t.payments.forEach(p => {
            if (p.method === 'Cash') cashIn += p.amount;
            else if (p.method === 'UPI') upiIn += p.amount;
            else if (p.method === 'Card') cardIn += p.amount;
            else if (p.method === 'Bank Transfer') bankIn += p.amount;
        });
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
        expectedCash: cashIn - cashExpenses,
    };
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
        if (t.type === 'Return' || t.status === 'Quotation') return;
        transactionCount++;
        revenue += t.total;
        t.items.forEach(item => {
            if (item.isBuyback) return;
            const itemRevenue = item.price * item.quantity;
            const itemDiscount = item.discount
                ? (item.discount.type === 'percentage'
                    ? itemRevenue * (item.discount.value / 100)
                    : item.discount.value * item.quantity)
                : 0;
            const netItemRevenue = itemRevenue - itemDiscount;
            grossProfit += netItemRevenue - (item.purchasePrice ?? 0) * item.quantity;
        });
        t.payments.forEach(p => {
            if (p.method === 'Cash') cashIn += p.amount;
            else if (p.method === 'UPI') upiIn += p.amount;
            else if (p.method === 'Card') cardIn += p.amount;
        });
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const cashExpenses = expenses.filter(isCashExpense).reduce((sum, e) => sum + e.amount, 0);

    return {
        revenue,
        expenses: totalExpenses,
        grossProfit,
        netProfit: grossProfit - totalExpenses,
        transactionCount,
        cashIn,
        upiIn,
        cardIn,
        cashExpenses,
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
