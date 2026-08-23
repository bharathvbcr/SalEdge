import React, { useState, useMemo, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { Customer } from '../types.ts';
import { CustomerDetailModal } from './CustomerDetailModal.tsx';
import { PageHeader } from './PageHeader.tsx';
import { SearchInput } from './SearchInput.tsx';
import { PaginationBar } from './PaginationBar.tsx';
import { EmptyState } from './EmptyState.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { IconCustomers } from './icons.tsx';

// A simple card for displaying customer info
const CustomerCard: React.FC<{ customer: Customer; onClick: () => void }> = ({ customer, onClick }) => {
    const { defaultFirm, config } = useConfig();
    const tiers = config.preferences.loyaltyProgram.tiers;
    
    let badge = null;
    if (customer.totalSpent >= tiers.platinum) {
        badge = <span className="badge badge-purple">Platinum</span>;
    } else if (customer.totalSpent >= tiers.gold) {
        badge = <span className="badge badge-yellow">Gold</span>;
    } else {
        badge = <span className="badge bg-bg-tertiary text-text-muted border border-border-color">Silver</span>;
    }

    return (
        <div onClick={onClick} className="card card-interactive p-4 cursor-pointer transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 flex items-center gap-1">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-status-blue-bg text-status-blue-text border border-status-blue-text/20">
                     {customer.loyaltyPoints} Pts
                </span>
                {badge}
            </div>
            <div className="flex justify-between items-start mt-4">
                <div>
                    <h3 className="font-bold text-text-primary group-hover:text-brand-red transition-colors">{customer.name}</h3>
                    <p className="text-xs text-text-muted mt-0.5">Last seen: {new Date(customer.lastSeen).toLocaleDateString()}</p>
                </div>
            </div>
            <p className="text-sm text-text-secondary mt-2 font-mono">
                {customer.phone ? (
                    <a href={`tel:${customer.phone}`} onClick={e => e.stopPropagation()} className="hover:text-brand-red">{customer.phone}</a>
                ) : '—'}
            </p>
            <div className="flex justify-between items-end mt-4 pt-3 border-t border-border-color/50">
                <div>
                    <p className="text-xs text-text-muted">Total Spent</p>
                    <p className="font-semibold text-positive">{defaultFirm?.financials.currencySymbol || '₹'}{customer.totalSpent.toLocaleString('en-IN')}</p>
                </div>
                {customer.totalDue > 0 ? (
                    <div>
                        <p className="text-xs text-text-muted text-right">Total Due</p>
                        <p className="font-semibold text-negative">{defaultFirm?.financials.currencySymbol || '₹'}{customer.totalDue.toLocaleString('en-IN')}</p>
                    </div>
                ) : customer.totalDue < 0 && (
                     <div>
                        <p className="text-xs text-text-muted text-right">Advance/Credit</p>
                        <p className="font-semibold text-positive">{defaultFirm?.financials.currencySymbol || '₹'}{Math.abs(customer.totalDue).toLocaleString('en-IN')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

import { Page } from '../types.ts';
import { requestOpenSale } from '../utils/mobileSaleQueue.ts';
import { requestSaleCustomerPrefill } from '../utils/pageActions.ts';
import { computeCustomerFinancials } from '../utils/customerStats.ts';

export const CustomersPage: React.FC<{ onNavigate?: (page: Page) => void }> = ({ onNavigate }) => {
    const { transactions, serviceJobs, warrantyLogs, paymentVouchers } = useAppData();
    const { config } = useConfig();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    const customers = useMemo<Customer[]>(() => {
        const customerMap = new Map<string, Customer>();
        const loyaltySettings = config.preferences.loyaltyProgram;

        // Group transactions per customer, then derive ALL financials through
        // the shared helper so this page and the sales form can never
        // disagree (returns reverse spend/due/points; quotations are skipped;
        // voucher receipts settle dues).
        const txnsByCustomer = new Map<string, { name: string; phone: string; txns: typeof transactions }>();
        transactions.forEach(t => {
            const name = t.customerName;
            const phone = t.customerPhone;
            if (!name || name === 'Walk-in' || !phone) return;
            const id = `${name.toLowerCase().trim()}|${phone.trim()}`;
            const entry = txnsByCustomer.get(id) || { name, phone: phone.trim(), txns: [] };
            entry.txns.push(t);
            txnsByCustomer.set(id, entry);
        });

        txnsByCustomer.forEach((entry, id) => {
            const financials = computeCustomerFinancials(entry.txns, [], loyaltySettings);

            const existing = customerMap.get(id) || {
                id, name: entry.name, phone: entry.phone,
                totalSpent: 0, totalDue: 0, loyaltyPoints: 0,
                firstSeen: entry.txns[0].date, lastSeen: entry.txns[0].date,
                transactionIds: [], serviceJobIds: []
            };

            existing.totalSpent += financials.totalSpent;
            existing.totalDue += financials.totalDue;
            existing.loyaltyPoints += financials.loyaltyPoints;

            entry.txns.forEach(t => {
                if (new Date(t.date) < new Date(existing.firstSeen)) existing.firstSeen = t.date;
                if (new Date(t.date) > new Date(existing.lastSeen)) existing.lastSeen = t.date;
                if (!existing.transactionIds.includes(t.id)) existing.transactionIds.push(t.id);
            });

            customerMap.set(id, existing);
        });

        const processService = (j: any) => {
             const name = j.customerName;
             const phone = j.customerPhone;
             if (!name || !phone) return;
             const id = `${name.toLowerCase().trim()}|${phone.trim()}`;
             
             const existing = customerMap.get(id) || {
                 id, name, phone, 
                 totalSpent: 0, totalDue: 0, loyaltyPoints: 0,
                 firstSeen: j.receivedDate, lastSeen: j.receivedDate,
                 transactionIds: [], serviceJobIds: []
             };

             const jobSpent = j.chargeAmount || 0;
             existing.totalSpent += jobSpent;
             
             // Optional: Earn points on service? Let's say yes for simplicity if program enabled
             if (loyaltySettings.enabled && loyaltySettings.earnRate > 0) {
                 const pointsEarned = Math.floor(jobSpent / loyaltySettings.earnRate);
                 existing.loyaltyPoints += pointsEarned;
             }

             if (new Date(j.receivedDate) < new Date(existing.firstSeen)) existing.firstSeen = j.receivedDate;
             if (new Date(j.receivedDate) > new Date(existing.lastSeen)) existing.lastSeen = j.receivedDate;
             if (!existing.serviceJobIds.includes(j.id)) existing.serviceJobIds.push(j.id);

             customerMap.set(id, existing);
        };

        serviceJobs.forEach(j => processService(j));
        
        // 2. Process Banking Vouchers (Standalone Receipts)
        // These reduce total due (Credit the customer ledger)
        paymentVouchers.forEach(v => {
            if (v.partyType === 'Customer' && v.partyId) {
                // partyId for customers is "Name|Phone"
                const customer = customerMap.get(v.partyId);
                if (customer) {
                    if (v.type === 'Receipt') {
                        customer.totalDue -= v.amount; // Customer paid us, due decreases
                    } else if (v.type === 'Payment') {
                        customer.totalDue += v.amount; // We refunded customer? (Rare but possible)
                    }
                }
            }
        });
        
        // Ensure points don't go below zero (due to data anomalies or deleted transactions)
        for (const customer of customerMap.values()) {
            customer.loyaltyPoints = Math.max(0, customer.loyaltyPoints);
        }

        return Array.from(customerMap.values()).sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

    }, [transactions, serviceJobs, config.preferences.loyaltyProgram, paymentVouchers]);
    
    const filteredCustomers = useMemo(() => {
        if (!searchQuery) return customers;
        const lowerQuery = searchQuery.toLowerCase();
        return customers.filter(c => 
            c.name.toLowerCase().includes(lowerQuery) || 
            c.phone.includes(lowerQuery)
        );
    }, [customers, searchQuery]);

    const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage) || 1;

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, itemsPerPage]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const paginatedCustomers = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredCustomers.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredCustomers, currentPage, itemsPerPage]);

    const handleStartSale = (customer: Customer) => {
        requestSaleCustomerPrefill({ customerName: customer.name, customerPhone: customer.phone });
        requestOpenSale();
        setSelectedCustomer(null);
        onNavigate?.('Sales');
    };

    return (
        <div className="page-shell">
            <PageHeader title="Customers" subtitle="View loyalty status, dues, and contact details">
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search by name or phone..."
                />
            </PageHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {paginatedCustomers.map(customer => (
                    <CustomerCard key={customer.id} customer={customer} onClick={() => setSelectedCustomer(customer)} />
                ))}
                {filteredCustomers.length === 0 && (
                    <div className="col-span-full">
                        <EmptyState
                            icon={<IconCustomers />}
                            title={searchQuery ? 'No Customers Found' : 'No Customers Yet'}
                            message={searchQuery ? 'Try a different name or phone number.' : 'Customers appear here after their first sale or service job.'}
                        />
                    </div>
                )}
            </div>

            <PaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={setItemsPerPage}
            />

            {selectedCustomer && (
                <CustomerDetailModal 
                    customer={selectedCustomer} 
                    transactions={transactions.filter(t => selectedCustomer.transactionIds.includes(t.id))}
                    serviceJobs={serviceJobs.filter(j => selectedCustomer.serviceJobIds.includes(j.id))}
                    warrantyLogs={warrantyLogs.filter(w => w.customerPhone === selectedCustomer.phone && w.customerName === selectedCustomer.name)}
                    paymentVouchers={paymentVouchers.filter(v => v.partyType === 'Customer' && v.partyId === selectedCustomer.id)}
                    onClose={() => setSelectedCustomer(null)}
                    onStartSale={onNavigate ? handleStartSale : undefined}
                />
            )}
        </div>
    );
};