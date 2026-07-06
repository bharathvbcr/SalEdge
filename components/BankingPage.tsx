import React, { useState, useMemo, useCallback } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { IconBuildingBank, IconWallet, IconPlus, IconTrash } from './icons.tsx';
import { EmptyState } from './EmptyState.tsx';
import { PageHeader } from './PageHeader.tsx';
import { SearchInput } from './SearchInput.tsx';
import { VoucherForm } from './VoucherForm.tsx';
import { computeBalances } from '../utils/bankingBalances.ts';
import { consumeOpenVoucherFormRequest } from '../utils/pageActions.ts';
import { usePageIntent } from '../hooks/usePageIntent.ts';

const StatCard: React.FC<{ label: string; value: string; icon: React.ReactElement; colorClass?: string }> = ({ label, value, icon, colorClass = 'text-text-primary' }) => (
    <div className="bg-bg-secondary p-4 rounded-xl shadow-lg border border-border-color flex items-center gap-4">
        <div className="p-3 bg-bg-tertiary rounded-lg text-brand-red">
            {icon}
        </div>
        <div>
            <p className="text-sm text-text-muted font-medium">{label}</p>
            <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
        </div>
    </div>
);

export const BankingPage: React.FC = () => {
    const { paymentVouchers, deletePaymentVoucher, transactions, expenses, purchases } = useAppData();
    const { defaultFirm } = useConfig();
    const { addPaymentVoucher } = useAppData();
    
    const [voucherType, setVoucherType] = useState<'Receipt' | 'Payment' | null>(null);
    const [voucherPrefill, setVoucherPrefill] = useState<ReturnType<typeof consumeOpenVoucherFormRequest>>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const applyVoucherFormIntent = useCallback(() => {
        const request = consumeOpenVoucherFormRequest();
        if (request) {
            setVoucherType(request.voucherType);
            setVoucherPrefill(request);
        }
    }, []);

    usePageIntent(applyVoucherFormIntent);

    // Calculate Balances
    const balances = useMemo(
        () => computeBalances(transactions, expenses, purchases, paymentVouchers),
        [transactions, expenses, purchases, paymentVouchers]
    );

    const sortedVouchers = useMemo(() => [...paymentVouchers].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [paymentVouchers]);

    const filteredVouchers = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return sortedVouchers;
        return sortedVouchers.filter(v =>
            v.partyName.toLowerCase().includes(q) ||
            v.method.toLowerCase().includes(q) ||
            (v.referenceNumber?.toLowerCase().includes(q) ?? false) ||
            v.type.toLowerCase().includes(q)
        );
    }, [sortedVouchers, searchQuery]);

    return (
        <div className="page-shell">
            <PageHeader title="Banking & Accounting">
                <button onClick={() => { setVoucherPrefill(null); setVoucherType('Receipt'); }} className="btn-success">
                    <IconPlus className="h-4 w-4" /> Receive Money
                </button>
                <button onClick={() => { setVoucherPrefill(null); setVoucherType('Payment'); }} className="btn-danger">
                    <IconPlus className="h-4 w-4" /> Make Payment
                </button>
            </PageHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatCard 
                    label="Cash In Hand" 
                    value={`${defaultFirm?.financials.currencySymbol || '₹'}${balances.cashBalance.toLocaleString('en-IN')}`} 
                    icon={<IconWallet className="h-8 w-8"/>} 
                    colorClass={balances.cashBalance >= 0 ? 'text-positive' : 'text-negative'}
                />
                <StatCard 
                    label="Bank Balance (Total)" 
                    value={`${defaultFirm?.financials.currencySymbol || '₹'}${balances.bankBalance.toLocaleString('en-IN')}`} 
                    icon={<IconBuildingBank className="h-8 w-8"/>} 
                    colorClass={balances.bankBalance >= 0 ? 'text-info' : 'text-negative'}
                />
            </div>

            <div className="card-section">
                <div className="p-4 border-b border-border-color flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 className="font-bold text-text-primary">Voucher Register (Ledger)</h3>
                    <SearchInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search party, method, ref..."
                        className="w-full sm:w-auto sm:min-w-[14rem]"
                    />
                </div>
                <div className="table-wrap">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th scope="col">Date</th>
                                <th scope="col">Type</th>
                                <th scope="col">Party</th>
                                <th scope="col">Method / Ref</th>
                                <th scope="col" className="text-right">Debit (Out)</th>
                                <th scope="col" className="text-right">Credit (In)</th>
                                <th scope="col" className="text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredVouchers.length > 0 ? filteredVouchers.map(v => (
                                <tr key={v.id}>
                                    <td>{new Date(v.date).toLocaleDateString()}</td>
                                    <td>
                                        <span className={`badge ${v.type === 'Receipt' ? 'badge-green' : 'badge-red'}`}>
                                            {v.type}
                                        </span>
                                    </td>
                                    <td className="font-medium text-text-primary">{v.partyName}</td>
                                    <td>
                                        {v.method}
                                        {v.referenceNumber && <div className="text-xs text-text-muted">{v.referenceNumber}</div>}
                                    </td>
                                    <td className="text-right font-mono text-negative">
                                        {v.type === 'Payment' ? v.amount.toFixed(2) : '-'}
                                    </td>
                                    <td className="text-right font-mono text-positive">
                                        {v.type === 'Receipt' ? v.amount.toFixed(2) : '-'}
                                    </td>
                                    <td className="text-center">
                                        <button type="button" onClick={() => deletePaymentVoucher(v.id)} className="btn-icon text-negative hover:opacity-80" aria-label="Delete voucher"><IconTrash/></button>
                                    </td>
                                </tr>
                            )) : sortedVouchers.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-0">
                                        <EmptyState icon={<IconBuildingBank />} title="No Vouchers Recorded" message="Use Receive/Make Payment buttons to record ledger transactions." />
                                    </td>
                                </tr>
                            ) : (
                                <tr>
                                    <td colSpan={7} className="p-0">
                                        <EmptyState compact icon={<IconBuildingBank />} title="No matching vouchers" message="Try a different search term." />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {voucherType && (
                <VoucherForm
                    type={voucherType}
                    initialData={voucherPrefill ?? undefined}
                    onSave={addPaymentVoucher}
                    onClose={() => { setVoucherType(null); setVoucherPrefill(null); }}
                />
            )}
        </div>
    );
};
