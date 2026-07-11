


import React from 'react';
import { Transaction } from '../types.ts';
import { EmptyState } from './EmptyState.tsx';
import { PaginationBar } from './PaginationBar.tsx';
import { SearchInput } from './SearchInput.tsx';
import { IconBox, IconChevronUp, IconChevronDown, IconPrint, IconTrash } from './icons.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';

type SortKey = keyof Transaction;

interface TransactionsLogProps {
    transactions: Transaction[];
    onViewDetails: (transaction: Transaction) => void;
    onViewReceipt: (transaction: Transaction) => void;
    onDelete?: (transaction: Transaction) => void;
    onAddTransaction: () => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    dateRange: { start: string, end: string };
    setDateRange: (range: { start: string, end: string }) => void;
    categoryFilter: string;
    setCategoryFilter: (category: string) => void;
    saleCategories: string[];
    sortConfig: { key: SortKey; direction: 'asc' | 'desc' };
    setSortConfig: (config: { key: SortKey; direction: 'asc' | 'desc' }) => void;
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    itemsPerPage?: number;
    onItemsPerPageChange?: (size: number) => void;
    onTodayFilter?: () => void;
    logMode?: 'sales' | 'quotations' | 'returns';
    onConvertQuotation?: (transaction: Transaction) => void;
}

export const TransactionsLog: React.FC<TransactionsLogProps> = ({
    transactions,
    onViewDetails,
    onViewReceipt,
    onDelete,
    onAddTransaction,
    searchQuery,
    setSearchQuery,
    dateRange,
    setDateRange,
    categoryFilter,
    setCategoryFilter,
    saleCategories,
    sortConfig,
    setSortConfig,
    currentPage,
    totalPages,
    onPageChange,
    itemsPerPage,
    onItemsPerPageChange,
    onTodayFilter,
    logMode = 'sales',
    onConvertQuotation,
}) => {
    const { config } = useConfig();
    const { userRole } = useAuth();
    
    const requestSort = (key: SortKey) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortableHeader: React.FC<{ sortKey: SortKey; children: React.ReactNode; align?: 'left' | 'center' | 'right' }> = ({ sortKey, children, align = 'left' }) => {
        const isSorted = sortConfig.key === sortKey;
        const alignClass = align === 'right' ? 'ml-auto' : align === 'center' ? 'mx-auto' : '';
        return (
            <th scope="col">
                <button type="button" onClick={() => requestSort(sortKey)} className={`sort-header ${alignClass}`}>
                    {children}
                    {isSorted ? (
                        sortConfig.direction === 'asc' ? <IconChevronUp className="h-3.5 w-3.5" /> : <IconChevronDown className="h-3.5 w-3.5" />
                    ) : <span className="w-3.5 h-3.5 inline-block" aria-hidden="true" />}
                </button>
            </th>
        );
    };

    return (
        <div className="card-section p-4 md:p-6 min-w-0 overflow-x-auto">
            <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 mb-4">
                 <div className="toolbar">
                    {onTodayFilter && (
                        <button type="button" onClick={onTodayFilter} className="filter-pill">Today</button>
                    )}
                    <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="form-input w-auto text-sm" aria-label="Start date" />
                    <span className="text-text-muted text-sm">to</span>
                    <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="form-input w-auto text-sm" aria-label="End date" />
                    <select
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value)}
                        className="form-input w-auto text-sm"
                        aria-label="Filter by category"
                    >
                        <option value="">All Categories</option>
                        {saleCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search customer, ID, phone..."
                    className="w-full lg:w-auto lg:min-w-[16rem]"
                />
            </div>
            <div className="table-wrap rounded-lg border border-border-color">
                <table className="data-table">
                    <thead>
                        <tr>
                            <SortableHeader sortKey="id">Invoice No.</SortableHeader>
                            <SortableHeader sortKey="date">Date</SortableHeader>
                            <SortableHeader sortKey="customerName">Customer</SortableHeader>
                            <SortableHeader sortKey="saleCategory">Category</SortableHeader>
                            <SortableHeader sortKey="total" align="right">Amount</SortableHeader>
                            <SortableHeader sortKey="status" align="center">Status</SortableHeader>
                            <th scope="col" className="text-center">Compliance</th>
                            <th scope="col" className="text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.length > 0 ? transactions.map(t => {
                            const firm = config.firms.find(f => f.id === t.firmId);
                            return (
                                <tr key={t.id}>
                                    <td className="font-mono font-medium text-text-primary text-xs">{t.invoiceNumber || t.id}</td>
                                    <td className="whitespace-nowrap">{new Date(t.date).toLocaleDateString()}</td>
                                    <td className="font-medium text-text-primary">{t.customerName}</td>
                                    <td>
                                        {t.saleCategory ? (
                                            <span className="badge badge-blue">{t.saleCategory}</span>
                                        ) : (
                                            <span className="text-text-muted text-xs">—</span>
                                        )}
                                    </td>
                                    <td className="text-right font-semibold text-text-primary whitespace-nowrap">{firm?.financials.currencySymbol || '₹'}{t.total.toFixed(2)}</td>
                                    <td className="text-center">
                                        <span className={`badge ${t.status === 'Paid' ? 'badge-green' : t.status === 'Due' ? 'badge-red' : 'badge-yellow'}`}>
                                            {t.status}
                                        </span>
                                    </td>
                                    <td className="text-center text-xs">
                                        {t.eInvoiceIrn ? (
                                            <span className="text-green-600 font-semibold" title={t.eInvoiceIrn}>IRN ✓</span>
                                        ) : t.eWayBillNo ? (
                                            <span className="text-purple-600 font-semibold">EWB ✓</span>
                                        ) : (
                                            <span className="text-text-muted">—</span>
                                        )}
                                    </td>
                                    <td className="text-center">
                                        <div className="flex justify-center items-center gap-1">
                                            <button onClick={() => onViewReceipt(t)} title="View Receipt" className="btn-icon" aria-label="View receipt">
                                                <IconPrint className="w-5 h-5" />
                                            </button>
                                            <button onClick={() => onViewDetails(t)} className="btn-link text-sm px-2 py-1">
                                                Details
                                            </button>
                                            {logMode === 'quotations' && onConvertQuotation && (
                                                <button
                                                    onClick={() => onConvertQuotation(t)}
                                                    className="btn-success btn-sm whitespace-nowrap"
                                                >
                                                    Convert
                                                </button>
                                            )}
                                            {userRole === 'admin' && onDelete && (
                                                <button onClick={() => onDelete(t)} title="Delete" className="btn-icon text-red-500 hover:text-red-700" aria-label="Delete transaction">
                                                    <IconTrash className="w-5 h-5" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan={8} className="!p-0">
                                    <EmptyState
                                        icon={<IconBox />}
                                        title="No transactions found"
                                        message="Try adjusting your filters or create a new sale."
                                        action={{ label: 'Create New Sale', onClick: onAddTransaction }}
                                        compact
                                    />
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <PaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={onPageChange}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={onItemsPerPageChange}
            />
        </div>
    );
};