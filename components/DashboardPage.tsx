
import React, { useMemo, useState } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { SalesTrendChart } from './SalesTrendChart.tsx';
import { CategoryPieChart } from './CategoryPieChart.tsx';
import { SaleCategoryPieChart } from './SaleCategoryPieChart.tsx';
import { ActivityFeed } from './ActivityFeed.tsx';
import { AiInsightsWidget } from './AiInsightsWidget.tsx';
import { IconDownload, IconAlertTriangle, IconTrendingUp, IconTrendingDown, IconChevronDown, IconStar, IconClock, IconWallet, IconBuildingBank, IconBox, IconReceipt, IconChevronRight, IconSales, IconScan, IconCharging, IconShieldCheck, IconPrint } from './icons.tsx';
import { requestOpenSale } from '../utils/mobileSaleQueue.ts';
import { requestOpenServiceJob, requestWarrantySearch, requestInventorySearch, requestViewReceipt } from '../utils/pageActions.ts';
import { Transaction, Expense, Purchase, Page } from '../types.ts';
import { useConfig } from '../context/ConfigContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { getUpcomingDues } from '../utils/reports.ts';
import { computeBalances } from '../utils/bankingBalances.ts';
import { PageHeader } from './PageHeader.tsx';
import { filterByDateRange, getPreviousPeriodDateRange, getReportDateRange, type ReportPeriod } from '../utils/reportPeriods.ts';
import { PeriodFilterBar } from './PeriodFilterBar.tsx';
import { WeeklySummarySection, AnnualSummarySection } from './MonthlyYearlyCloseSection.tsx';

type FilterPeriod = ReportPeriod;
type ActiveTab = 'overview' | 'reports';

const ReportMetric: React.FC<{ label: string; value: string; change?: { value: string; isPositive: boolean }; colorClass?: string }> = ({ label, value, change, colorClass = 'text-text-primary' }) => (
    <div className="bg-bg-tertiary p-4 rounded-lg">
        <p className="text-sm text-text-muted">{label}</p>
        <div className="flex items-baseline space-x-2 mt-1">
             <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
             {change && (
                <span className={`flex items-center text-xs font-semibold ${change.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                    {change.isPositive ? <IconTrendingUp className="h-4 w-4" /> : <IconTrendingDown className="h-4 w-4" />}
                    {change.value}
                </span>
             )}
        </div>
    </div>
);

const LiquidityWidget: React.FC = () => {
    const { transactions, expenses, purchases, paymentVouchers } = useAppData();
    const { defaultFirm } = useConfig();

    const { cashInHand, bankBalance } = useMemo(() => {
        const { cashBalance, bankBalance } = computeBalances(transactions, expenses, purchases, paymentVouchers);
        return { cashInHand: cashBalance, bankBalance };
    }, [transactions, expenses, purchases, paymentVouchers]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-gradient-to-r from-green-500/10 to-green-600/10 p-4 rounded-xl border border-green-500/20 flex items-center gap-4">
                <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full text-green-600">
                    <IconWallet className="h-6 w-6" />
                </div>
                <div>
                    <p className="text-sm text-text-muted font-medium">Cash in Hand</p>
                    <p className="text-2xl font-bold text-green-600">{defaultFirm?.financials.currencySymbol || '₹'}{cashInHand.toLocaleString('en-IN')}</p>
                </div>
            </div>
            <div className="bg-gradient-to-r from-blue-500/10 to-blue-600/10 p-4 rounded-xl border border-blue-500/20 flex items-center gap-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600">
                    <IconBuildingBank className="h-6 w-6" />
                </div>
                <div>
                    <p className="text-sm text-text-muted font-medium">Bank Balance</p>
                    <p className="text-2xl font-bold text-blue-600">{defaultFirm?.financials.currencySymbol || '₹'}{bankBalance.toLocaleString('en-IN')}</p>
                </div>
            </div>
        </div>
    );
};

const TopProductsWidget: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => {
    const { defaultFirm } = useConfig();
    
    const topProducts = useMemo(() => {
        const productStats: Record<string, { name: string; qty: number; revenue: number }> = {};
        
        transactions.forEach(t => {
            t.items.forEach(item => {
                if (!item.isBuyback && !item.isCustom) {
                    if (!productStats[item.id]) {
                        productStats[item.id] = { name: item.name, qty: 0, revenue: 0 };
                    }
                    productStats[item.id].qty += item.quantity;
                    productStats[item.id].revenue += item.price * item.quantity;
                }
            });
        });

        return Object.values(productStats)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);
    }, [transactions]);

    return (
        <div className="card-section-padded h-full">
            <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
                <IconStar className="text-yellow-500 h-5 w-5" /> Top Performers
            </h3>
            <div className="space-y-3">
                {topProducts.length > 0 ? topProducts.map((p, i) => (
                    <div key={i} className="flex justify-between items-center p-2 rounded hover:bg-bg-tertiary">
                        <div className="flex items-center gap-3">
                            <span className="font-bold text-text-muted w-4">{i + 1}.</span>
                            <div>
                                <p className="font-medium text-text-primary text-sm">{p.name}</p>
                                <p className="text-xs text-text-muted">{p.qty} units sold</p>
                            </div>
                        </div>
                        <p className="font-semibold text-green-600 text-sm">{defaultFirm?.financials.currencySymbol || '₹'}{p.revenue.toLocaleString('en-IN')}</p>
                    </div>
                )) : <p className="text-text-muted text-center text-sm py-4">No sales data yet.</p>}
            </div>
        </div>
    );
};

const RecentSalesWidget: React.FC<{
    transactions: Transaction[];
    onNavigate?: (page: Page) => void;
}> = ({ transactions, onNavigate }) => {
    const { defaultFirm } = useConfig();

    const recentSales = useMemo(() =>
        transactions
            .filter(t => t.type === 'Sale' && t.status !== 'Quotation')
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5),
        [transactions]
    );

    if (recentSales.length === 0) return null;

    return (
        <div className="card-section-padded h-full">
            <div className="flex items-center justify-between gap-2 mb-4">
                <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                    <IconReceipt className="text-brand-red h-5 w-5" /> Recent Sales
                </h3>
                {onNavigate && (
                    <button
                        type="button"
                        onClick={() => onNavigate('Sales')}
                        className="text-xs font-semibold text-brand-red hover:underline flex items-center gap-0.5"
                    >
                        All sales <IconChevronRight className="h-3 w-3" />
                    </button>
                )}
            </div>
            <div className="space-y-2">
                {recentSales.map(t => (
                    <div key={t.id} className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-bg-tertiary">
                        <div className="min-w-0">
                            <p className="font-medium text-sm text-text-primary truncate">{t.customerName}</p>
                            <p className="text-xs text-text-muted">
                                {t.invoiceNumber || t.id} · {new Date(t.date).toLocaleDateString()}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-sm font-semibold text-text-primary tabular-nums">
                                {defaultFirm?.financials.currencySymbol || '₹'}{t.total.toLocaleString('en-IN')}
                            </span>
                            {onNavigate && (
                                <button
                                    type="button"
                                    onClick={() => { requestViewReceipt(t.id); onNavigate('Sales'); }}
                                    className="btn-icon"
                                    title="Reprint receipt"
                                    aria-label="Reprint receipt"
                                >
                                    <IconPrint className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const WarrantyExpiryWidget: React.FC = () => {
    const { warrantyLogs } = useAppData();
    
    const expiringSoon = useMemo(() => {
        const now = new Date();
        const next30Days = new Date();
        next30Days.setDate(now.getDate() + 30);
        
        return warrantyLogs.filter(log => {
            const endDate = new Date(log.warrantyEndDate);
            return endDate >= now && endDate <= next30Days;
        }).sort((a,b) => new Date(a.warrantyEndDate).getTime() - new Date(b.warrantyEndDate).getTime()).slice(0, 5);
    }, [warrantyLogs]);

    if (expiringSoon.length === 0) return null;

    return (
        <div className="card-section-padded h-full">
            <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
                <IconClock className="text-brand-red h-5 w-5" /> Expiring Soon (30 Days)
            </h3>
            <div className="space-y-3">
                {expiringSoon.map((log, i) => (
                    <div key={i} className="p-2 border-l-2 border-red-400 bg-red-50 dark:bg-red-900/10 rounded-r">
                        <p className="font-medium text-text-primary text-sm">{log.customerName}</p>
                        <p className="text-xs text-text-muted">{log.productName}</p>
                        <div className="flex justify-between items-center mt-1">
                            <span className="text-xs text-red-600 font-bold">Expires: {new Date(log.warrantyEndDate).toLocaleDateString()}</span>
                            <button className="text-[10px] bg-bg-secondary border border-border-color px-2 py-0.5 rounded hover:bg-bg-tertiary">Call</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const OverduePaymentsSection: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => {
    const { config } = useConfig();
    
    const overdueItems = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return transactions
            .filter(t => t.status === 'Due')
            .map(t => {
                const totalPaid = t.payments.reduce((sum, p) => sum + p.amount, 0);
                const dueAmount = t.total - totalPaid;
                const dueDate = new Date(t.paymentDueDate || t.date);
                dueDate.setHours(0, 0, 0, 0);
                const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
                const firm = config.firms.find(f => f.id === t.firmId);
                
                return {
                    ...t,
                    dueAmount,
                    daysOverdue,
                    dueDate,
                    currencySymbol: firm?.financials.currencySymbol || '₹'
                };
            })
            .filter(item => item.dueAmount > 0.01 && item.daysOverdue > 0)
            .sort((a, b) => b.daysOverdue - a.daysOverdue);
    }, [transactions, config.firms]);

    if (overdueItems.length === 0) return null;

    return (
        <div id="overdue-payments-section" className="card-section-padded border-l-4 border-l-status-red-text mb-6">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                    <IconAlertTriangle className="text-status-red-text h-5 w-5" />
                    Overdue Payments
                </h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-text-secondary">
                    <thead className="text-xs text-text-primary uppercase bg-bg-tertiary">
                        <tr>
                            <th className="p-3 rounded-l-lg">Customer</th>
                            <th className="p-3 text-right">Amount Due</th>
                            <th className="p-3 text-center">Days Overdue</th>
                            <th className="p-3 text-right rounded-r-lg">Invoice Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {overdueItems.map(item => (
                            <tr key={item.id} className="border-b border-border-color hover:bg-bg-tertiary transition-colors">
                                <td className="p-3 font-medium text-text-primary">
                                    <div>{item.customerName}</div>
                                    <div className="text-xs text-text-muted">{item.customerPhone}</div>
                                </td>
                                <td className="p-3 text-right font-bold text-status-red-text">
                                    {item.currencySymbol}{item.dueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="p-3 text-center">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.daysOverdue > 30 ? 'bg-status-red-bg text-status-red-text' : 'bg-status-yellow-bg text-status-yellow-text'}`}>
                                        {item.daysOverdue} days
                                    </span>
                                </td>
                                <td className="p-3 text-right text-text-muted">
                                    Due: {item.dueDate.toLocaleDateString()}
                                    <div className="text-xs font-mono opacity-70">{item.invoiceNumber || item.id}</div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


const UpcomingDuesSection: React.FC = () => {
    const { transactions, purchases } = useAppData();
    const { suppliers } = useMasterData();
    const { config } = useConfig();

    const upcomingReceivables = useMemo(() => {
        return getUpcomingDues<Transaction>(
            transactions.filter(t => t.status === 'Due'),
            t => {
                const paid = t.payments.reduce((s, p) => s + p.amount, 0);
                return t.total - paid;
            }
        );
    }, [transactions]);

    const upcomingPayables = useMemo(() => {
        return getUpcomingDues<Purchase>(
            purchases.filter(p => p.paymentStatus === 'Due' || p.paymentStatus === 'Partial'),
            p => p.totalAmount - p.paidAmount
        ).map(p => ({
            ...p,
            supplierName: suppliers.find(s => s.id === p.supplierId)?.name || 'Unknown',
        }));
    }, [purchases, suppliers]);

    if (upcomingReceivables.length === 0 && upcomingPayables.length === 0) return null;

    return (
        <div className="card-section-padded border-l-4 border-l-blue-500 mb-6">
            <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
                <IconClock className="text-blue-500 h-5 w-5" />
                Due Date Reminders (Next 7 Days)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {upcomingReceivables.length > 0 && (
                    <div>
                        <h4 className="font-semibold text-text-primary mb-2 text-sm">Customer Collections</h4>
                        <ul className="space-y-2">
                            {upcomingReceivables.map(item => {
                                const firm = config.firms.find(f => f.id === item.firmId);
                                return (
                                    <li key={item.id} className="flex justify-between items-center bg-bg-tertiary p-2 rounded text-sm">
                                        <div>
                                            <p className="font-medium">{item.customerName}</p>
                                            <p className="text-xs text-text-muted">Due in {item.daysUntilDue} day(s)</p>
                                        </div>
                                        <span className="font-bold text-green-600">
                                            {firm?.financials.currencySymbol || '₹'}{item.dueAmount.toLocaleString('en-IN')}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
                {upcomingPayables.length > 0 && (
                    <div>
                        <h4 className="font-semibold text-text-primary mb-2 text-sm">Supplier Payments</h4>
                        <ul className="space-y-2">
                            {upcomingPayables.map(item => {
                                const firm = config.firms.find(f => f.id === item.firmId);
                                return (
                                    <li key={item.id} className="flex justify-between items-center bg-bg-tertiary p-2 rounded text-sm">
                                        <div>
                                            <p className="font-medium">{item.supplierName}</p>
                                            <p className="text-xs text-text-muted">Due in {item.daysUntilDue} day(s) • {item.supplierInvoiceNumber}</p>
                                        </div>
                                        <span className="font-bold text-red-600">
                                            {firm?.financials.currencySymbol || '₹'}{item.dueAmount.toLocaleString('en-IN')}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};


const ALERT_LIST_PREVIEW = 5;

type LowStockAlertItem = {
    id: string;
    brandName: string;
    name: string;
    totalStock: number;
    lowStockThreshold: number;
};

type OverdueAlertItem = Transaction & {
    dueAmount: number;
    daysOverdue: number;
};

const AlertsWidget: React.FC<{
    lowStockItems: LowStockAlertItem[];
    overdueTransactions: OverdueAlertItem[];
    onNavigate?: (page: Page) => void;
}> = ({ lowStockItems, overdueTransactions, onNavigate }) => {
    const { config } = useConfig();
    const [isOpen, setIsOpen] = useState(true);
    const [showAllLowStock, setShowAllLowStock] = useState(false);
    const [showAllOverdue, setShowAllOverdue] = useState(false);

    const sortedLowStock = useMemo(() => (
        [...lowStockItems].sort((a, b) => {
            if (a.totalStock === 0 && b.totalStock !== 0) return -1;
            if (b.totalStock === 0 && a.totalStock !== 0) return 1;
            const ratioA = a.lowStockThreshold > 0 ? a.totalStock / a.lowStockThreshold : 0;
            const ratioB = b.lowStockThreshold > 0 ? b.totalStock / b.lowStockThreshold : 0;
            return ratioA - ratioB;
        })
    ), [lowStockItems]);

    const totalAlerts = lowStockItems.length + overdueTransactions.length;
    if (totalAlerts === 0) return null;

    const outOfStockCount = lowStockItems.filter(item => item.totalStock === 0).length;
    const hasCritical = outOfStockCount > 0 || overdueTransactions.length > 0;

    const visibleLowStock = showAllLowStock ? sortedLowStock : sortedLowStock.slice(0, ALERT_LIST_PREVIEW);
    const visibleOverdue = showAllOverdue ? overdueTransactions : overdueTransactions.slice(0, ALERT_LIST_PREVIEW);

    const scrollToOverdueDetails = () => {
        document.getElementById('overdue-payments-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className={`card-section-padded border-l-4 mb-6 overflow-hidden ${
            hasCritical
                ? 'border-l-status-red-text bg-gradient-to-r from-status-red-bg/20 to-transparent'
                : 'border-l-status-yellow-text bg-gradient-to-r from-status-yellow-bg/20 to-transparent'
        }`}>
            <button
                type="button"
                className="flex w-full items-center justify-between gap-4 text-left group"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex-shrink-0 p-2.5 rounded-xl ${
                        hasCritical ? 'bg-status-red-bg text-status-red-text' : 'bg-status-yellow-bg text-status-yellow-text'
                    }`}>
                        <IconAlertTriangle className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-text-primary">
                            {totalAlerts} Critical Alert{totalAlerts > 1 ? 's' : ''}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                            {lowStockItems.length > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-status-yellow-bg text-status-yellow-text">
                                    {lowStockItems.length} low stock
                                </span>
                            )}
                            {outOfStockCount > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-status-red-bg text-status-red-text">
                                    {outOfStockCount} out of stock
                                </span>
                            )}
                            {overdueTransactions.length > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-status-red-bg text-status-red-text">
                                    {overdueTransactions.length} overdue
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-text-muted group-hover:text-text-primary transition-colors">
                    {isOpen ? 'Hide' : 'Show'}
                    <IconChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </span>
            </button>

            {isOpen && (
                <div className="mt-5 pt-5 border-t border-border-color">
                    <div className={`grid gap-5 ${lowStockItems.length > 0 && overdueTransactions.length > 0 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
                        {lowStockItems.length > 0 && (
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                                        <IconBox className="h-4 w-4 text-status-yellow-text" />
                                        Low Stock
                                        <span className="text-text-muted font-normal">({lowStockItems.length})</span>
                                    </h4>
                                    {onNavigate && (
                                        <button
                                            type="button"
                                            onClick={() => { requestInventorySearch({ lowStockOnly: true }); onNavigate('Products'); }}
                                            className="text-xs font-semibold text-brand-red hover:underline flex items-center gap-0.5"
                                        >
                                            Inventory <IconChevronRight className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                                <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {visibleLowStock.map(product => {
                                        const isOutOfStock = product.totalStock === 0;
                                        const stockRatio = product.lowStockThreshold > 0
                                            ? Math.min(100, (product.totalStock / product.lowStockThreshold) * 100)
                                            : 0;
                                        const shortfall = Math.max(0, product.lowStockThreshold - product.totalStock);

                                        return (
                                            <li
                                                key={product.id}
                                                role={onNavigate ? 'button' : undefined}
                                                tabIndex={onNavigate ? 0 : undefined}
                                                onClick={onNavigate ? () => {
                                                    requestInventorySearch({ query: `${product.brandName} ${product.name}`.trim() });
                                                    onNavigate('Products');
                                                } : undefined}
                                                onKeyDown={onNavigate ? (e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        requestInventorySearch({ query: `${product.brandName} ${product.name}`.trim() });
                                                        onNavigate('Products');
                                                    }
                                                } : undefined}
                                                className={`p-3 rounded-lg border transition-colors ${
                                                    onNavigate ? 'cursor-pointer' : ''
                                                } ${
                                                    isOutOfStock
                                                        ? 'bg-status-red-bg/40 border-status-red-text/20 hover:border-status-red-text/40'
                                                        : 'bg-status-yellow-bg/30 border-status-yellow-text/20 hover:border-status-yellow-text/40'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="font-medium text-sm text-text-primary leading-snug">
                                                        {product.brandName} {product.name}
                                                    </p>
                                                    <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                                        isOutOfStock
                                                            ? 'bg-status-red-bg text-status-red-text'
                                                            : 'bg-status-yellow-bg text-status-yellow-text'
                                                    }`}>
                                                        {isOutOfStock ? 'Out' : 'Low'}
                                                    </span>
                                                </div>
                                                <div className="mt-2 flex items-center gap-3">
                                                    <div className="flex-1 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${isOutOfStock ? 'bg-status-red-text' : 'bg-status-yellow-text'}`}
                                                            style={{ width: `${stockRatio}%` }}
                                                        />
                                                    </div>
                                                    <span className={`text-xs font-bold tabular-nums whitespace-nowrap ${
                                                        isOutOfStock ? 'text-status-red-text' : 'text-status-yellow-text'
                                                    }`}>
                                                        {product.totalStock} / {product.lowStockThreshold}
                                                    </span>
                                                </div>
                                                {shortfall > 0 && (
                                                    <p className="text-[11px] text-text-muted mt-1.5">
                                                        {isOutOfStock ? 'Restock needed' : `${shortfall} below limit`}
                                                    </p>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                                {sortedLowStock.length > ALERT_LIST_PREVIEW && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAllLowStock(v => !v)}
                                        className="mt-2 text-xs font-semibold text-text-muted hover:text-text-primary transition-colors"
                                    >
                                        {showAllLowStock ? 'Show fewer items' : `Show all ${sortedLowStock.length} items`}
                                    </button>
                                )}
                            </div>
                        )}

                        {overdueTransactions.length > 0 && (
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                                        <IconReceipt className="h-4 w-4 text-status-red-text" />
                                        Overdue Payments
                                        <span className="text-text-muted font-normal">({overdueTransactions.length})</span>
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={scrollToOverdueDetails}
                                        className="text-xs font-semibold text-brand-red hover:underline flex items-center gap-0.5"
                                    >
                                        Details <IconChevronRight className="h-3 w-3" />
                                    </button>
                                </div>
                                <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {visibleOverdue.map(t => {
                                        const firm = config.firms.find(f => f.id === t.firmId);

                                        return (
                                            <li
                                                key={t.id}
                                                className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-status-red-bg/30 border-status-red-text/20 hover:border-status-red-text/40 transition-colors"
                                            >
                                                <div className="min-w-0">
                                                    <p className="font-medium text-sm text-text-primary truncate">{t.customerName}</p>
                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                                        {t.customerPhone && (
                                                            <span className="text-xs text-text-muted">{t.customerPhone}</span>
                                                        )}
                                                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-status-red-bg text-status-red-text">
                                                            {t.daysOverdue}d overdue
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className="flex-shrink-0 text-sm font-bold text-status-red-text tabular-nums">
                                                    {firm?.financials.currencySymbol || '₹'}{t.dueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                                {overdueTransactions.length > ALERT_LIST_PREVIEW && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAllOverdue(v => !v)}
                                        className="mt-2 text-xs font-semibold text-text-muted hover:text-text-primary transition-colors"
                                    >
                                        {showAllOverdue ? 'Show fewer items' : `Show all ${overdueTransactions.length} items`}
                                    </button>
                                )}
                                {onNavigate && (
                                    <button
                                        type="button"
                                        onClick={() => onNavigate('Sales')}
                                        className="mt-3 w-full btn-secondary text-sm py-2"
                                    >
                                        Open Sales & Billing
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


export const DashboardPage: React.FC<{ onNavigate?: (page: Page) => void }> = ({ onNavigate }) => {
    const { transactions, serviceJobs, inventory, expenses, purchases } = useAppData();
    const { productTypes } = useMasterData();
    const { config, defaultFirm } = useConfig();
    const { userRole } = useAuth();
    const isAdmin = userRole === 'admin';
    const [filter, setFilter] = useState<FilterPeriod>(config.preferences.defaultDashboardView);
    const [activeTab, setActiveTab] = useState<ActiveTab>('overview');


    const { filteredTransactions, previousPeriodTransactions, filteredExpenses, previousPeriodExpenses } = useMemo(() => {
        const currentRange = getReportDateRange(filter);
        const previousRange = getPreviousPeriodDateRange(filter);

        return {
            filteredTransactions: filterByDateRange(transactions, currentRange),
            previousPeriodTransactions: filterByDateRange(transactions, previousRange),
            filteredExpenses: filterByDateRange(expenses, currentRange),
            previousPeriodExpenses: filterByDateRange(expenses, previousRange),
        };
    }, [transactions, expenses, filter]);

    // --- Overview Tab Calculations ---
    const calculateStats = (txns: Transaction[]) => {
        let totalRevenue = 0;
        let numTransactions = 0;
        let totalCOGS = 0;
        let netRevenue = 0;

        txns.forEach(t => {
            totalRevenue += t.total;
            numTransactions++;
            t.items.forEach(item => {
                if (!item.isBuyback) {
                    const itemRevenue = item.price * item.quantity;
                    netRevenue += itemRevenue;
                     if (item.purchasePrice) {
                        totalCOGS += item.purchasePrice * item.quantity;
                    }
                }
            });
        });
        
        const grossProfit = netRevenue - totalCOGS;
        return { totalRevenue, numTransactions, grossProfit };
    };
    
    const salesReport = useMemo(() => calculateStats(filteredTransactions), [filteredTransactions]);
    const previousSalesReport = useMemo(() => calculateStats(previousPeriodTransactions), [previousPeriodTransactions]);

    const totalExpenses = useMemo(() => filteredExpenses.reduce((sum, e) => sum + e.amount, 0), [filteredExpenses]);
    const previousTotalExpenses = useMemo(() => previousPeriodExpenses.reduce((sum, e) => sum + e.amount, 0), [previousPeriodExpenses]);
    
    const netProfit = salesReport.grossProfit - totalExpenses;
    const previousNetProfit = previousSalesReport.grossProfit - previousTotalExpenses;


    const calculateChange = (current: number, previous: number) => {
        if (previous === 0) {
            return { value: current > 0 ? 'New' : 'N/A', isPositive: current > 0 };
        }
        const change = ((current - previous) / Math.abs(previous)) * 100;
        return { value: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`, isPositive: change >= 0 };
    };

    const revenueChange = calculateChange(salesReport.totalRevenue, previousSalesReport.totalRevenue);
    const profitChange = calculateChange(salesReport.grossProfit, previousSalesReport.grossProfit);
    const expensesChange = calculateChange(totalExpenses, previousTotalExpenses);
    const netProfitChange = calculateChange(netProfit, previousNetProfit);


    const chartData = useMemo(() => {
        const dataByDay: { [key: string]: { sales: number, expenses: number } } = {};
        
        filteredTransactions.forEach(t => {
            const key = new Date(t.date).toISOString().split('T')[0];
            if (!dataByDay[key]) dataByDay[key] = { sales: 0, expenses: 0 };
            dataByDay[key].sales += t.total;
        });

        filteredExpenses.forEach(e => {
            const key = new Date(e.date).toISOString().split('T')[0];
             if (!dataByDay[key]) dataByDay[key] = { sales: 0, expenses: 0 };
            dataByDay[key].expenses += e.amount;
        });

        return Object.keys(dataByDay)
            .map(key => ({
                date: new Date(key).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
                sales: dataByDay[key].sales,
                expenses: dataByDay[key].expenses,
                fullDate: key,
            }))
            .sort((a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime());
    }, [filteredTransactions, filteredExpenses]);
    
    const lowStockItems = useMemo(() => {
        const stockPerProduct = inventory.reduce((acc, item) => {
            acc[item.productTypeId] = (acc[item.productTypeId] || 0) + item.stock;
            return acc;
        }, {} as Record<string, number>);

        return productTypes
            .filter(pt => {
                if (!pt.lowStockThreshold || pt.lowStockThreshold <= 0) return false;
                const totalStock = stockPerProduct[pt.id] || 0;
                return totalStock <= pt.lowStockThreshold;
            })
            .map(pt => ({
                id: pt.id,
                brandName: pt.brandName,
                name: pt.name,
                totalStock: stockPerProduct[pt.id] || 0,
                lowStockThreshold: pt.lowStockThreshold!,
            }));
    }, [inventory, productTypes]);
    
    const overdueTransactions = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        return transactions
            .filter(t => t.status === 'Due')
            .map(t => {
                const paid = t.payments.reduce((sum, p) => sum + p.amount, 0);
                const dueAmount = t.total - paid;
                const dueDate = new Date(t.paymentDueDate || t.date);
                dueDate.setHours(0, 0, 0, 0);
                const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
                return { ...t, dueAmount, daysOverdue };
            })
            .filter(item => item.dueAmount > 0.01 && item.daysOverdue > 0)
            .sort((a, b) => b.daysOverdue - a.daysOverdue);
    }, [transactions]);

    const handleExport = () => {
        // ... (existing export logic)
    };

    const TabButton: React.FC<{tab: ActiveTab, label: string}> = ({ tab, label }) => {
        const isActive = activeTab === tab;
        return (
            <button 
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 font-semibold text-sm rounded-t-lg border-b-2 ${isActive ? 'border-brand-red text-brand-red' : 'border-transparent text-text-muted hover:text-text-primary'}`}
            >
                {label}
            </button>
        )
    };

    return (
        <div className="page-shell">
            <PageHeader title="Dashboard" subtitle="Overview of sales, stock, and alerts">
                <PeriodFilterBar value={filter} onChange={setFilter} />
            </PageHeader>

            {!isAdmin && onNavigate && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <button
                        type="button"
                        onClick={() => { requestOpenSale(); onNavigate('Sales'); }}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl bg-brand-red/10 border border-brand-red/20 hover:bg-brand-red/15 transition-colors min-h-[88px]"
                    >
                        <IconSales className="h-7 w-7 text-brand-red" />
                        <span className="text-sm font-bold text-text-primary">New Sale</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onNavigate('Mobile')}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/15 transition-colors min-h-[88px]"
                    >
                        <IconScan className="h-7 w-7 text-blue-600" />
                        <span className="text-sm font-bold text-text-primary">Open Scanner</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => { requestOpenServiceJob(); onNavigate('Charging Services'); }}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/15 transition-colors min-h-[88px]"
                    >
                        <IconCharging className="h-7 w-7 text-purple-600" />
                        <span className="text-sm font-bold text-text-primary">New Service Job</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => { requestWarrantySearch(''); onNavigate('Warranty'); }}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/15 transition-colors min-h-[88px]"
                    >
                        <IconShieldCheck className="h-7 w-7 text-green-600" />
                        <span className="text-sm font-bold text-text-primary">Warranty Check</span>
                    </button>
                </div>
            )}

            {!isAdmin && onNavigate && (
                <div className="mb-6">
                    <RecentSalesWidget transactions={transactions} onNavigate={onNavigate} />
                </div>
            )}

            {/* <div className="border-b border-border-color">
                <TabButton tab="overview" label="Overview" />
                {true && <TabButton tab="reports" label="Detailed Reports" />}
            </div> */}

            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {isAdmin && <LiquidityWidget />}
                    
                    <AlertsWidget lowStockItems={lowStockItems} overdueTransactions={overdueTransactions} onNavigate={onNavigate} />
                    <UpcomingDuesSection />
                    <OverduePaymentsSection transactions={transactions} />
                    
                    <div className="card-section-padded">
                         <h3 className="text-lg font-bold text-text-primary mb-4">{isAdmin ? 'Financial Summary' : 'Sales Summary'}</h3>
                         <div className={`grid gap-4 ${isAdmin ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'}`}>
                            <ReportMetric label="Total Revenue" value={`${defaultFirm?.financials.currencySymbol || '₹'}${salesReport.totalRevenue.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} change={revenueChange} />
                            <ReportMetric label="Transactions" value={salesReport.numTransactions.toLocaleString('en-IN')} />
                            
                            {isAdmin && (
                                <>
                                    <ReportMetric label="Gross Profit" value={`${defaultFirm?.financials.currencySymbol || '₹'}${salesReport.grossProfit.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} change={profitChange} colorClass="text-yellow-500" />
                                    <ReportMetric label="Expenses" value={`${defaultFirm?.financials.currencySymbol || '₹'}${totalExpenses.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} change={{...expensesChange, isPositive: !expensesChange.isPositive}} colorClass="text-red-500" />
                                    <ReportMetric label="Net Profit" value={`${defaultFirm?.financials.currencySymbol || '₹'}${netProfit.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`} change={netProfitChange} colorClass="text-green-500"/>
                                </>
                            )}
                         </div>
                    </div>

                    {isAdmin && <AiInsightsWidget period={filter} />}

                    <WeeklySummarySection
                        transactions={transactions}
                        expenses={expenses}
                        firmFilter="all"
                        filter={filter}
                        currencySymbol={defaultFirm?.financials.currencySymbol || '₹'}
                    />

                    <AnnualSummarySection
                        transactions={transactions}
                        expenses={expenses}
                        firmFilter="all"
                        filter={filter}
                        currencySymbol={defaultFirm?.financials.currencySymbol || '₹'}
                    />

                    <div className={`grid grid-cols-1 gap-4 md:gap-6 ${isAdmin ? 'lg:grid-cols-3' : ''}`}>
                        {isAdmin && (
                            <div className="lg:col-span-2">
                                <SalesTrendChart data={chartData} />
                            </div>
                        )}
                        <div className={isAdmin ? "lg:col-span-1" : ""}>
                            <CategoryPieChart transactions={filteredTransactions} />
                        </div>
                    </div>

                    {isAdmin && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                            <SaleCategoryPieChart transactions={filteredTransactions} />
                        </div>
                    )}
                    
                    {/* New Widgets Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="md:col-span-1 lg:col-span-1">
                            <TopProductsWidget transactions={filteredTransactions} />
                        </div>
                        <div className="md:col-span-1 lg:col-span-1">
                            <WarrantyExpiryWidget />
                        </div>
                        <div className="md:col-span-2 lg:col-span-1">
                            <ActivityFeed transactions={transactions} serviceJobs={serviceJobs} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
