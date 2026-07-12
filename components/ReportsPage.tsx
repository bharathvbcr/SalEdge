

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { Transaction } from '../types.ts';
import { IconDownload, IconCalendar } from './icons.tsx';
import { PageHeader } from './PageHeader.tsx';
import { EmptyState } from './EmptyState.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { DEFAULT_BATTERY_HSN } from '../indianGST.ts';
import {
    computeReceivablesAging,
    computePayablesAging,
    computeHsnSummary,
    computeProfitLoss,
    computeInventoryTurnover,
    computeSlowMovingStock,
    computeSalesByCategory,
} from '../utils/reports.ts';
import { filterByDateRange, getReportDateRange, type ReportPeriod } from '../utils/reportPeriods.ts';
import { consumeReportsFilterRequest } from '../utils/pageActions.ts';
import { usePageIntent } from '../hooks/usePageIntent.ts';
import { computeDayBook } from '../utils/periodSummary.ts';
import { PeriodFilterBar } from './PeriodFilterBar.tsx';
import { DailyCloseSection } from './DailyCloseSection.tsx';
import { WeeklySummarySection, AnnualSummarySection, MonthlyYearlyCloseSection } from './MonthlyYearlyCloseSection.tsx';
import { computeGstr3b, exportProfitLossCsv, exportAgingCsv, exportGstr3bCsv } from '../utils/gstReports.ts';
import {
    computeMonthlySales,
    computeSeasonalYoY,
    computeMovingAverageForecast,
    computeMomGrowth,
} from '../utils/forecasting.ts';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

type FilterPeriod = ReportPeriod;

const ReportMetric: React.FC<{ label: string; value: string; subvalue?: string; colorClass?: string }> = ({ label, value, subvalue, colorClass = 'text-text-primary' }) => (
    <div className="bg-bg-tertiary p-4 rounded-lg">
        <p className="text-sm text-text-muted">{label}</p>
        <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
        {subvalue && <p className="text-xs text-text-secondary">{subvalue}</p>}
    </div>
);


export const ReportsPage: React.FC = () => {
    const { addToast } = useToast();
    const { transactions, expenses, inventory, purchases } = useAppData();
    const { productTypes, suppliers } = useMasterData();
    const { defaultFirm, config } = useConfig();
    const [filter, setFilter] = useState<FilterPeriod>('last7');
    const [firmFilter, setFirmFilter] = useState<string>('all');

    const applyReportsFilterIntent = useCallback(() => {
        const request = consumeReportsFilterRequest();
        if (request?.period) {
            setFilter(request.period as FilterPeriod);
        }
        if (request?.firmId) {
            setFirmFilter(request.firmId);
        }
    }, []);

    usePageIntent(applyReportsFilterIntent);

    const { filteredTransactions, filteredExpenses, periodDays } = useMemo(() => {
        const range = getReportDateRange(filter);
        const firmFiltered = transactions.filter(t => {
            const inPeriod = filterByDateRange([t], range).length > 0;
            const inFirm = firmFilter === 'all' || t.firmId === firmFilter;
            return inPeriod && inFirm;
        });

        return {
            filteredTransactions: firmFiltered,
            filteredExpenses: filterByDateRange(expenses, range),
            periodDays: range.periodDays,
        };
    }, [transactions, expenses, filter, firmFilter]);

    const salesReport = useMemo(() => {
        const totalRevenue = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
        const totalDiscount = filteredTransactions.reduce((sum, t) => {
            const preDiscountTotal = t.subtotal;
            const postDiscountTotal = t.total - t.taxAmount;
            return sum + (preDiscountTotal - postDiscountTotal);
        }, 0);

        const totalTax = filteredTransactions.reduce((sum, t) => sum + t.taxAmount, 0);
        const numTransactions = filteredTransactions.length;

        return { totalRevenue, totalDiscount, totalTax, numTransactions };
    }, [filteredTransactions]);

    const profitReport = useMemo(() => {
        let totalRevenue = 0;
        let totalCOGS = 0;
        const profitByItem: { [key: string]: { name: string; profit: number; count: number } } = {};

        filteredTransactions.forEach(t => {
            if (t.type === 'Return') return; // Exclude returns from simple profit calc for now or handle them

            t.items.forEach(item => {
                if (!item.isBuyback) {
                    const itemTotal = item.price * item.quantity;
                    const itemDiscountAmount = item.discount ? (item.discount.type === 'percentage' ? itemTotal * (item.discount.value / 100) : item.discount.value * item.quantity) : 0;
                    const itemRevenue = itemTotal - itemDiscountAmount;
                    totalRevenue += itemRevenue;

                    if (item.purchasePrice) {
                        const itemCOGS = item.purchasePrice * item.quantity;
                        const itemProfit = itemRevenue - itemCOGS;
                        totalCOGS += itemCOGS;

                        if (!profitByItem[item.id]) {
                            profitByItem[item.id] = { name: item.name, profit: 0, count: 0 };
                        }
                        profitByItem[item.id].profit += itemProfit;
                        profitByItem[item.id].count += item.quantity;
                    }
                }
            });
        });

        const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
        const grossProfit = totalRevenue - totalCOGS;
        const netProfit = grossProfit - totalExpenses;

        const topProfitableItems = Object.values(profitByItem)
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 5);

        return { totalRevenue, totalCOGS, grossProfit, totalExpenses, netProfit, topProfitableItems };
    }, [filteredTransactions, filteredExpenses]);

    const dayBook = useMemo(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        const book = computeDayBook(transactions, expenses, todayStr, firmFilter);
        return {
            cashIn: book.cashIn,
            upiIn: book.upiIn,
            cardIn: book.cardIn,
            expenseOut: book.totalExpenses,
        };
    }, [transactions, expenses, firmFilter]);


    const customerReport = useMemo(() => {
        const spendingByCustomer: { [key: string]: { name: string; phone: string; spent: number } } = {};

        filteredTransactions.forEach(t => {
            if (t.customerName && t.customerName !== 'Walk-in') {
                const key = `${t.customerName}|${t.customerPhone}`;
                if (!spendingByCustomer[key]) {
                    spendingByCustomer[key] = { name: t.customerName, phone: t.customerPhone || '', spent: 0 };
                }
                spendingByCustomer[key].spent += t.total;
            }
        });

        const topCustomers = Object.values(spendingByCustomer)
            .sort((a, b) => b.spent - a.spent)
            .slice(0, 5);

        return { topCustomers };
    }, [filteredTransactions]);

    const shopInventory = useMemo(() => inventory, [inventory]);

    const inventoryValuationReport = useMemo(() => {
        const totalDealerValue = shopInventory.reduce((sum, item) => sum + (item.purchasePrice * item.stock), 0);
        const totalMrpValue = shopInventory.reduce((sum, item) => sum + (item.mrp * item.stock), 0);
        return { totalDealerValue, totalMrpValue };
    }, [shopInventory]);

    const firmPurchases = useMemo(() => {
        if (firmFilter === 'all') return purchases;
        return purchases.filter(p => p.firmId === firmFilter);
    }, [purchases, firmFilter]);

    const allFirmTransactions = useMemo(() => {
        if (firmFilter === 'all') return transactions;
        return transactions.filter(t => t.firmId === firmFilter);
    }, [transactions, firmFilter]);

    const currencySymbol = defaultFirm?.financials.currencySymbol || '₹';
    const gstRate = defaultFirm?.financials.gstRate || 18;

    const profitLoss = useMemo(
        () => computeProfitLoss(filteredTransactions, filteredExpenses),
        [filteredTransactions, filteredExpenses]
    );

    const hsnSummary = useMemo(
        () => computeHsnSummary(filteredTransactions, productTypes, gstRate),
        [filteredTransactions, productTypes, gstRate]
    );

    const inventoryTurnover = useMemo(
        () => computeInventoryTurnover(filteredTransactions, shopInventory, productTypes, periodDays),
        [filteredTransactions, shopInventory, productTypes, periodDays]
    );

    const slowMovingStock = useMemo(
        () => computeSlowMovingStock(filteredTransactions, shopInventory, productTypes).slice(0, 10),
        [filteredTransactions, shopInventory, productTypes]
    );

    const salesByCategory = useMemo(
        () => computeSalesByCategory(filteredTransactions),
        [filteredTransactions]
    );

    const monthlySales = useMemo(() => computeMonthlySales(allFirmTransactions), [allFirmTransactions]);
    const seasonalYoY = useMemo(() => computeSeasonalYoY(allFirmTransactions), [allFirmTransactions]);
    const forecast30 = useMemo(() => computeMovingAverageForecast(allFirmTransactions, 30, 30), [allFirmTransactions]);
    const forecast90 = useMemo(() => computeMovingAverageForecast(allFirmTransactions, 30, 90), [allFirmTransactions]);
    const momGrowth = useMemo(() => computeMomGrowth(monthlySales), [monthlySales]);
    const forecast30Total = useMemo(() => forecast30.filter(p => p.isForecast).reduce((s, p) => s + p.predicted, 0), [forecast30]);
    const forecast90Total = useMemo(() => forecast90.filter(p => p.isForecast).reduce((s, p) => s + p.predicted, 0), [forecast90]);

    const receivablesAging = useMemo(
        () => computeReceivablesAging(allFirmTransactions),
        [allFirmTransactions]
    );

    const payablesAging = useMemo(
        () => computePayablesAging(firmPurchases, suppliers),
        [firmPurchases, suppliers]
    );

    const gstr3b = useMemo(
        () => computeGstr3b(filteredTransactions, firmPurchases, productTypes, gstRate),
        [filteredTransactions, firmPurchases, productTypes, gstRate]
    );

    // Receivables Aging Analysis (legacy alias)
    const agingAnalysis = receivablesAging;

    const downloadCSV = (data: any[], filename: string) => {
        if (data.length === 0) {
            addToast('No data to export for the selected period.', 'warning');
            return;
        }
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

        const csvContent = [header, ...csvRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExport = () => {
        const flattenedData = filteredTransactions.flatMap(t =>
            t.items.map(item => ({
                transaction_id: t.invoiceNumber || t.id,
                date: new Date(t.date).toLocaleDateString('en-IN'),
                customer_name: t.customerName,
                sale_category: t.saleCategory || '',
                vehicle_number: t.vehicleNumber || '',
                vehicle_model: t.vehicleModel || '',
                item_name: item.name,
                quantity: item.quantity,
                sale_price_per_unit: item.price,
                purchase_price_per_unit: item.purchasePrice === undefined ? 'N/A' : item.purchasePrice,
                item_revenue: item.price * item.quantity,
                item_cogs: item.purchasePrice === undefined ? 'N/A' : item.purchasePrice * item.quantity,
                item_profit: item.purchasePrice === undefined ? 'N/A' : (item.price - (item.purchasePrice || 0)) * item.quantity,
                is_buyback: item.isBuyback ? 'Yes' : 'No',
                transaction_total: t.total,
            }))
        );
        downloadCSV(flattenedData, `sales-report-${filter}-${new Date().toISOString().split('T')[0]}.csv`);
    };

    const handleExportCategoryReport = () => {
        const data = salesByCategory.map(row => ({
            category: row.category,
            transactions: row.count,
            revenue: row.revenue.toFixed(2),
            avg_ticket: row.avgTicket.toFixed(2),
        }));
        downloadCSV(data, `sales-by-category-${filter}-${new Date().toISOString().split('T')[0]}.csv`);
    };

    const handleGSTR1Export = () => {
        const salesTransactions = filteredTransactions.filter(t =>
            (t.status === 'Paid' || t.status === 'Due') && t.type !== 'Return'
        );

        if (salesTransactions.length === 0) {
            addToast('No sales transactions to export for GSTR-1.', 'warning');
            return;
        }

        // B2B - Invoices with customer GSTIN
        const b2bData = salesTransactions.filter(t => t.customerGst).map(t => {
            const firm = config.firms.find(f => f.id === t.firmId);
            const sellerStateCode = firm?.shopDetails.gstin?.substring(0, 2) || '';
            const buyerStateCode = t.placeOfSupply || t.customerGst?.substring(0, 2) || sellerStateCode;
            return {
                'GSTIN of Recipient': t.customerGst,
                'Receiver Name': t.customerName,
                'Invoice Number': t.invoiceNumber || t.id,
                'Invoice Date': new Date(t.date).toLocaleDateString('en-GB').replace(/\//g, '-'),
                'Invoice Value': t.total.toFixed(2),
                'Place of Supply': buyerStateCode,
                'Reverse Charge': 'N',
                'Applicable % of Tax Rate': '',
                'Invoice Type': 'Regular',
                'E-Commerce GSTIN': '',
                'Rate': firm?.financials.gstRate || 0,
                'Taxable Value': (t.total - t.taxAmount).toFixed(2),
                'Cess Amount': '0',
            };
        });

        // B2CS - B2C Small (without GSTIN, typically local sales < 2.5L per customer)
        const b2csData = salesTransactions.filter(t => !t.customerGst).map(t => {
            const firm = config.firms.find(f => f.id === t.firmId);
            const sellerStateCode = firm?.shopDetails.gstin?.substring(0, 2) || '';
            const buyerStateCode = t.placeOfSupply || sellerStateCode;
            const isInterstate = sellerStateCode !== buyerStateCode;
            return {
                'Type': isInterstate ? 'OE' : 'INTR', // OE = Other State, INTR = Intrastate
                'Place of Supply': buyerStateCode,
                'Applicable % of Tax Rate': '',
                'Rate': firm?.financials.gstRate || 0,
                'Taxable Value': (t.total - t.taxAmount).toFixed(2),
                'Cess Amount': '0',
                'E-Commerce GSTIN': '',
            };
        });

        // HSN Summary - Group by HSN code
        const hsnSummary: { [hsn: string]: { hsn: string; description: string; qty: number; taxableValue: number; totalValue: number; rate: number } } = {};

        salesTransactions.forEach(t => {
            const firm = config.firms.find(f => f.id === t.firmId);
            t.items.forEach(item => {
                if (item.isBuyback) return;

                // Try to find HSN from item or product type
                const productType = productTypes.find(pt => `${pt.brandName} ${pt.name}` === item.name);
                const hsn = item.hsnCode || productType?.hsnCode || DEFAULT_BATTERY_HSN;

                if (!hsnSummary[hsn]) {
                    hsnSummary[hsn] = {
                        hsn,
                        description: item.name,
                        qty: 0,
                        taxableValue: 0,
                        totalValue: 0,
                        rate: firm?.financials.gstRate || 18
                    };
                }

                const itemGross = item.price * item.quantity;
                const itemDiscount = item.discount ?
                    (item.discount.type === 'percentage' ? itemGross * (item.discount.value / 100) : item.discount.value * item.quantity) : 0;
                const itemNet = itemGross - itemDiscount;

                hsnSummary[hsn].qty += item.quantity;
                hsnSummary[hsn].taxableValue += itemNet;
                hsnSummary[hsn].totalValue += itemNet * (1 + (firm?.financials.gstRate || 18) / 100);
            });
        });

        const hsnData = Object.values(hsnSummary).map(h => ({
            'HSN': h.hsn,
            'Description': h.description,
            'UQC': 'NOS',
            'Total Quantity': h.qty,
            'Total Value': h.totalValue.toFixed(2),
            'Taxable Value': h.taxableValue.toFixed(2),
            'Integrated Tax Amount': '0',
            'Central Tax Amount': (h.taxableValue * (h.rate / 200)).toFixed(2),
            'State/UT Tax Amount': (h.taxableValue * (h.rate / 200)).toFixed(2),
            'Cess Amount': '0',
        }));

        // Download all three as separate files
        if (b2bData.length > 0) {
            downloadCSV(b2bData, `GSTR1_B2B_${filter}_${new Date().toISOString().split('T')[0]}.csv`);
        }
        if (b2csData.length > 0) {
            downloadCSV(b2csData, `GSTR1_B2CS_${filter}_${new Date().toISOString().split('T')[0]}.csv`);
        }
        if (hsnData.length > 0) {
            downloadCSV(hsnData, `GSTR1_HSN_${filter}_${new Date().toISOString().split('T')[0]}.csv`);
        }

        addToast(`GSTR-1 export complete — B2B: ${b2bData.length}, B2CS: ${b2csData.length}, HSN: ${hsnData.length}`, 'success');
    };

    const handleGSTR3BExport = () => {
        exportGstr3bCsv(gstr3b, filter);
    };

    const handlePnLExport = () => {
        exportProfitLossCsv(profitLoss, currencySymbol, filter);
    };

    const handleReceivablesExport = () => {
        exportAgingCsv('Receivables', receivablesAging.aging, filter);
    };

    const handlePayablesExport = () => {
        exportAgingCsv('Payables', payablesAging.aging, filter);
    };

    return (
        <div className="page-shell">
            <PageHeader title="Reports" subtitle="Sales, GST, and financial summaries">
                <div className="page-toolbar-row">
                    <select
                        value={firmFilter}
                        onChange={e => setFirmFilter(e.target.value)}
                        className="form-input w-auto min-w-[12rem] text-sm py-2"
                    >
                        <option value="all">All Firms (Consolidated)</option>
                        {config.firms.map(f => (
                            <option key={f.id} value={f.id}>{f.shopDetails.name}</option>
                        ))}
                    </select>
                    <div className="page-toolbar-actions">
                        <div className="btn-group">
                            <button type="button" onClick={handleGSTR1Export} className="btn-secondary text-sm">
                                <IconDownload className="h-4 w-4" /> GSTR-1
                            </button>
                            <button type="button" onClick={handleGSTR3BExport} className="btn-secondary text-sm">
                                <IconDownload className="h-4 w-4" /> GSTR-3B
                            </button>
                        </div>
                        <button type="button" onClick={handleExport} className="btn-secondary text-sm">
                            <IconDownload className="h-4 w-4" /> Export
                        </button>
                    </div>
                </div>
                <PeriodFilterBar value={filter} onChange={setFilter} fullWidth />
            </PageHeader>

            <DailyCloseSection firmFilter={firmFilter} />

            <WeeklySummarySection
                transactions={transactions}
                expenses={expenses}
                firmFilter={firmFilter}
                filter={filter}
                currencySymbol={currencySymbol}
            />

            <AnnualSummarySection
                transactions={transactions}
                expenses={expenses}
                firmFilter={firmFilter}
                filter={filter}
                currencySymbol={currencySymbol}
            />

            <MonthlyYearlyCloseSection
                transactions={transactions}
                expenses={expenses}
                firmFilter={firmFilter}
                filter={filter}
            />

            {/* Day Book Section */}
            <div className="card-section-padded">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-text-primary flex items-center gap-2"><IconCalendar /> Day Book (Today)</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ReportMetric label="Cash In" value={`${defaultFirm?.financials.currencySymbol || '₹'}${dayBook.cashIn.toLocaleString('en-IN')}`} colorClass="text-green-600" />
                    <ReportMetric label="UPI In" value={`${defaultFirm?.financials.currencySymbol || '₹'}${dayBook.upiIn.toLocaleString('en-IN')}`} colorClass="text-blue-600" />
                    <ReportMetric label="Card In" value={`${defaultFirm?.financials.currencySymbol || '₹'}${dayBook.cardIn.toLocaleString('en-IN')}`} colorClass="text-purple-600" />
                    <ReportMetric label="Expenses (Cash Out)" value={`${defaultFirm?.financials.currencySymbol || '₹'}${dayBook.expenseOut.toLocaleString('en-IN')}`} colorClass="text-red-500" />
                </div>
            </div>

            {/* Sales Report */}
            <div className="card-section-padded">
                <h3 className="text-lg font-bold text-text-primary mb-4">Sales Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ReportMetric label="Total Revenue" value={`${defaultFirm?.financials.currencySymbol || '₹'}${salesReport.totalRevenue.toLocaleString('en-IN')}`} />
                    <ReportMetric label="Transactions" value={salesReport.numTransactions.toString()} />
                    <ReportMetric label="Total Discount" value={`${defaultFirm?.financials.currencySymbol || '₹'}${salesReport.totalDiscount.toLocaleString('en-IN')}`} colorClass="text-yellow-500" />
                    <ReportMetric label="Tax Collected" value={`${defaultFirm?.financials.currencySymbol || '₹'}${salesReport.totalTax.toLocaleString('en-IN')}`} />
                </div>
            </div>

            {/* Profit Report */}
            <div className="card-section-padded">
                <h3 className="text-lg font-bold text-text-primary mb-4">Profit & Loss Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ReportMetric label="Gross Profit" value={`${defaultFirm?.financials.currencySymbol || '₹'}${profitReport.grossProfit.toLocaleString('en-IN')}`} subvalue="(Net Revenue - COGS)" colorClass="text-yellow-500" />
                    <ReportMetric label="Total Expenses" value={`${defaultFirm?.financials.currencySymbol || '₹'}${profitReport.totalExpenses.toLocaleString('en-IN')}`} colorClass="text-red-500" />
                    <ReportMetric label="Net Profit" value={`${defaultFirm?.financials.currencySymbol || '₹'}${profitReport.netProfit.toLocaleString('en-IN')}`} colorClass="text-green-500" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card-section-padded">
                    <h3 className="text-lg font-bold text-text-primary mb-4">Top 5 Profitable Items</h3>
                    {profitReport.topProfitableItems.length > 0 ? (
                        <ul className="space-y-2">
                            {profitReport.topProfitableItems.map(item => (
                                <li key={item.name} className="flex justify-between items-center bg-bg-tertiary p-2 rounded-md text-sm">
                                    <div>
                                        <p className="font-medium text-text-primary">{item.name}</p>
                                        <p className="text-xs text-text-muted">Sold: {item.count}</p>
                                    </div>
                                    <p className="font-semibold text-green-600">Profit: {defaultFirm?.financials.currencySymbol || '₹'}{item.profit.toLocaleString('en-IN')}</p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-center text-text-muted py-4">No profitable sales with cost data in this period.</p>
                    )}
                </div>

                <div className="card-section-padded">
                    <h3 className="text-lg font-bold text-text-primary mb-4">Top 5 Spending Customers</h3>
                    {customerReport.topCustomers.length > 0 ? (
                        <ul className="space-y-2">
                            {customerReport.topCustomers.map(cust => (
                                <li key={cust.name + cust.phone} className="flex justify-between items-center bg-bg-tertiary p-2 rounded-md text-sm">
                                    <div>
                                        <p className="font-medium text-text-primary">{cust.name}</p>
                                        <p className="text-xs text-text-muted">{cust.phone}</p>
                                    </div>
                                    <p className="font-semibold text-green-600">{defaultFirm?.financials.currencySymbol || '₹'}{cust.spent.toLocaleString('en-IN')}</p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-center text-text-muted py-4">No customer spending data in this period.</p>
                    )}
                </div>
            </div>

            <div className="card-section-padded">
                <h3 className="text-lg font-bold text-text-primary mb-1">Current Inventory Valuation</h3>
                <p className="text-sm text-text-muted mb-4">Shop-wide stock — same total regardless of firm filter above.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ReportMetric
                        label="Total Value (Dealer Price)"
                        value={`${defaultFirm?.financials.currencySymbol || '₹'}${inventoryValuationReport.totalDealerValue.toLocaleString('en-IN')}`}
                        subvalue="Based on purchase prices"
                        colorClass="text-yellow-500"
                    />
                    <ReportMetric
                        label="Total Value (MRP)"
                        value={`${defaultFirm?.financials.currencySymbol || '₹'}${inventoryValuationReport.totalMrpValue.toLocaleString('en-IN')}`}
                        subvalue="Potential retail value"
                        colorClass="text-green-500"
                    />
                </div>
            </div>

            {/* Profit & Loss Statement */}
            <div className="card-section-padded">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-text-primary">Profit & Loss Statement</h3>
                    <button onClick={handlePnLExport} className="text-sm text-blue-600 hover:underline font-medium flex items-center gap-1"><IconDownload /> Export CSV</button>
                </div>
                <div className="max-w-lg space-y-2 text-sm">
                    <div className="flex justify-between py-2 border-b border-border-color">
                        <span className="text-text-secondary">Net Sales Revenue</span>
                        <span className="font-semibold text-text-primary">{currencySymbol}{profitLoss.netRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {profitLoss.returns > 0 && (
                        <div className="flex justify-between py-2 border-b border-border-color">
                            <span className="text-text-secondary">Sales Returns</span>
                            <span className="font-semibold text-red-500">-{currencySymbol}{profitLoss.returns.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                    )}
                    <div className="flex justify-between py-2 border-b border-border-color">
                        <span className="text-text-secondary">Cost of Goods Sold</span>
                        <span className="font-semibold text-red-500">-{currencySymbol}{profitLoss.cogs.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border-color font-bold">
                        <span className="text-text-primary">Gross Profit</span>
                        <span className="text-yellow-600">{currencySymbol}{profitLoss.grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {Object.entries(profitLoss.expenseByCategory).map(([cat, amt]) => (
                        <div key={cat} className="flex justify-between py-1 pl-4">
                            <span className="text-text-muted">{cat}</span>
                            <span className="text-red-500">-{currencySymbol}{Number(amt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                    ))}
                    <div className="flex justify-between py-2 border-t-2 border-border-color font-bold text-lg">
                        <span className="text-text-primary">Net Profit</span>
                        <span className={profitLoss.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>{currencySymbol}{profitLoss.netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </div>

            {/* GSTR-3B Summary */}
            <div className="card-section-padded">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-text-primary">GSTR-3B Summary</h3>
                    <button onClick={handleGSTR3BExport} className="text-sm text-indigo-600 hover:underline font-medium">Export CSV →</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <ReportMetric label="Outward Taxable" value={`${currencySymbol}${gstr3b.outwardTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} />
                    <ReportMetric label="Outward Tax" value={`${currencySymbol}${gstr3b.outwardTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} colorClass="text-blue-600" />
                    <ReportMetric label="Input Tax Credit" value={`${currencySymbol}${gstr3b.inputTaxCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} colorClass="text-green-600" />
                    <ReportMetric label="Net Tax Payable" value={`${currencySymbol}${gstr3b.netTaxPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} colorClass="text-red-600" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-text-muted">
                    <span>CGST out: {currencySymbol}{gstr3b.outwardCgst.toFixed(2)}</span>
                    <span>SGST out: {currencySymbol}{gstr3b.outwardSgst.toFixed(2)}</span>
                    <span>IGST out: {currencySymbol}{gstr3b.outwardIgst.toFixed(2)}</span>
                </div>
            </div>

            {/* GSTR-1 HSN Summary (on-screen) */}
            <div className="card-section-padded">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-text-primary">GSTR-1 HSN-wise Summary</h3>
                    <button onClick={handleGSTR1Export} className="text-sm text-blue-600 hover:underline font-medium">Export CSV →</button>
                </div>
                {hsnSummary.length > 0 ? (
                    <div className="table-wrap rounded-lg border border-border-color overflow-hidden">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th scope="col">HSN</th>
                                    <th scope="col">Description</th>
                                    <th scope="col" className="text-right">Qty</th>
                                    <th scope="col" className="text-right">Taxable Value</th>
                                    <th scope="col" className="text-right">CGST</th>
                                    <th scope="col" className="text-right">SGST</th>
                                    <th scope="col" className="text-right">IGST</th>
                                    <th scope="col" className="text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hsnSummary.map(row => (
                                    <tr key={row.hsn}>
                                        <td className="font-mono">{row.hsn}</td>
                                        <td>{row.description}</td>
                                        <td className="text-right">{row.qty}</td>
                                        <td className="text-right">{currencySymbol}{row.taxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td className="text-right">{currencySymbol}{row.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td className="text-right">{currencySymbol}{row.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td className="text-right">{currencySymbol}{row.igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td className="text-right font-semibold">{currencySymbol}{row.totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <EmptyState compact icon={<IconCalendar />} title="No taxable sales" message="No taxable sales in this period." />
                )}
            </div>

            {/* Payables Aging */}
            <div className="card-section-padded">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-text-primary">Payables Aging (Supplier Dues)</h3>
                    <button onClick={handlePayablesExport} className="text-sm text-blue-600 hover:underline font-medium">Export CSV</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <ReportMetric label="0-30 Days" value={`${currencySymbol}${payablesAging.aging.current.amount.toLocaleString('en-IN')}`} subvalue={`${payablesAging.aging.current.count} bills`} colorClass="text-green-500" />
                    <ReportMetric label="31-60 Days" value={`${currencySymbol}${payablesAging.aging.days31_60.amount.toLocaleString('en-IN')}`} subvalue={`${payablesAging.aging.days31_60.count} bills`} colorClass="text-yellow-500" />
                    <ReportMetric label="61-90 Days" value={`${currencySymbol}${payablesAging.aging.days61_90.amount.toLocaleString('en-IN')}`} subvalue={`${payablesAging.aging.days61_90.count} bills`} colorClass="text-orange-500" />
                    <ReportMetric label="90+ Days" value={`${currencySymbol}${payablesAging.aging.over90.amount.toLocaleString('en-IN')}`} subvalue={`${payablesAging.aging.over90.count} bills`} colorClass="text-red-500" />
                    <ReportMetric label="Total Payable" value={`${currencySymbol}${payablesAging.aging.total.amount.toLocaleString('en-IN')}`} subvalue={`${payablesAging.aging.total.count} bills`} />
                </div>
                {payablesAging.topCreditors.length > 0 && (
                    <div className="pt-4 border-t border-border-color">
                        <h4 className="font-bold text-text-primary mb-3">Top Outstanding Suppliers</h4>
                        <ul className="space-y-2">
                            {payablesAging.topCreditors.map(creditor => (
                                <li key={creditor.name} className="flex justify-between items-center bg-bg-tertiary p-2 rounded-md text-sm">
                                    <div>
                                        <p className="font-medium text-text-primary">{creditor.name}</p>
                                        <p className="text-xs text-text-muted">Oldest: {creditor.oldestDays} days</p>
                                    </div>
                                    <p className="font-semibold text-red-500">{currencySymbol}{creditor.amount.toLocaleString('en-IN')}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Sales by Category */}
                <div className="card-section-padded">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-text-primary">Sales by Category</h3>
                        <button onClick={handleExportCategoryReport} className="btn-secondary btn-sm">
                            <IconDownload className="h-4 w-4" /> Export
                        </button>
                    </div>
                    {salesByCategory.length > 0 ? (
                        <div className="table-wrap rounded-lg border border-border-color overflow-hidden">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Category</th>
                                        <th scope="col" className="text-right">Sales</th>
                                        <th scope="col" className="text-right">Revenue</th>
                                        <th scope="col" className="text-right">Avg Ticket</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {salesByCategory.map(row => (
                                        <tr key={row.category}>
                                            <td className="font-medium">{row.category}</td>
                                            <td className="text-right">{row.count}</td>
                                            <td className="text-right">{currencySymbol}{row.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                            <td className="text-right">{currencySymbol}{row.avgTicket.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <EmptyState compact icon={<IconDownload />} title="No categorized sales" message="No categorized sales in this period." />
                    )}
                </div>

                {/* Inventory Turnover */}
                <div className="card-section-padded">
                    <h3 className="text-lg font-bold text-text-primary mb-1">Inventory Turnover</h3>
                    <p className="text-sm text-text-muted mb-4">Based on shop-wide stock; sales filtered by firm above.</p>
                    {inventoryTurnover.length > 0 ? (
                        <div className="table-wrap rounded-lg border border-border-color overflow-hidden max-h-80 overflow-y-auto">
                            <table className="data-table">
                                <thead className="sticky top-0 z-10">
                                    <tr>
                                        <th scope="col">Product</th>
                                        <th scope="col" className="text-right">Sold</th>
                                        <th scope="col" className="text-right">Stock</th>
                                        <th scope="col" className="text-right">Turnover</th>
                                        <th scope="col" className="text-right">Days to Sell</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventoryTurnover.slice(0, 10).map(row => (
                                        <tr key={row.productName}>
                                            <td className="font-medium">{row.productName}</td>
                                            <td className="text-right">{row.unitsSold}</td>
                                            <td className="text-right">{row.avgInventory}</td>
                                            <td className="text-right">{row.turnoverRatio.toFixed(2)}x</td>
                                            <td className="text-right">{row.daysToSell >= 999 ? '—' : row.daysToSell}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <EmptyState compact icon={<IconCalendar />} title="No turnover data" message="No turnover data for this period." />
                    )}
                </div>

                {/* Slow Moving Stock */}
                <div className="card-section-padded">
                    <h3 className="text-lg font-bold text-text-primary mb-4">Slow-Moving Stock Aging</h3>
                    {slowMovingStock.length > 0 ? (
                        <ul className="space-y-2 max-h-80 overflow-y-auto">
                            {slowMovingStock.map(row => (
                                <li key={row.productName} className="flex justify-between items-center bg-bg-tertiary p-2 rounded-md text-sm">
                                    <div>
                                        <p className="font-medium text-text-primary">{row.productName}</p>
                                        <p className="text-xs text-text-muted">
                                            Stock: {row.stock} • Value: {currencySymbol}{row.value.toLocaleString('en-IN')}
                                            {row.lastSaleDate ? ` • Last sale: ${new Date(row.lastSaleDate).toLocaleDateString()}` : ' • Never sold'}
                                        </p>
                                    </div>
                                    <span className={`badge ${row.daysSinceLastSale > 90 ? 'badge-red' : row.daysSinceLastSale > 30 ? 'badge-yellow' : 'badge-green'}`}>
                                        {row.daysSinceLastSale >= 999 ? 'No sales' : `${row.daysSinceLastSale}d`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-center text-text-muted py-4">No stock on hand.</p>
                    )}
                </div>
            </div>

            {/* Sales Forecasting & Seasonal Analytics */}
            <div className="card-section-padded">
                <h3 className="text-lg font-bold text-text-primary mb-4">📈 Sales Forecasting & Seasonal Analytics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <ReportMetric label="30-Day Forecast" value={`${currencySymbol}${forecast30Total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} subvalue="Simple moving avg" colorClass="text-blue-600" />
                    <ReportMetric label="90-Day Forecast" value={`${currencySymbol}${forecast90Total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} subvalue="Simple moving avg" colorClass="text-indigo-600" />
                    <ReportMetric label="Months Tracked" value={String(monthlySales.length)} subvalue="MoM trend available" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                        <h4 className="font-semibold text-text-primary mb-2 text-sm">Monthly Revenue (MoM)</h4>
                        {monthlySales.length > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={monthlySales.slice(-12)}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip formatter={(v: number) => `${currencySymbol}${v.toLocaleString('en-IN')}`} />
                                    <Bar dataKey="revenue" fill="#D32F2F" name="Revenue" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : <p className="text-text-muted text-sm">Not enough sales data.</p>}
                        {momGrowth.filter(m => m.growth !== null).slice(-3).map(m => (
                            <p key={m.month} className="text-xs text-text-muted mt-1">
                                {m.month}: {m.growth! >= 0 ? '+' : ''}{m.growth!.toFixed(1)}% MoM
                            </p>
                        ))}
                    </div>
                    <div>
                        <h4 className="font-semibold text-text-primary mb-2 text-sm">Seasonal YoY Comparison</h4>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={seasonalYoY}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip formatter={(v: number) => `${currencySymbol}${v.toLocaleString('en-IN')}`} />
                                <Legend />
                                <Bar dataKey="currentYear" fill="#3b82f6" name="This Year" />
                                <Bar dataKey="previousYear" fill="#94a3b8" name="Last Year" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="lg:col-span-2">
                        <h4 className="font-semibold text-text-primary mb-2 text-sm">30-Day Revenue Forecast</h4>
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={forecast30}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip formatter={(v: number) => `${currencySymbol}${v.toLocaleString('en-IN')}`} />
                                <Line type="monotone" dataKey="predicted" stroke="#D32F2F" strokeWidth={2} dot={false} name="Revenue" strokeDasharray="4 4" />
                            </LineChart>
                        </ResponsiveContainer>
                        <p className="text-xs text-text-muted mt-1">Dashed line includes forecasted days based on 30-day moving average.</p>
                    </div>
                </div>
            </div>

            {/* Receivables Aging Analysis */}
            <div className="card-section-padded">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-text-primary">📊 Receivables Aging Analysis</h3>
                    <button onClick={handleReceivablesExport} className="text-sm text-blue-600 hover:underline font-medium">Export CSV</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <ReportMetric
                        label="0-30 Days"
                        value={`${defaultFirm?.financials.currencySymbol || '₹'}${agingAnalysis.aging.current.amount.toLocaleString('en-IN')}`}
                        subvalue={`${agingAnalysis.aging.current.count} invoices`}
                        colorClass="text-green-500"
                    />
                    <ReportMetric
                        label="31-60 Days"
                        value={`${defaultFirm?.financials.currencySymbol || '₹'}${agingAnalysis.aging.days31_60.amount.toLocaleString('en-IN')}`}
                        subvalue={`${agingAnalysis.aging.days31_60.count} invoices`}
                        colorClass="text-yellow-500"
                    />
                    <ReportMetric
                        label="61-90 Days"
                        value={`${defaultFirm?.financials.currencySymbol || '₹'}${agingAnalysis.aging.days61_90.amount.toLocaleString('en-IN')}`}
                        subvalue={`${agingAnalysis.aging.days61_90.count} invoices`}
                        colorClass="text-orange-500"
                    />
                    <ReportMetric
                        label="90+ Days"
                        value={`${defaultFirm?.financials.currencySymbol || '₹'}${agingAnalysis.aging.over90.amount.toLocaleString('en-IN')}`}
                        subvalue={`${agingAnalysis.aging.over90.count} invoices`}
                        colorClass="text-red-500"
                    />
                    <ReportMetric
                        label="Total Outstanding"
                        value={`${defaultFirm?.financials.currencySymbol || '₹'}${agingAnalysis.aging.total.amount.toLocaleString('en-IN')}`}
                        subvalue={`${agingAnalysis.aging.total.count} invoices`}
                        colorClass="text-text-primary"
                    />
                </div>

                {agingAnalysis.topDebtors.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border-color">
                        <h4 className="font-bold text-text-primary mb-3">Top Outstanding Customers</h4>
                        <ul className="space-y-2">
                            {agingAnalysis.topDebtors.map(debtor => (
                                <li key={debtor.name + debtor.phone} className="flex justify-between items-center bg-bg-tertiary p-2 rounded-md text-sm">
                                    <div>
                                        <p className="font-medium text-text-primary">{debtor.name}</p>
                                        <p className="text-xs text-text-muted">{debtor.phone} • Oldest: {debtor.oldestDays} days</p>
                                    </div>
                                    <p className="font-semibold text-red-500">{defaultFirm?.financials.currencySymbol || '₹'}{debtor.amount.toLocaleString('en-IN')}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

        </div>
    );
};
