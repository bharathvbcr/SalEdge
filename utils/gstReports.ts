import { Transaction, Purchase, ProductType } from '../types.ts';
import { computeHsnSummary } from './reports.ts';

export type Gstr3bSummary = {
    outwardTaxable: number;
    outwardTax: number;
    outwardCgst: number;
    outwardSgst: number;
    outwardIgst: number;
    inputTaxCredit: number;
    itcCgst: number;
    itcSgst: number;
    itcIgst: number;
    netTaxPayable: number;
    exemptSupplies: number;
    nilRatedSupplies: number;
};

export function computeGstr3b(
    transactions: Transaction[],
    purchases: Purchase[],
    productTypes: ProductType[],
    gstRate: number
): Gstr3bSummary {
    const sales = transactions.filter(
        t => (t.status === 'Paid' || t.status === 'Due') && t.type !== 'Return'
    );

    let outwardTaxable = 0;
    let outwardTax = 0;
    let outwardCgst = 0;
    let outwardSgst = 0;
    let outwardIgst = 0;

    sales.forEach(t => {
        const taxable = t.total - t.taxAmount;
        outwardTaxable += taxable;
        outwardTax += t.taxAmount;
        if (t.isInterstate) {
            outwardIgst += t.taxAmount;
        } else {
            outwardCgst += t.taxAmount / 2;
            outwardSgst += t.taxAmount / 2;
        }
    });

    const receivedPurchases = purchases.filter(p => p.status === 'Received');
    let inputTaxCredit = 0;
    let itcCgst = 0;
    let itcSgst = 0;
    let itcIgst = 0;

    receivedPurchases.forEach(p => {
        const rate = gstRate / 100;
        const taxable = p.totalAmount / (1 + rate);
        const tax = p.totalAmount - taxable;
        inputTaxCredit += tax;
        itcCgst += tax / 2;
        itcSgst += tax / 2;
    });

    const hsn = computeHsnSummary(sales, productTypes, gstRate);
    const exemptSupplies = 0;
    const nilRatedSupplies = 0;

    return {
        outwardTaxable,
        outwardTax,
        outwardCgst,
        outwardSgst,
        outwardIgst,
        inputTaxCredit,
        itcCgst,
        itcSgst,
        itcIgst,
        netTaxPayable: Math.max(0, outwardTax - inputTaxCredit),
        exemptSupplies,
        nilRatedSupplies,
    };
}

export function downloadCSV(data: Record<string, unknown>[], filename: string): void {
    if (data.length === 0) return;
    const header = Object.keys(data[0]).join(',');
    const csvRows = data.map(row =>
        Object.values(row).map(value => {
            const strValue = String(value);
            if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                return `"${strValue.replace(/"/g, '""')}"`;
            }
            return strValue;
        }).join(',')
    );
    const blob = new Blob([[header, ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

export function exportProfitLossCsv(
    profitLoss: {
        netRevenue: number;
        returns: number;
        cogs: number;
        grossProfit: number;
        netProfit: number;
        expenseByCategory: Record<string, number>;
    },
    currencySymbol: string,
    periodLabel: string
): void {
    const rows: Record<string, unknown>[] = [
        { Line: 'Net Sales Revenue', Amount: profitLoss.netRevenue },
        { Line: 'Sales Returns', Amount: -profitLoss.returns },
        { Line: 'Cost of Goods Sold', Amount: -profitLoss.cogs },
        { Line: 'Gross Profit', Amount: profitLoss.grossProfit },
        ...Object.entries(profitLoss.expenseByCategory).map(([cat, amt]) => ({
            Line: `Expense: ${cat}`,
            Amount: -Number(amt),
        })),
        { Line: 'Net Profit', Amount: profitLoss.netProfit },
    ];
    downloadCSV(rows, `P&L_${periodLabel}_${new Date().toISOString().split('T')[0]}.csv`);
}

export function exportAgingCsv(
    label: string,
    aging: {
        current: { count: number; amount: number };
        days31_60: { count: number; amount: number };
        days61_90: { count: number; amount: number };
        over90: { count: number; amount: number };
        total: { count: number; amount: number };
    },
    periodLabel: string
): void {
    downloadCSV([
        { Bucket: '0-30 Days', Count: aging.current.count, Amount: aging.current.amount },
        { Bucket: '31-60 Days', Count: aging.days31_60.count, Amount: aging.days31_60.amount },
        { Bucket: '61-90 Days', Count: aging.days61_90.count, Amount: aging.days61_90.amount },
        { Bucket: '90+ Days', Count: aging.over90.count, Amount: aging.over90.amount },
        { Bucket: 'Total', Count: aging.total.count, Amount: aging.total.amount },
    ], `${label}_Aging_${periodLabel}_${new Date().toISOString().split('T')[0]}.csv`);
}

export function exportGstr3bCsv(summary: Gstr3bSummary, periodLabel: string): void {
    downloadCSV([
        { Section: '3.1 Outward taxable supplies', TaxableValue: summary.outwardTaxable.toFixed(2), Tax: summary.outwardTax.toFixed(2) },
        { Section: 'CGST on outward', TaxableValue: '', Tax: summary.outwardCgst.toFixed(2) },
        { Section: 'SGST on outward', TaxableValue: '', Tax: summary.outwardSgst.toFixed(2) },
        { Section: 'IGST on outward', TaxableValue: '', Tax: summary.outwardIgst.toFixed(2) },
        { Section: '4 Input Tax Credit', TaxableValue: '', Tax: summary.inputTaxCredit.toFixed(2) },
        { Section: 'ITC CGST', TaxableValue: '', Tax: summary.itcCgst.toFixed(2) },
        { Section: 'ITC SGST', TaxableValue: '', Tax: summary.itcSgst.toFixed(2) },
        { Section: '6.1 Net tax payable', TaxableValue: '', Tax: summary.netTaxPayable.toFixed(2) },
    ], `GSTR3B_${periodLabel}_${new Date().toISOString().split('T')[0]}.csv`);
}
