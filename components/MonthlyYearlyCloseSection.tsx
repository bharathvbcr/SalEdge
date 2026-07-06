import React, { useMemo, useState, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { FormField } from './FormField.tsx';
import { Modal } from './Modal.tsx';
import { IconLock } from './icons.tsx';
import { computeMonthlyBreakdownForYear, computePeriodSummary } from '../utils/periodSummary.ts';
import { filterByDateRange, getReportDateRange } from '../utils/reportPeriods.ts';
import type { ReportPeriod } from '../utils/reportPeriods.ts';
import type { Transaction, Expense } from '../types.ts';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ReportMetric: React.FC<{ label: string; value: string; subvalue?: string; colorClass?: string }> = ({
    label,
    value,
    subvalue,
    colorClass = 'text-text-primary',
}) => (
    <div className="bg-bg-tertiary p-4 rounded-lg">
        <p className="text-sm text-text-muted">{label}</p>
        <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
        {subvalue && <p className="text-xs text-text-secondary">{subvalue}</p>}
    </div>
);

type MonthlyYearlyCloseSectionProps = {
    transactions: Transaction[];
    expenses: Expense[];
    firmFilter: string;
    filter: ReportPeriod;
};

export const MonthlyYearlyCloseSection: React.FC<MonthlyYearlyCloseSectionProps> = ({
    transactions,
    expenses,
    firmFilter,
    filter,
}) => {
    const { monthlyCloses, yearlyCloses, saveMonthlyClose, reopenMonthlyClose, saveYearlyClose, reopenYearlyClose } = useAppData();
    const { defaultFirm } = useConfig();
    const currency = defaultFirm?.financials.currencySymbol || '₹';

    const now = new Date();
    const [monthYear, setMonthYear] = useState(now.getFullYear());
    const [monthNum, setMonthNum] = useState(now.getMonth() + 1);
    const [yearNum, setYearNum] = useState(now.getFullYear());
    const [notes, setNotes] = useState('');
    const [showMonthModal, setShowMonthModal] = useState(false);
    const [showYearModal, setShowYearModal] = useState(false);

    const firmTxns = useMemo(
        () => (firmFilter === 'all' ? transactions : transactions.filter(t => t.firmId === firmFilter)),
        [transactions, firmFilter]
    );

    const monthRange = useMemo(() => {
        const start = new Date(monthYear, monthNum - 1, 1);
        const end = new Date(monthYear, monthNum, 0, 23, 59, 59, 999);
        return { startDate: start, endDate: end, periodDays: end.getDate() };
    }, [monthYear, monthNum]);

    const monthSummary = useMemo(() => {
        const txns = filterByDateRange(firmTxns, monthRange);
        const exps = filterByDateRange(expenses, monthRange);
        return computePeriodSummary(txns, exps);
    }, [firmTxns, expenses, monthRange]);

    const yearSummary = useMemo(() => {
        const adjusted = {
            startDate: new Date(yearNum, 0, 1),
            endDate: new Date(yearNum, 11, 31, 23, 59, 59, 999),
            periodDays: 365,
        };
        const txns = filterByDateRange(firmTxns, adjusted);
        const exps = filterByDateRange(expenses, adjusted);
        return computePeriodSummary(txns, exps);
    }, [firmTxns, expenses, yearNum]);

    const yearBreakdown = useMemo(
        () => computeMonthlyBreakdownForYear(firmTxns, expenses, yearNum),
        [firmTxns, expenses, yearNum]
    );

    const existingMonthClose = useMemo(
        () => monthlyCloses.find(c => c.year === monthYear && c.month === monthNum),
        [monthlyCloses, monthYear, monthNum]
    );

    const existingYearClose = useMemo(
        () => yearlyCloses.find(c => c.year === yearNum),
        [yearlyCloses, yearNum]
    );

    const showMonthly = filter === 'month' || filter === 'prev_month';
    const showYearly = filter === 'this_year' || filter === 'prev_year';

    useEffect(() => {
        const now = new Date();
        if (filter === 'month') {
            setMonthYear(now.getFullYear());
            setMonthNum(now.getMonth() + 1);
        } else if (filter === 'prev_month') {
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            setMonthYear(prev.getFullYear());
            setMonthNum(prev.getMonth() + 1);
        } else if (filter === 'this_year') {
            setYearNum(now.getFullYear());
        } else if (filter === 'prev_year') {
            setYearNum(now.getFullYear() - 1);
        }
    }, [filter]);

    const handleMonthClose = () => {
        saveMonthlyClose({
            year: monthYear,
            month: monthNum,
            snapshot: monthSummary,
            notes: notes.trim() || undefined,
        });
        setShowMonthModal(false);
        setNotes('');
    };

    const handleYearClose = () => {
        saveYearlyClose({
            year: yearNum,
            snapshot: yearSummary,
            monthlyBreakdown: yearBreakdown,
            notes: notes.trim() || undefined,
        });
        setShowYearModal(false);
        setNotes('');
    };

    if (!showMonthly && !showYearly) return null;

    return (
        <>
            {showMonthly && (
                <div className="card-section-padded">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                            Month-End Close
                            {existingMonthClose && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                    <IconLock className="h-3 w-3" /> Closed
                                </span>
                            )}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                            <select
                                value={monthNum}
                                onChange={e => setMonthNum(Number(e.target.value))}
                                className="form-input text-sm py-2 w-auto"
                            >
                                {Array.from({ length: 12 }, (_, i) => (
                                    <option key={i + 1} value={i + 1}>
                                        {new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' })}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="number"
                                value={monthYear}
                                onChange={e => setMonthYear(Number(e.target.value))}
                                className="form-input text-sm py-2 w-24"
                                min={2000}
                                max={2100}
                            />
                            {existingMonthClose ? (
                                <>
                                    <button type="button" onClick={() => { setNotes(existingMonthClose.notes || ''); setShowMonthModal(true); }} className="btn-secondary text-sm">
                                        Edit
                                    </button>
                                    <button type="button" onClick={() => reopenMonthlyClose(monthYear, monthNum)} className="btn-secondary text-sm text-amber-600 border-amber-200">
                                        Reopen
                                    </button>
                                </>
                            ) : (
                                <button type="button" onClick={() => { setNotes(''); setShowMonthModal(true); }} className="btn-primary text-sm">
                                    Close Month
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <ReportMetric label="Revenue" value={`${currency}${monthSummary.revenue.toLocaleString('en-IN')}`} />
                        <ReportMetric label="Expenses" value={`${currency}${monthSummary.expenses.toLocaleString('en-IN')}`} colorClass="text-red-500" />
                        <ReportMetric label="Net Profit" value={`${currency}${monthSummary.netProfit.toLocaleString('en-IN')}`} colorClass={monthSummary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'} />
                        <ReportMetric label="Transactions" value={String(monthSummary.transactionCount)} />
                    </div>
                    {existingMonthClose && (
                        <p className="text-xs text-text-muted mt-3">
                            Snapshot saved {new Date(existingMonthClose.closedAt).toLocaleString('en-IN')}
                            {existingMonthClose.notes ? ` • ${existingMonthClose.notes}` : ''}
                        </p>
                    )}
                </div>
            )}

            {showYearly && (
                <div className="card-section-padded">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                            Year-End Close
                            {existingYearClose && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                    <IconLock className="h-3 w-3" /> Closed
                                </span>
                            )}
                        </h3>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={yearNum}
                                onChange={e => setYearNum(Number(e.target.value))}
                                className="form-input text-sm py-2 w-24"
                                min={2000}
                                max={2100}
                            />
                            {existingYearClose ? (
                                <>
                                    <button type="button" onClick={() => { setNotes(existingYearClose.notes || ''); setShowYearModal(true); }} className="btn-secondary text-sm">
                                        Edit
                                    </button>
                                    <button type="button" onClick={() => reopenYearlyClose(yearNum)} className="btn-secondary text-sm text-amber-600 border-amber-200">
                                        Reopen
                                    </button>
                                </>
                            ) : (
                                <button type="button" onClick={() => { setNotes(''); setShowYearModal(true); }} className="btn-primary text-sm">
                                    Close Year
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <ReportMetric label="Annual Revenue" value={`${currency}${yearSummary.revenue.toLocaleString('en-IN')}`} />
                        <ReportMetric label="Annual Expenses" value={`${currency}${yearSummary.expenses.toLocaleString('en-IN')}`} colorClass="text-red-500" />
                        <ReportMetric label="Annual Profit" value={`${currency}${yearSummary.netProfit.toLocaleString('en-IN')}`} colorClass={yearSummary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'} />
                        <ReportMetric label="Transactions" value={String(yearSummary.transactionCount)} />
                    </div>
                    {existingYearClose && (
                        <p className="text-xs text-text-muted mb-4">
                            Snapshot saved {new Date(existingYearClose.closedAt).toLocaleString('en-IN')}
                            {existingYearClose.notes ? ` • ${existingYearClose.notes}` : ''}
                        </p>
                    )}
                </div>
            )}

            {showMonthModal && (
                <Modal onClose={() => setShowMonthModal(false)} ariaLabel="Month-end close" size="md">
                    <div className="p-6">
                        <h3 className="text-lg font-bold text-text-primary mb-1">
                            {existingMonthClose ? 'Update Month Close' : 'Close Month'}
                        </h3>
                        <p className="text-sm text-text-muted mb-4">
                            {new Date(monthYear, monthNum - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
                        </p>
                        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                            <div className="bg-bg-tertiary p-3 rounded-lg">
                                <p className="text-text-muted">Revenue</p>
                                <p className="font-bold">{currency}{monthSummary.revenue.toLocaleString('en-IN')}</p>
                            </div>
                            <div className="bg-bg-tertiary p-3 rounded-lg">
                                <p className="text-text-muted">Net Profit</p>
                                <p className="font-bold">{currency}{monthSummary.netProfit.toLocaleString('en-IN')}</p>
                            </div>
                        </div>
                        <FormField label="Notes (optional)" htmlFor="month-close-notes">
                            <textarea id="month-close-notes" value={notes} onChange={e => setNotes(e.target.value)} className="form-input min-h-[72px]" rows={2} />
                        </FormField>
                        <div className="flex justify-end gap-2 mt-6">
                            <button type="button" onClick={() => setShowMonthModal(false)} className="btn-secondary">Cancel</button>
                            <button type="button" onClick={handleMonthClose} className="btn-primary">
                                {existingMonthClose ? 'Update Close' : 'Confirm Close'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {showYearModal && (
                <Modal onClose={() => setShowYearModal(false)} ariaLabel="Year-end close" size="md">
                    <div className="p-6">
                        <h3 className="text-lg font-bold text-text-primary mb-1">
                            {existingYearClose ? 'Update Year Close' : 'Close Year'}
                        </h3>
                        <p className="text-sm text-text-muted mb-4">Year {yearNum}</p>
                        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                            <div className="bg-bg-tertiary p-3 rounded-lg">
                                <p className="text-text-muted">Revenue</p>
                                <p className="font-bold">{currency}{yearSummary.revenue.toLocaleString('en-IN')}</p>
                            </div>
                            <div className="bg-bg-tertiary p-3 rounded-lg">
                                <p className="text-text-muted">Net Profit</p>
                                <p className="font-bold">{currency}{yearSummary.netProfit.toLocaleString('en-IN')}</p>
                            </div>
                        </div>
                        <FormField label="Notes (optional)" htmlFor="year-close-notes">
                            <textarea id="year-close-notes" value={notes} onChange={e => setNotes(e.target.value)} className="form-input min-h-[72px]" rows={2} />
                        </FormField>
                        <div className="flex justify-end gap-2 mt-6">
                            <button type="button" onClick={() => setShowYearModal(false)} className="btn-secondary">Cancel</button>
                            <button type="button" onClick={handleYearClose} className="btn-primary">
                                {existingYearClose ? 'Update Close' : 'Confirm Close'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
};

export const AnnualSummarySection: React.FC<{
    transactions: Transaction[];
    expenses: Expense[];
    firmFilter: string;
    filter: ReportPeriod;
    currencySymbol: string;
}> = ({ transactions, expenses, firmFilter, filter, currencySymbol }) => {
    const firmTxns = useMemo(
        () => (firmFilter === 'all' ? transactions : transactions.filter(t => t.firmId === firmFilter)),
        [transactions, firmFilter]
    );

    const { currentRange, previousRange, yearForBreakdown } = useMemo(() => {
        if (filter === 'this_year') {
            return {
                currentRange: getReportDateRange('this_year'),
                previousRange: getReportDateRange('prev_year'),
                yearForBreakdown: new Date().getFullYear(),
            };
        }
        const prevYearRange = getReportDateRange('prev_year');
        const priorYearStart = new Date(prevYearRange.startDate.getFullYear() - 1, 0, 1);
        const priorYearEnd = new Date(prevYearRange.startDate.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        return {
            currentRange: prevYearRange,
            previousRange: { startDate: priorYearStart, endDate: priorYearEnd, periodDays: 365 },
            yearForBreakdown: prevYearRange.startDate.getFullYear(),
        };
    }, [filter]);

    const currentSummary = useMemo(() => {
        const txns = filterByDateRange(firmTxns, currentRange);
        const exps = filterByDateRange(expenses, currentRange);
        return computePeriodSummary(txns, exps);
    }, [firmTxns, expenses, currentRange]);

    const previousSummary = useMemo(() => {
        const txns = filterByDateRange(firmTxns, previousRange);
        const exps = filterByDateRange(expenses, previousRange);
        return computePeriodSummary(txns, exps);
    }, [firmTxns, expenses, previousRange]);

    const monthlyBreakdown = useMemo(
        () => computeMonthlyBreakdownForYear(firmTxns, expenses, yearForBreakdown),
        [firmTxns, expenses, yearForBreakdown]
    );

    const pctChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 'New' : 'N/A';
        const change = ((current - previous) / Math.abs(previous)) * 100;
        return `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs prior year`;
    };

    if (filter !== 'this_year' && filter !== 'prev_year') return null;

    return (
        <div className="card-section-padded">
            <h3 className="text-lg font-bold text-text-primary mb-4">Annual Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <ReportMetric
                    label="Total Revenue"
                    value={`${currencySymbol}${currentSummary.revenue.toLocaleString('en-IN')}`}
                    subvalue={pctChange(currentSummary.revenue, previousSummary.revenue)}
                />
                <ReportMetric
                    label="Total Expenses"
                    value={`${currencySymbol}${currentSummary.expenses.toLocaleString('en-IN')}`}
                    subvalue={pctChange(currentSummary.expenses, previousSummary.expenses)}
                    colorClass="text-red-500"
                />
                <ReportMetric
                    label="Net Profit"
                    value={`${currencySymbol}${currentSummary.netProfit.toLocaleString('en-IN')}`}
                    subvalue={pctChange(currentSummary.netProfit, previousSummary.netProfit)}
                    colorClass={currentSummary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}
                />
                <ReportMetric label="Transactions" value={String(currentSummary.transactionCount)} />
            </div>
            <h4 className="font-semibold text-text-primary mb-2 text-sm">Monthly Breakdown ({yearForBreakdown})</h4>
            <div className="mb-6">
                <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={monthlyBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => `${currencySymbol}${v.toLocaleString('en-IN')}`} />
                        <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" />
                        <Bar dataKey="profit" fill="#16a34a" name="Profit" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-bg-tertiary text-text-muted font-semibold">
                        <tr>
                            <th className="p-2">Month</th>
                            <th className="p-2 text-right">Revenue</th>
                            <th className="p-2 text-right">Expenses</th>
                            <th className="p-2 text-right">Profit</th>
                            <th className="p-2 text-right">Txns</th>
                        </tr>
                    </thead>
                    <tbody>
                        {monthlyBreakdown.map(row => (
                            <tr key={row.month} className="border-b border-border-color">
                                <td className="p-2 font-medium">{row.label}</td>
                                <td className="p-2 text-right">{currencySymbol}{row.revenue.toLocaleString('en-IN')}</td>
                                <td className="p-2 text-right text-red-500">{currencySymbol}{row.expenses.toLocaleString('en-IN')}</td>
                                <td className={`p-2 text-right font-medium ${row.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {currencySymbol}{row.profit.toLocaleString('en-IN')}
                                </td>
                                <td className="p-2 text-right">{row.transactionCount}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export const WeeklySummarySection: React.FC<{
    transactions: Transaction[];
    expenses: Expense[];
    firmFilter: string;
    filter: ReportPeriod;
    currencySymbol: string;
}> = ({ transactions, expenses, firmFilter, filter, currencySymbol }) => {
    const firmTxns = useMemo(
        () => (firmFilter === 'all' ? transactions : transactions.filter(t => t.firmId === firmFilter)),
        [transactions, firmFilter]
    );

    const { currentSummary, previousSummary } = useMemo(() => {
        const currentRange = getReportDateRange(filter);
        const actualPrevious = filter === 'this_week'
            ? getReportDateRange('prev_week')
            : (() => {
                const prev = getReportDateRange('prev_week');
                const start = new Date(prev.startDate);
                start.setDate(start.getDate() - 7);
                const end = new Date(prev.endDate);
                end.setDate(end.getDate() - 7);
                end.setHours(23, 59, 59, 999);
                return { startDate: start, endDate: end, periodDays: 7 };
            })();

        const currentTxns = filterByDateRange(firmTxns, currentRange);
        const currentExps = filterByDateRange(expenses, currentRange);
        const prevTxns = filterByDateRange(firmTxns, actualPrevious);
        const prevExps = filterByDateRange(expenses, actualPrevious);

        return {
            currentSummary: computePeriodSummary(currentTxns, currentExps),
            previousSummary: computePeriodSummary(prevTxns, prevExps),
        };
    }, [firmTxns, expenses, filter]);

    const pctChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 'New' : 'N/A';
        const change = ((current - previous) / Math.abs(previous)) * 100;
        return `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs prior week`;
    };

    if (filter !== 'this_week' && filter !== 'prev_week') return null;

    return (
        <div className="card-section-padded">
            <h3 className="text-lg font-bold text-text-primary mb-4">Weekly Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ReportMetric
                    label="Revenue"
                    value={`${currencySymbol}${currentSummary.revenue.toLocaleString('en-IN')}`}
                    subvalue={pctChange(currentSummary.revenue, previousSummary.revenue)}
                />
                <ReportMetric
                    label="Expenses"
                    value={`${currencySymbol}${currentSummary.expenses.toLocaleString('en-IN')}`}
                    subvalue={pctChange(currentSummary.expenses, previousSummary.expenses)}
                    colorClass="text-red-500"
                />
                <ReportMetric
                    label="Net Profit"
                    value={`${currencySymbol}${currentSummary.netProfit.toLocaleString('en-IN')}`}
                    subvalue={pctChange(currentSummary.netProfit, previousSummary.netProfit)}
                    colorClass={currentSummary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}
                />
                <ReportMetric
                    label="Transactions"
                    value={String(currentSummary.transactionCount)}
                    subvalue={pctChange(currentSummary.transactionCount, previousSummary.transactionCount)}
                />
            </div>
        </div>
    );
};
