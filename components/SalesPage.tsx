


import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { Transaction } from '../types.ts';
import { TransactionsLog } from './TransactionsLog.tsx';
import { SalesForm } from './SalesForm.tsx';
import { TransactionDetailModal } from './TransactionDetailModal.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { IconPlus, IconScan } from './icons.tsx';
import { consumeOpenSaleRequest, getSaleQueue } from '../utils/mobileSaleQueue.ts';
import { consumeViewReceiptRequest } from '../utils/pageActions.ts';
import { hasSaleDraft, clearSaleDraft } from '../utils/saleDraft.ts';
import { ConfirmationModal } from './ConfirmationModal.tsx';
import { PageHeader } from './PageHeader.tsx';
import { usePageIntent } from '../hooks/usePageIntent.ts';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.ts';

type ActiveTab = 'sales' | 'quotations' | 'returns';
const DEFAULT_ITEMS_PER_PAGE = 25;

export const SalesPage: React.FC = () => {
    const { inventory, transactions, addTransaction, updateTransaction, deleteTransaction, getTransactionDeleteWarnings } = useAppData();
    const { productTypes } = useMasterData();
    const { userRole } = useAuth();
    const { config } = useConfig();
    const saleCategories = config.preferences.saleCategories ?? [];
    const [isFormOpen, setFormOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
    const [transactionToReturn, setTransactionToReturn] = useState<Transaction | null>(null);
    const [isViewMode, setIsViewMode] = useState(false);
    const [activeTab, setActiveTab] = useState<ActiveTab>('sales');
    const [isQuickPrint, setIsQuickPrint] = useState(false);
    const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
    const [stockDeleteWarnings, setStockDeleteWarnings] = useState<string[] | null>(null);
    const [pendingDraftPrompt, setPendingDraftPrompt] = useState(false);
    const [queueCount, setQueueCount] = useState(0);

    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Transaction; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
    const [newSaleKey, setNewSaleKey] = useState(0);

    const refreshQueueCount = useCallback(() => {
        setQueueCount(getSaleQueue().length);
    }, []);

    useEffect(() => {
        refreshQueueCount();
        const onFocus = () => refreshQueueCount();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [refreshQueueCount]);

    const openNewSaleForm = useCallback((fromDraft = false) => {
        setSelectedTransaction(null);
        setTransactionToEdit(null);
        setTransactionToReturn(null);
        setIsViewMode(false);
        if (!fromDraft) clearSaleDraft();
        setNewSaleKey(k => k + 1);
        setFormOpen(true);
        refreshQueueCount();
    }, [refreshQueueCount]);

    const tryOpenNewSale = useCallback(() => {
        if (hasSaleDraft()) {
            setPendingDraftPrompt(true);
        } else {
            openNewSaleForm(false);
        }
    }, [openNewSaleForm]);

    useKeyboardShortcuts(useMemo(() => [
        { key: 'n', handler: tryOpenNewSale, enabled: activeTab === 'sales' && !isFormOpen },
    ], [activeTab, isFormOpen, tryOpenNewSale]));

    const salesFormKey = transactionToEdit
        ? `${isViewMode ? 'view' : 'edit'}-${transactionToEdit.id}`
        : transactionToReturn
            ? `return-${transactionToReturn.id}`
            : `new-${newSaleKey}`;

    const filteredAndSortedTransactions = useMemo(() => {
        const sourceTransactions = activeTab === 'sales'
            ? transactions.filter(t => t.status !== 'Quotation' && t.type !== 'Return')
            : activeTab === 'returns'
                ? transactions.filter(t => t.type === 'Return')
                : transactions.filter(t => t.status === 'Quotation');

        let filtered = [...sourceTransactions].filter(t => {
            const transactionDate = new Date(t.date);
            if (dateRange.start && transactionDate < new Date(dateRange.start)) return false;
            if (dateRange.end) {
                const endDate = new Date(dateRange.end);
                endDate.setHours(23, 59, 59, 999);
                if (transactionDate > endDate) return false;
            }
            if (categoryFilter && t.saleCategory !== categoryFilter) return false;
            if (searchQuery) {
                const lowercasedQuery = searchQuery.toLowerCase();
                return t.customerName.toLowerCase().includes(lowercasedQuery) ||
                       t.id.toLowerCase().includes(lowercasedQuery) ||
                       (t.invoiceNumber && t.invoiceNumber.toLowerCase().includes(lowercasedQuery)) ||
                       (t.customerPhone && t.customerPhone.includes(lowercasedQuery)) ||
                       (t.saleCategory && t.saleCategory.toLowerCase().includes(lowercasedQuery)) ||
                       (t.vehicleNumber && t.vehicleNumber.toLowerCase().includes(lowercasedQuery)) ||
                       (t.vehicleModel && t.vehicleModel.toLowerCase().includes(lowercasedQuery));
            }
            return true;
        });

        filtered.sort((a, b) => {
            const aVal = a[sortConfig.key] ?? '';
            const bVal = b[sortConfig.key] ?? '';
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [transactions, searchQuery, categoryFilter, dateRange, sortConfig, activeTab]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, categoryFilter, dateRange, sortConfig, activeTab, itemsPerPage]);

    const openReceiptForTransaction = useCallback((transaction: Transaction) => {
        setTransactionToEdit(null);
        setFormOpen(false);
        setIsQuickPrint(true);
        setSelectedTransaction(transaction);
    }, []);

    const applySalesPageIntent = useCallback(() => {
        if (consumeOpenSaleRequest()) {
            setActiveTab('sales');
            openNewSaleForm(false);
        }
        const receiptId = consumeViewReceiptRequest();
        if (receiptId) {
            const tx = transactions.find(t => t.id === receiptId);
            if (tx) {
                setActiveTab('sales');
                openReceiptForTransaction(tx);
            }
        }
    }, [openNewSaleForm, transactions, openReceiptForTransaction]);

    usePageIntent(applySalesPageIntent);

    const totalPages = Math.ceil(filteredAndSortedTransactions.length / itemsPerPage) || 1;

    const paginatedTransactions = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredAndSortedTransactions.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredAndSortedTransactions, currentPage, itemsPerPage]);

    const handleAddSale = (saleData: Omit<Transaction, 'id'>) => {
        const created = addTransaction(saleData);
        setFormOpen(false);
        setTransactionToReturn(null);
        refreshQueueCount();
        if (saleData.status === 'Quotation') {
            setActiveTab('quotations');
        } else if (saleData.type === 'Return') {
            setActiveTab('returns');
        } else {
            setActiveTab('sales');
            openReceiptForTransaction(created);
        }
    };

    const handleUpdateSale = (originalTransaction: Transaction, updatedSaleData: Omit<Transaction, 'id'>) => {
        updateTransaction(originalTransaction, updatedSaleData);
        setTransactionToEdit(null);
        setFormOpen(false);
        setIsViewMode(false);
        if (updatedSaleData.status === 'Quotation') {
            setActiveTab('quotations');
        } else {
            setActiveTab('sales');
        }
    };

    const handleEditClick = (transaction: Transaction) => {
        setSelectedTransaction(null);
        setTransactionToReturn(null);
        setTransactionToEdit(transaction);
        setIsViewMode(false);
        setFormOpen(true);
    };

    const handleReturnClick = (transaction: Transaction) => {
        setSelectedTransaction(null);
        setTransactionToEdit(null);
        setTransactionToReturn(transaction);
        setIsViewMode(false);
        setFormOpen(true);
    };

    const handleViewDetails = (transaction: Transaction) => {
        setSelectedTransaction(null);
        setTransactionToReturn(null);
        setTransactionToEdit(transaction);
        setIsViewMode(true);
        setFormOpen(true);
    };

    const handleViewReceipt = (transaction: Transaction) => {
        openReceiptForTransaction(transaction);
    };

    const handleViewReceiptManual = (transaction: Transaction) => {
        setTransactionToEdit(null);
        setFormOpen(false);
        setIsQuickPrint(false);
        setSelectedTransaction(transaction);
    };

    const handleDeleteTransaction = (transaction: Transaction) => {
        const warnings = getTransactionDeleteWarnings(transaction.id);
        if (!warnings) return;
        if (!warnings.ok) setStockDeleteWarnings(warnings.warnings);
        setTransactionToDelete(transaction);
    };

    const confirmDeleteTransaction = () => {
        if (!transactionToDelete) return;
        if (deleteTransaction(transactionToDelete.id, userRole!, true)) {
            setSelectedTransaction(null);
        }
        setTransactionToDelete(null);
        setStockDeleteWarnings(null);
    };

    const closeForm = () => {
        setFormOpen(false);
        setTransactionToEdit(null);
        setTransactionToReturn(null);
        setIsViewMode(false);
        refreshQueueCount();
    };

    const setTodayFilter = () => {
        const today = new Date().toISOString().split('T')[0];
        setDateRange({ start: today, end: today });
    };

    const TabButton: React.FC<{ tab: ActiveTab; label: string }> = ({ tab, label }) => (
        <button onClick={() => setActiveTab(tab)} className={`tab-btn ${activeTab === tab ? 'active' : ''}`}>
            {label}
        </button>
    );

    return (
        <div className="page-shell relative">
            <PageHeader title="Sales & Billing" subtitle="Create invoices, track payments, and manage returns">
                {activeTab === 'sales' && (
                    <div className="flex items-center gap-2">
                        {queueCount > 0 && (
                            <span className="text-xs font-bold bg-brand-red text-white px-2 py-0.5 rounded-full">
                                {queueCount} scanned
                            </span>
                        )}
                        <button type="button" onClick={tryOpenNewSale} className="btn-primary flex-shrink-0">
                            <IconPlus className="h-4 w-4" /> New Sale
                        </button>
                    </div>
                )}
            </PageHeader>

            {queueCount > 0 && !isFormOpen && activeTab === 'sales' && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <IconScan className="h-6 w-6 text-brand-red flex-shrink-0" />
                        <p className="text-sm font-medium text-text-primary">
                            {queueCount} item{queueCount !== 1 ? 's' : ''} scanned on mobile — continue billing on desktop
                        </p>
                    </div>
                    <button type="button" onClick={() => openNewSaleForm(false)} className="btn-primary btn-sm whitespace-nowrap">
                        Continue Sale
                    </button>
                </div>
            )}

            <div className="tab-bar">
                <TabButton tab="sales" label="Sales Log" />
                <TabButton tab="returns" label="Returns" />
                <TabButton tab="quotations" label="Quotations" />
            </div>

            <TransactionsLog
                transactions={paginatedTransactions}
                onViewDetails={handleViewDetails}
                onViewReceipt={handleViewReceipt}
                onDelete={handleDeleteTransaction}
                onAddTransaction={tryOpenNewSale}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                dateRange={dateRange}
                setDateRange={setDateRange}
                onTodayFilter={setTodayFilter}
                categoryFilter={categoryFilter}
                setCategoryFilter={setCategoryFilter}
                saleCategories={saleCategories}
                sortConfig={sortConfig}
                setSortConfig={setSortConfig}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={setItemsPerPage}
                logMode={activeTab}
                onConvertQuotation={handleEditClick}
            />

            {activeTab === 'sales' && !isFormOpen && (
                <button
                    type="button"
                    onClick={tryOpenNewSale}
                    className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-10 flex items-center gap-2 btn-primary shadow-lg shadow-brand-red/30 rounded-full px-5 py-3"
                    aria-label="New sale"
                >
                    <IconPlus className="h-5 w-5" /> Sale
                </button>
            )}

            {isFormOpen && (
                <SalesForm
                    key={salesFormKey}
                    inventory={inventory}
                    productTypes={productTypes}
                    transactions={transactions}
                    transactionToEdit={transactionToEdit}
                    transactionToReturn={transactionToReturn}
                    initialViewMode={isViewMode}
                    onAddSale={handleAddSale}
                    onUpdateSale={handleUpdateSale}
                    onClose={closeForm}
                    onViewReceipt={handleViewReceiptManual}
                />
            )}

            {selectedTransaction && (
                <TransactionDetailModal
                    transaction={selectedTransaction}
                    onClose={() => {
                        setSelectedTransaction(null);
                        setIsQuickPrint(false);
                    }}
                    onEdit={selectedTransaction.type === 'Sale' && selectedTransaction.status !== 'Quotation' ? handleReturnClick : handleEditClick}
                    onDelete={handleDeleteTransaction}
                    autoPrint={isQuickPrint}
                />
            )}

            {pendingDraftPrompt && (
                <ConfirmationModal
                    title="Resume Unfinished Sale?"
                    message="You have an unfinished sale draft. Resume where you left off or start fresh?"
                    variant="default"
                    confirmText="Resume Draft"
                    cancelText="Start Fresh"
                    onConfirm={() => { setPendingDraftPrompt(false); openNewSaleForm(true); }}
                    onCancel={() => { clearSaleDraft(); setPendingDraftPrompt(false); openNewSaleForm(false); }}
                />
            )}

            {transactionToDelete && stockDeleteWarnings && (
                <ConfirmationModal
                    title="Stock Warning"
                    message={`Deleting this transaction will cause negative stock:\n\n${stockDeleteWarnings.join('\n')}\n\nProceed anyway?`}
                    variant="default"
                    confirmText="Delete Anyway"
                    onConfirm={confirmDeleteTransaction}
                    onCancel={() => { setTransactionToDelete(null); setStockDeleteWarnings(null); }}
                />
            )}

            {transactionToDelete && !stockDeleteWarnings && (
                <ConfirmationModal
                    title="Delete Transaction"
                    message={`Delete transaction ${transactionToDelete.invoiceNumber || transactionToDelete.id}? This cannot be undone.`}
                    confirmText="Delete"
                    onConfirm={confirmDeleteTransaction}
                    onCancel={() => setTransactionToDelete(null)}
                />
            )}
        </div>
    );
};
