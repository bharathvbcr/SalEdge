import React, { useState, useMemo } from 'react';
import { Customer, Transaction, ServiceJob, ServiceJobStatus, WarrantyLog, PaymentVoucher, CustomerProfile } from '../types.ts';
import { IconPrint, IconBox, IconTool, IconShieldCheck, IconSales } from './icons.tsx';
import { Modal, ModalFooter, ModalHeader } from './Modal.tsx';
import { EmptyState } from './EmptyState.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { getWarrantyStatus as getWarrantyStatusFull } from '../utils/warrantyLookup.ts';

const StatCard: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = 'text-text-primary' }) => (
    <div className="bg-bg-tertiary p-3 rounded-lg text-center">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
);

// Shared with WarrantyPage so both surfaces can never drift apart.
const getWarrantyStatus = (log: WarrantyLog): { text: string; className: string } => {
    const status = getWarrantyStatusFull(log);
    return { text: status.text, className: status.className };
};


export const CustomerDetailModal: React.FC<{
    customer: Customer;
    transactions: Transaction[];
    serviceJobs: ServiceJob[];
    warrantyLogs: WarrantyLog[];
    paymentVouchers?: PaymentVoucher[];
    onClose: () => void;
    onStartSale?: (customer: Customer) => void;
}> = ({ customer, transactions, serviceJobs, warrantyLogs, paymentVouchers = [], onClose, onStartSale }) => {
    const { config, defaultFirm } = useConfig();
    const { productTypes, getCustomerProfile, upsertCustomerProfile } = useMasterData();
    const [activeTab, setActiveTab] = useState<'transactions' | 'services' | 'warranty' | 'statement' | 'pricing'>('transactions');
    const existingProfile = getCustomerProfile(customer.id);
    const [creditLimit, setCreditLimit] = useState(existingProfile?.creditLimit?.toString() || '');
    const [customPrices, setCustomPrices] = useState<Record<string, string>>(() => {
        const map: Record<string, string> = {};
        existingProfile?.customPrices?.forEach(cp => { map[cp.productTypeId] = String(cp.price); });
        return map;
    });
    
    const TabButton: React.FC<{tab: typeof activeTab, label: string}> = ({ tab, label }) => {
        const isActive = activeTab === tab;
        return (
            <button 
                onClick={() => setActiveTab(tab)}
                className={`tab-btn whitespace-nowrap ${isActive ? 'active' : ''}`}
            >
                {label}
            </button>
        )
    };

    const statementData = useMemo(() => {
        let entries: Array<{ date: string, description: string, debit: number, credit: number, ref?: string }> = [];

        // 1. Transactions (Sales Debits and Return Credits)
        transactions.forEach(t => {
            if (t.type === 'Sale') {
                entries.push({
                    date: t.date,
                    description: `Invoice #${t.invoiceNumber || t.id}`,
                    debit: t.total,
                    credit: 0,
                    ref: t.id
                });
                
                // Add payments made ON this transaction immediately as credits
                // Note: Ideally these should be separate if dates differ, but current model stores them in array without date
                t.payments.forEach(p => {
                    entries.push({
                        date: t.date, // Assuming payment on same day for now
                        description: `Payment (${p.method}) for #${t.invoiceNumber || t.id}`,
                        debit: 0,
                        credit: p.amount,
                        ref: t.id
                    });
                });

            } else if (t.type === 'Return') {
                entries.push({
                    date: t.date,
                    description: `Return/Credit Note #${t.invoiceNumber || t.id}`,
                    debit: 0,
                    credit: t.total, // Return decreases balance
                    ref: t.id
                });
            }
        });

        // 2. Payment Vouchers
        paymentVouchers.forEach(v => {
            if (v.type === 'Receipt') {
                entries.push({
                    date: v.date,
                    description: `Payment Received (${v.method}) - ${v.notes || ''}`,
                    debit: 0,
                    credit: v.amount,
                    ref: v.id
                });
            } else if (v.type === 'Payment') {
                entries.push({
                    date: v.date,
                    description: `Refund Paid (${v.method}) - ${v.notes || ''}`,
                    debit: v.amount,
                    credit: 0,
                    ref: v.id
                });
            }
        });

        // Sort by date
        entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Calculate Running Balance
        let balance = 0;
        const processedEntries = entries.map(entry => {
            balance += (entry.debit - entry.credit);
            return { ...entry, balance };
        });

        return processedEntries;
    }, [transactions, paymentVouchers]);

    const handlePrintStatement = () => {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            const html = `
                <html>
                <head>
                    <title>Statement - ${customer.name}</title>
                    <style>
                        body { font-family: sans-serif; padding: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                        .text-right { text-align: right; }
                        .header { text-align: center; margin-bottom: 30px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2>${defaultFirm?.shopDetails.name}</h2>
                        <p>${defaultFirm?.shopDetails.address}</p>
                        <h3>Statement of Account</h3>
                    </div>
                    <div>
                        <p><strong>Customer:</strong> ${customer.name}</p>
                        <p><strong>Phone:</strong> ${customer.phone}</p>
                        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Description</th>
                                <th class="text-right">Debit</th>
                                <th class="text-right">Credit</th>
                                <th class="text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${statementData.map(row => `
                                <tr>
                                    <td>${new Date(row.date).toLocaleDateString()}</td>
                                    <td>${row.description}</td>
                                    <td class="text-right">${row.debit > 0 ? row.debit.toFixed(2) : '-'}</td>
                                    <td class="text-right">${row.credit > 0 ? row.credit.toFixed(2) : '-'}</td>
                                    <td class="text-right"><strong>${row.balance.toFixed(2)}</strong></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div style="margin-top: 20px; text-align: right;">
                        <p><strong>Closing Balance: ${defaultFirm?.financials.currencySymbol} ${statementData.length > 0 ? statementData[statementData.length - 1].balance.toFixed(2) : '0.00'}</strong></p>
                    </div>
                </body>
                </html>
            `;
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.onload = () => printWindow.print();
        }
    };

    return (
        <Modal onClose={onClose} size="xl" overlayClassName="!z-[110]" ariaLabel={`Customer: ${customer.name}`}>
                <ModalHeader title={customer.name} subtitle={customer.phone} onClose={onClose} />
                
                <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-border-color">
                    <StatCard label="Total Spent" value={`${defaultFirm?.financials.currencySymbol || '₹'}${customer.totalSpent.toLocaleString('en-IN')}`} color="text-green-500" />
                    <StatCard label="Total Due" value={`${defaultFirm?.financials.currencySymbol || '₹'}${customer.totalDue.toLocaleString('en-IN')}`} color={customer.totalDue > 0 ? 'text-red-500' : 'text-text-primary'} />
                    <StatCard label="Transactions" value={customer.transactionIds.length.toString()} />
                    <StatCard label="Service Jobs" value={customer.serviceJobIds.length.toString()} />
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="tab-bar overflow-x-auto">
                         <TabButton tab="transactions" label={`Transactions (${transactions.length})`} />
                         <TabButton tab="statement" label="Statement (Ledger)" />
                         <TabButton tab="services" label={`Service Jobs (${serviceJobs.length})`} />
                         <TabButton tab="warranty" label={`Warranties (${warrantyLogs.length})`} />
                         <TabButton tab="pricing" label="Pricing & Credit" />
                    </div>
                    
                    {activeTab === 'transactions' && (
                        <div className="space-y-2">
                            {transactions.length > 0 ? transactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => {
                                const firm = config.firms.find(f => f.id === t.firmId);
                                return (
                                <div key={t.id} className="p-3 bg-bg-tertiary rounded-lg flex justify-between items-center">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="font-mono text-xs text-text-muted">{t.id}</p>
                                            {t.saleCategory && (
                                                <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-[10px] rounded-full">{t.saleCategory}</span>
                                            )}
                                        </div>
                                        <p className="font-medium text-text-primary line-clamp-1">{t.items.map(i => i.name).join(', ')}</p>
                                        {(t.vehicleNumber || t.vehicleModel) && (
                                            <p className="text-xs text-text-muted mt-0.5">{[t.vehicleModel, t.vehicleNumber].filter(Boolean).join(' · ')}</p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-text-primary">{firm?.financials.currencySymbol || '₹'}{t.total.toLocaleString()}</p>
                                        <p className="text-xs text-text-muted">{new Date(t.date).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                );
                            }) : (
                                <EmptyState icon={<IconBox />} title="No Transactions" message="This customer has no sales or returns on record." />
                            )}
                        </div>
                    )}

                    {activeTab === 'statement' && (
                        <div className="space-y-4">
                            <div className="flex justify-end">
                                <button onClick={handlePrintStatement} className="btn-secondary text-blue-600">
                                    <IconPrint className="h-4 w-4" /> Print Statement
                                </button>
                            </div>
                            <div className="overflow-x-auto border border-border-color rounded-lg">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-bg-tertiary text-text-muted text-xs uppercase font-semibold">
                                        <tr>
                                            <th className="p-3">Date</th>
                                            <th className="p-3">Description</th>
                                            <th className="p-3 text-right">Debit</th>
                                            <th className="p-3 text-right">Credit</th>
                                            <th className="p-3 text-right">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-color">
                                        {statementData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-bg-tertiary/50">
                                                <td className="p-3 whitespace-nowrap">{new Date(row.date).toLocaleDateString()}</td>
                                                <td className="p-3">{row.description}</td>
                                                <td className="p-3 text-right font-mono">{row.debit > 0 ? row.debit.toFixed(2) : '-'}</td>
                                                <td className="p-3 text-right font-mono text-green-600">{row.credit > 0 ? row.credit.toFixed(2) : '-'}</td>
                                                <td className="p-3 text-right font-mono font-bold">{row.balance.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 'services' && (
                        <div className="space-y-2">
                             {serviceJobs.length > 0 ? serviceJobs.sort((a,b) => new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime()).map(j => (
                                <div key={j.id} className="p-3 bg-bg-tertiary rounded-lg flex justify-between items-center">
                                    <div>
                                        <p className="font-mono text-xs text-text-muted">{j.id}</p>
                                        <p className="font-medium text-text-primary line-clamp-1">{j.issueDescription}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-text-primary">{j.chargeAmount ? `${defaultFirm?.financials.currencySymbol || '₹'}${j.chargeAmount.toLocaleString()}`: 'N/A'}</p>
                                        <p className={`px-2 py-0.5 text-xs font-bold rounded-full inline-block mt-1 ${
                                            j.status === ServiceJobStatus.DELIVERED ? 'bg-status-green-bg text-status-green-text' :
                                            j.status === ServiceJobStatus.COMPLETED ? 'bg-status-blue-bg text-status-blue-text' :
                                            'bg-status-yellow-bg text-status-yellow-text'
                                        }`}>{j.status}</p>
                                    </div>
                                </div>
                            )) : (
                                <EmptyState icon={<IconTool />} title="No Service Jobs" message="No repair or service jobs linked to this customer." />
                            )}
                        </div>
                    )}

                    {activeTab === 'warranty' && (
                        <div className="space-y-2">
                             {warrantyLogs.length > 0 ? warrantyLogs.sort((a,b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime()).map(w => {
                                const status = getWarrantyStatus(w);
                                return (
                                <div key={w.id} className="p-3 bg-bg-tertiary rounded-lg">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-medium text-text-primary">{w.productName}</p>
                                            <p className="font-mono text-xs text-text-muted">SN: {w.serialNumber}</p>
                                            {(w.saleCategory || w.vehicleNumber) && (
                                                <p className="text-xs text-text-muted mt-0.5">
                                                    {[w.saleCategory, w.vehicleModel, w.vehicleNumber].filter(Boolean).join(' · ')}
                                                </p>
                                            )}
                                        </div>
                                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${status.className}`}>
                                            {status.text}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-xs mt-2 pt-2 border-t border-border-color/50">
                                       <div><span className="text-text-muted">Sale:</span> {new Date(w.saleDate).toLocaleDateString()}</div>
                                       <div><span className="text-text-muted">Guarantee End:</span> {new Date(w.guaranteeEndDate).toLocaleDateString()}</div>
                                       <div><span className="text-text-muted">Warranty End:</span> {new Date(w.warrantyEndDate).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            )}) : (
                                <EmptyState icon={<IconShieldCheck />} title="No Warranty Records" message="Warranty logs appear when items with serial numbers are sold." />
                            )}
                        </div>
                    )}

                    {activeTab === 'pricing' && (
                        <div className="space-y-4 max-w-lg">
                            <div>
                                <label className="text-sm font-semibold text-text-primary">Credit Limit (₹)</label>
                                <input
                                    type="number"
                                    value={creditLimit}
                                    onChange={e => setCreditLimit(e.target.value)}
                                    className="form-input mt-1"
                                    placeholder="Leave empty for no limit"
                                />
                                <p className="text-xs text-text-muted mt-1">Sales on credit will warn when this limit is exceeded.</p>
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-text-primary mb-2">Custom Product Prices</h4>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {productTypes.map(pt => (
                                        <div key={pt.id} className="flex items-center gap-2">
                                            <span className="text-sm flex-1 truncate">{pt.brandName} {pt.name}</span>
                                            <input
                                                type="number"
                                                value={customPrices[pt.id] || ''}
                                                onChange={e => setCustomPrices(prev => ({ ...prev, [pt.id]: e.target.value }))}
                                                className="form-input w-28 text-right"
                                                placeholder="MRP"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    const profile: CustomerProfile = {
                                        id: customer.id,
                                        name: customer.name,
                                        phone: customer.phone,
                                        creditLimit: creditLimit ? Number(creditLimit) : undefined,
                                        customPrices: Object.entries(customPrices)
                                            .filter(([, v]) => v && Number(v) > 0)
                                            .map(([productTypeId, price]) => ({ productTypeId, price: Number(price) })),
                                    };
                                    upsertCustomerProfile(profile);
                                }}
                                className="btn-primary text-sm"
                            >
                                Save Pricing Profile
                            </button>
                        </div>
                    )}
                </div>
                <ModalFooter>
                    {onStartSale && (
                        <button
                            type="button"
                            onClick={() => onStartSale(customer)}
                            className="btn-primary flex items-center gap-2"
                        >
                            <IconSales className="h-4 w-4" /> Start Sale
                        </button>
                    )}
                    {customer.phone && (
                        <a href={`tel:${customer.phone}`} className="btn-secondary">Call</a>
                    )}
                    <button type="button" onClick={onClose} className="btn-secondary ml-auto">Close</button>
                </ModalFooter>
        </Modal>
    );
};