import React, { useMemo, useState } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { FormField } from './FormField.tsx';
import { Modal } from './Modal.tsx';
import { IconCalendar, IconLock } from './icons.tsx';
import { computeDayBook, computePeriodSummary } from '../utils/periodSummary.ts';
import { toDateKey } from '../utils/reportPeriods.ts';

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

type DailyCloseSectionProps = {
    firmFilter: string;
};

export const DailyCloseSection: React.FC<DailyCloseSectionProps> = ({ firmFilter }) => {
    const { transactions, expenses, dailyCloses, saveDailyClose, reopenDailyClose } = useAppData();
    const { defaultFirm } = useConfig();
    const currency = defaultFirm?.financials.currencySymbol || '₹';

    const todayKey = toDateKey(new Date());
    const [closeDate, setCloseDate] = useState(todayKey);
    const [countedCash, setCountedCash] = useState('');
    const [countedUpi, setCountedUpi] = useState('');
    const [countedCard, setCountedCard] = useState('');
    const [notes, setNotes] = useState('');
    const [showConfirm, setShowConfirm] = useState(false);

    const dayBook = useMemo(
        () => computeDayBook(transactions, expenses, closeDate, firmFilter),
        [transactions, expenses, closeDate, firmFilter]
    );

    const existingClose = useMemo(
        () => dailyCloses.find(c => c.date === closeDate && (c.firmId || 'all') === (firmFilter === 'all' ? 'all' : firmFilter)),
        [dailyCloses, closeDate, firmFilter]
    );

    const isClosed = Boolean(existingClose);

    const handleSubmitClose = () => {
        const cash = Number(countedCash);
        if (Number.isNaN(cash)) return;

        const dayTxns = transactions.filter(t => {
            const inDay = t.date.startsWith(closeDate);
            const inFirm = firmFilter === 'all' || t.firmId === firmFilter;
            return inDay && inFirm;
        });
        const dayExps = expenses.filter(e => e.date.startsWith(closeDate));
        const snapshot = computePeriodSummary(dayTxns, dayExps);

        saveDailyClose({
            date: closeDate,
            firmId: firmFilter === 'all' ? undefined : firmFilter,
            expectedCash: dayBook.expectedCash,
            countedCash: cash,
            countedUpi: countedUpi ? Number(countedUpi) : undefined,
            countedCard: countedCard ? Number(countedCard) : undefined,
            variance: cash - dayBook.expectedCash,
            notes: notes.trim() || undefined,
            snapshot,
        });

        setShowConfirm(false);
        setNotes('');
    };

    const openCloseForm = () => {
        if (existingClose) {
            setCountedCash(String(existingClose.countedCash));
            setCountedUpi(existingClose.countedUpi != null ? String(existingClose.countedUpi) : '');
            setCountedCard(existingClose.countedCard != null ? String(existingClose.countedCard) : '');
            setNotes(existingClose.notes || '');
        } else {
            setCountedCash(String(Math.max(0, Math.round(dayBook.expectedCash))));
            setCountedUpi(dayBook.upiIn ? String(Math.round(dayBook.upiIn)) : '');
            setCountedCard(dayBook.cardIn ? String(Math.round(dayBook.cardIn)) : '');
            setNotes('');
        }
        setShowConfirm(true);
    };

    const recentCloses = useMemo(
        () => [...dailyCloses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
        [dailyCloses]
    );

    return (
        <div className="card-section-padded">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                    <IconCalendar /> Daily Close
                    {isClosed && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            <IconLock className="h-3 w-3" /> Day Closed
                        </span>
                    )}
                </h3>
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={closeDate}
                        onChange={e => setCloseDate(e.target.value)}
                        className="form-input text-sm py-2 w-auto"
                    />
                    {isClosed ? (
                        <>
                            <button type="button" onClick={openCloseForm} className="btn-secondary text-sm">
                                Edit Close
                            </button>
                            <button
                                type="button"
                                onClick={() => reopenDailyClose(closeDate, firmFilter === 'all' ? undefined : firmFilter)}
                                className="btn-secondary text-sm text-amber-600 border-amber-200"
                            >
                                Reopen Day
                            </button>
                        </>
                    ) : (
                        <button type="button" onClick={openCloseForm} className="btn-primary text-sm">
                            Close Day
                        </button>
                    )}
                </div>
            </div>

            <p className="text-xs text-text-muted mb-4">
                Expected cash = cash received minus cash expenses for the selected day.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <ReportMetric label="Cash In" value={`${currency}${dayBook.cashIn.toLocaleString('en-IN')}`} colorClass="text-green-600" />
                <ReportMetric label="UPI In" value={`${currency}${dayBook.upiIn.toLocaleString('en-IN')}`} colorClass="text-blue-600" />
                <ReportMetric label="Card In" value={`${currency}${dayBook.cardIn.toLocaleString('en-IN')}`} colorClass="text-purple-600" />
                <ReportMetric label="Cash Expenses" value={`${currency}${dayBook.cashExpenses.toLocaleString('en-IN')}`} colorClass="text-red-500" />
                <ReportMetric
                    label="Expected Cash"
                    value={`${currency}${dayBook.expectedCash.toLocaleString('en-IN')}`}
                    subvalue={isClosed ? `Counted: ${currency}${existingClose!.countedCash.toLocaleString('en-IN')}` : undefined}
                    colorClass="text-yellow-600"
                />
            </div>

            {isClosed && existingClose && (
                <div className="mb-6 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 text-sm">
                    <p className="font-semibold text-text-primary">
                        Closed {new Date(existingClose.closedAt).toLocaleString('en-IN')}
                    </p>
                    <p className="text-text-secondary mt-1">
                        Variance:{' '}
                        <span className={existingClose.variance === 0 ? 'text-green-600' : existingClose.variance > 0 ? 'text-blue-600' : 'text-red-600'}>
                            {existingClose.variance >= 0 ? '+' : ''}
                            {currency}{existingClose.variance.toLocaleString('en-IN')}
                        </span>
                        {existingClose.notes ? ` • ${existingClose.notes}` : ''}
                    </p>
                </div>
            )}

            {recentCloses.length > 0 && (
                <div>
                    <h4 className="font-semibold text-text-primary mb-2 text-sm">Recent Daily Closes</h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-bg-tertiary text-text-muted font-semibold">
                                <tr>
                                    <th className="p-2">Date</th>
                                    <th className="p-2 text-right">Expected</th>
                                    <th className="p-2 text-right">Counted</th>
                                    <th className="p-2 text-right">Variance</th>
                                    <th className="p-2">Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentCloses.map(row => (
                                    <tr key={row.id} className="border-b border-border-color">
                                        <td className="p-2">
                                            {new Date(row.date).toLocaleDateString('en-IN')}
                                            <span className="ml-2 text-xs text-green-600">Closed</span>
                                        </td>
                                        <td className="p-2 text-right">{currency}{row.expectedCash.toLocaleString('en-IN')}</td>
                                        <td className="p-2 text-right">{currency}{row.countedCash.toLocaleString('en-IN')}</td>
                                        <td className={`p-2 text-right font-medium ${row.variance === 0 ? 'text-green-600' : row.variance > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                            {row.variance >= 0 ? '+' : ''}{currency}{row.variance.toLocaleString('en-IN')}
                                        </td>
                                        <td className="p-2 text-text-muted truncate max-w-[160px]">{row.notes || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showConfirm && (
                <Modal onClose={() => setShowConfirm(false)} ariaLabel="Daily close" size="md">
                    <div className="p-6">
                        <h3 className="text-lg font-bold text-text-primary mb-1">
                            {isClosed ? 'Update Daily Close' : 'Close Day'}
                        </h3>
                        <p className="text-sm text-text-muted mb-4">
                            {new Date(closeDate).toLocaleDateString('en-IN')} • Expected cash: {currency}{dayBook.expectedCash.toLocaleString('en-IN')}
                        </p>
                        <div className="space-y-3">
                            <FormField label="Counted Cash" required htmlFor="counted-cash">
                                <input
                                    id="counted-cash"
                                    type="number"
                                    value={countedCash}
                                    onChange={e => setCountedCash(e.target.value)}
                                    className="form-input"
                                    min={0}
                                    step="0.01"
                                />
                            </FormField>
                            <FormField label="Counted UPI (optional)" htmlFor="counted-upi">
                                <input
                                    id="counted-upi"
                                    type="number"
                                    value={countedUpi}
                                    onChange={e => setCountedUpi(e.target.value)}
                                    className="form-input"
                                    min={0}
                                    step="0.01"
                                />
                            </FormField>
                            <FormField label="Counted Card (optional)" htmlFor="counted-card">
                                <input
                                    id="counted-card"
                                    type="number"
                                    value={countedCard}
                                    onChange={e => setCountedCard(e.target.value)}
                                    className="form-input"
                                    min={0}
                                    step="0.01"
                                />
                            </FormField>
                            <FormField label="Notes (optional)" htmlFor="close-notes">
                                <textarea
                                    id="close-notes"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    className="form-input min-h-[72px]"
                                    rows={2}
                                />
                            </FormField>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button type="button" onClick={() => setShowConfirm(false)} className="btn-secondary">
                                Cancel
                            </button>
                            <button type="button" onClick={handleSubmitClose} className="btn-primary" disabled={!countedCash}>
                                {isClosed ? 'Update Close' : 'Confirm Close'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};
