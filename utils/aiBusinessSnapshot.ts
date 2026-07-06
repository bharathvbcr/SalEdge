import type { AiBusinessSnapshot, Expense, InventoryItem, ProductType, Purchase, Supplier, Transaction } from '../types.ts';
import { computeMomGrowth, computeMonthlySales } from './forecasting.ts';
import {
    computePayablesAging,
    computeProfitLoss,
    computeReceivablesAging,
    computeSlowMovingStock,
    getUpcomingDues,
} from './reports.ts';
import {
    filterByDateRange,
    getReportDateRange,
    REPORT_PERIOD_LABELS,
    type ReportPeriod,
} from './reportPeriods.ts';

export type AiSnapshotPeriod = ReportPeriod;

export const AI_PERIOD_LABELS = REPORT_PERIOD_LABELS;

const toIsoDate = (d: Date): string => d.toISOString().split('T')[0];

/** Percentage to one decimal, or null when the denominator is non-positive. */
const marginPct = (numerator: number, denominator: number): number | null =>
    denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;

export function buildAiBusinessSnapshot(
    filter: AiSnapshotPeriod,
    transactions: Transaction[],
    expenses: Expense[],
    purchases: Purchase[],
    inventory: InventoryItem[],
    productTypes: ProductType[],
    suppliers: Supplier[],
): AiBusinessSnapshot {
    const range = getReportDateRange(filter);
    // All transaction types in the period: computeProfitLoss ignores quotations
    // and nets returns internally.
    const periodTransactions = filterByDateRange(transactions, range);
    const periodExpenses = filterByDateRange(expenses, range);

    // Single source of truth for revenue / COGS / profit — the same statement the
    // P&L report renders, so the assistant's numbers reconcile with what the user
    // sees on screen (and revenue vs. gross profit share one consistent grain).
    const pl = computeProfitLoss(periodTransactions, periodExpenses);

    const completedSales = periodTransactions.filter(
        t => t.type !== 'Return' && t.status !== 'Quotation',
    );

    // Product ranking is line-grain and excludes tax/discounts/buyback/custom.
    // It is for ordering only and does NOT reconcile with sales totals.
    const productStats: Record<string, { name: string; qty: number; revenue: number }> = {};
    completedSales.forEach(t => {
        t.items.forEach(item => {
            if (item.isBuyback || item.isCustom) return;
            if (!productStats[item.id]) {
                productStats[item.id] = { name: item.name, qty: 0, revenue: 0 };
            }
            productStats[item.id].qty += item.quantity;
            productStats[item.id].revenue += item.price * item.quantity;
        });
    });
    const topProducts = Object.values(productStats)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map(p => ({ name: p.name, quantitySold: p.qty, lineRevenueExTax: Math.round(p.revenue) }));

    // Inventory health
    const stockPerProduct = inventory.reduce((acc, item) => {
        acc[item.productTypeId] = (acc[item.productTypeId] || 0) + item.stock;
        return acc;
    }, {} as Record<string, number>);
    const lowStockProductCount = productTypes.filter(pt => {
        if (!pt.lowStockThreshold || pt.lowStockThreshold <= 0) return false;
        return (stockPerProduct[pt.id] || 0) <= pt.lowStockThreshold;
    }).length;
    const slowMovingProductCount = computeSlowMovingStock(transactions, inventory, productTypes)
        .filter(r => r.daysSinceLastSale >= 90).length;

    // Receivables / payables are point-in-time as of today, independent of the
    // reporting period. Aging amounts come from the shared reports helpers so
    // they match the Receivables/Payables report pages.
    const asOf = new Date();
    asOf.setHours(0, 0, 0, 0);
    const { aging: recvAging } = computeReceivablesAging(transactions);
    const { aging: payAging } = computePayablesAging(purchases, suppliers);

    const isOverdue = (dueDateStr: string | undefined, fallback: string, due: number): boolean => {
        if (due <= 0.01) return false;
        const dueDate = new Date(dueDateStr || fallback);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < asOf;
    };
    const overdueInvoiceCount = transactions.filter(t => {
        if (t.status !== 'Due') return false;
        const paid = t.payments.reduce((s, p) => s + p.amount, 0);
        return isOverdue(t.paymentDueDate, t.date, t.total - paid);
    }).length;
    const overdueBillCount = purchases.filter(p => {
        if (p.paymentStatus === 'Paid') return false;
        return isOverdue(p.paymentDueDate, p.date, p.totalAmount - p.paidAmount);
    }).length;
    const upcomingDueInvoiceCount = getUpcomingDues(
        transactions.filter(t => t.status === 'Due'),
        t => t.total - t.payments.reduce((s, p) => s + p.amount, 0),
    ).length;
    const upcomingDueBillCount = getUpcomingDues(
        purchases.filter(p => p.paymentStatus === 'Due' || p.paymentStatus === 'Partial'),
        p => p.totalAmount - p.paidAmount,
    ).length;

    // Trend / momentum: trailing calendar months (all-time series) so the agent
    // can answer "compare to last month" questions.
    const monthlySales = computeMonthlySales(transactions);
    const momRows = computeMomGrowth(monthlySales);
    const latestMom = momRows.length > 0 ? momRows[momRows.length - 1] : null;
    const salesTrend = monthlySales.slice(-6).map(r => ({
        month: r.month,
        grossRevenue: Math.round(r.revenue),
        transactionCount: r.count,
    }));

    const bucketAmount = (b: { amount: number }) => Math.round(b.amount);

    return {
        period: AI_PERIOD_LABELS[filter],
        periodStartDate: toIsoDate(range.startDate),
        periodEndDate: toIsoDate(range.endDate),
        asOfDate: toIsoDate(asOf),
        currency: 'INR',
        sales: {
            revenueExTax: Math.round(pl.revenue),
            returnsValue: Math.round(pl.returns),
            cogs: Math.round(pl.cogs),
            grossProfit: Math.round(pl.grossProfit),
            operatingExpenses: Math.round(pl.expenses),
            netProfit: Math.round(pl.netProfit),
            grossMarginPct: marginPct(pl.grossProfit, pl.revenue),
            netMarginPct: marginPct(pl.netProfit, pl.revenue),
            transactionCount: completedSales.length,
        },
        momGrowth: latestMom ? { month: latestMom.month, growthPercent: latestMom.growth } : null,
        salesTrend,
        topProducts,
        inventory: { lowStockProductCount, slowMovingProductCount },
        receivables: {
            overdueInvoiceCount,
            upcomingDueInvoiceCount,
            agingAmountInr: {
                current: bucketAmount(recvAging.current),
                days31_60: bucketAmount(recvAging.days31_60),
                days61_90: bucketAmount(recvAging.days61_90),
                over90: bucketAmount(recvAging.over90),
                total: bucketAmount(recvAging.total),
            },
        },
        payables: {
            overdueBillCount,
            upcomingDueBillCount,
            agingAmountInr: {
                current: bucketAmount(payAging.current),
                days31_60: bucketAmount(payAging.days31_60),
                days61_90: bucketAmount(payAging.days61_90),
                over90: bucketAmount(payAging.over90),
                total: bucketAmount(payAging.total),
            },
        },
    };
}
