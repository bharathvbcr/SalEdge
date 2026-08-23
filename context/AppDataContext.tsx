

import React, { createContext, useContext, ReactNode, useEffect, useState, useCallback, useMemo } from 'react';
import useApiStorage from '../hooks/useApiStorage.tsx';
import { api } from '../utils/api.ts';
import { InventoryItem, ServiceJob, Transaction, ServiceJobStatus, WarrantyLog, Expense, InventoryLog, ScrapItem, Purchase, PurchaseItem, PaymentVoucher, StockTakeAdjustment, AuditLog, UserRole, PurchaseInvoiceUpload, DailyClose, MonthlyClose, YearlyClose } from '../types.ts';
import { INITIAL_INVENTORY, INITIAL_SERVICE_JOBS, INITIAL_TRANSACTIONS, INITIAL_EXPENSES } from '../constants.ts';
import { hasLegacyNegativeReturns, normalizeLegacyReturnSigns } from '../utils/canonicalReturns.ts';
import { useToast } from './ToastContext.tsx';
import { useMasterData } from './MasterDataContext.tsx';
import { useConfig } from './ConfigContext.tsx';
import { useAuth } from './AuthContext.tsx';
import { isSerialInInventory, normalizeSerial, isSerialTrackedItem, clampSerialStock, parseTransactionSerials, findSerialInventoryRecord } from '../utils/serialNumbers.ts';
import { SHARED_INVENTORY_FIRM_ID, normalizeInventoryFirmIds, sharedInventoryFirmId } from '../utils/sharedInventory.ts';
import { computeWarrantyEnds } from '../utils/warrantyDates.ts';

// Unbounded growth directly inflates every debounced whole-collection save,
// so rolling logs are hard-capped.
const MAX_INVENTORY_LOGS = 1000;
const MAX_AUDIT_LOGS_DISPLAYED = 200;

interface AppDataContextType {
    isLoading: boolean;
    inventory: InventoryItem[];
    addStock: (newItem: Omit<InventoryItem, 'id'>, options?: { referenceId?: string; reason?: string }) => boolean;
    updateStockQuantity: (inventoryItemId: string, quantityToAdd: number) => void;
    updateBatchDetails: (inventoryItemId: string, updatedDetails: Partial<Omit<InventoryItem, 'id' | 'stock' | 'productTypeId'>>) => void;
    deleteBatch: (inventoryItemId: string) => void;
    adjustStock: (inventoryItemId: string, newQuantity: number, reason: string) => void;
    performStockTake: (adjustments: StockTakeAdjustment[]) => void;

    scrapInventory: ScrapItem[];
    addScrapItem: (item: Omit<ScrapItem, 'id'>) => void;
    markScrapSold: (id: string) => void;

    serviceJobs: ServiceJob[];
    addServiceJob: (newJob: Omit<ServiceJob, 'id' | 'status' | 'receivedDate'>) => void;
    updateServiceJob: (updatedJob: ServiceJob) => void;
    transactions: Transaction[];
    addTransaction: (newTransaction: Omit<Transaction, 'id'>) => Transaction;
    updateTransaction: (originalTransaction: Transaction, updatedTransaction: Omit<Transaction, 'id'>) => void;
    deleteTransaction: (transactionId: string, userRole: UserRole, skipConfirm?: boolean) => boolean;
    getTransactionDeleteWarnings: (transactionId: string) => { ok: boolean; warnings: string[] } | null;
    updateTransactionCompliance: (transactionId: string, updates: Partial<Transaction>) => void;
    warrantyLogs: WarrantyLog[];
    expenses: Expense[];
    addExpense: (newExpense: Omit<Expense, 'id'>) => void;
    updateExpense: (updatedExpense: Expense) => void;
    deleteExpense: (expenseId: string) => void;
    inventoryLogs: InventoryLog[];
    purchases: Purchase[];
    addPurchase: (newPurchase: Omit<Purchase, 'id'>) => void;
    importPurchases: (drafts: Omit<Purchase, 'id'>[]) => number;
    updatePurchase: (updatedPurchase: Purchase) => void;
    deletePurchase: (purchaseId: string, userRole: UserRole, skipConfirm?: boolean) => boolean;
    purchaseInvoiceQueue: PurchaseInvoiceUpload[];
    addPurchaseInvoiceUpload: (upload: Omit<PurchaseInvoiceUpload, 'id' | 'capturedAt'>) => string;
    removePurchaseInvoiceUpload: (uploadId: string) => void;
    paymentVouchers: PaymentVoucher[];
    addPaymentVoucher: (voucher: Omit<PaymentVoucher, 'id'>) => void;
    deletePaymentVoucher: (id: string) => void;
    auditLogs: AuditLog[];
    dailyCloses: DailyClose[];
    saveDailyClose: (close: Omit<DailyClose, 'id' | 'closedAt'>) => DailyClose;
    reopenDailyClose: (date: string, firmId?: string) => void;
    monthlyCloses: MonthlyClose[];
    saveMonthlyClose: (close: Omit<MonthlyClose, 'id' | 'closedAt'>) => MonthlyClose;
    reopenMonthlyClose: (year: number, month: number) => void;
    yearlyCloses: YearlyClose[];
    saveYearlyClose: (close: Omit<YearlyClose, 'id' | 'closedAt'>) => YearlyClose;
    reopenYearlyClose: (year: number) => void;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export const AppDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { addToast } = useToast();
    const { productTypes } = useMasterData();
    const { config } = useConfig();
    const { userRole } = useAuth();

    const [inventory, setInventory, invLoading] = useApiStorage<InventoryItem[]>('inventory', normalizeInventoryFirmIds(INITIAL_INVENTORY));
    const [scrapInventory, setScrapInventory, scrapLoading] = useApiStorage<ScrapItem[]>('scrapInventory', []);
    const [serviceJobs, setServiceJobs, jobsLoading] = useApiStorage<ServiceJob[]>('serviceJobs', INITIAL_SERVICE_JOBS);
    const [transactions, setTransactions, txLoading] = useApiStorage<Transaction[]>('transactions', INITIAL_TRANSACTIONS.map(t => ({ ...t, type: t.type || 'Sale' })));
    const [warrantyLogs, setWarrantyLogs, wtyLoading] = useApiStorage<WarrantyLog[]>('warrantyLogs', []);
    const [expenses, setExpenses, expLoading] = useApiStorage<Expense[]>('expenses', INITIAL_EXPENSES);
    const [inventoryLogs, setInventoryLogs, logsLoading] = useApiStorage<InventoryLog[]>('inventoryLogs', []);
    const [purchases, setPurchases, purLoading] = useApiStorage<Purchase[]>('purchases', []);
    const [purchaseInvoiceQueue, setPurchaseInvoiceQueue, piqLoading] = useApiStorage<PurchaseInvoiceUpload[]>('purchaseInvoiceQueue', []);
    const [paymentVouchers, setPaymentVouchers, vchLoading] = useApiStorage<PaymentVoucher[]>('paymentVouchers', []);
    const [dailyCloses, setDailyCloses, dcLoading] = useApiStorage<DailyClose[]>('dailyCloses', []);
    const [monthlyCloses, setMonthlyCloses, mcLoading] = useApiStorage<MonthlyClose[]>('monthlyCloses', []);
    const [yearlyCloses, setYearlyCloses, ycLoading] = useApiStorage<YearlyClose[]>('yearlyCloses', []);

    // Audit trail lives server-side in an append-only table (tamper-proof,
    // survives Reset App). Local state is a display cache hydrated from it.
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    useEffect(() => {
        if (userRole !== 'admin') return;
        let cancelled = false;
        api.getAuditLogs(MAX_AUDIT_LOGS_DISPLAYED)
            .then(({ entries }) => {
                if (cancelled) return;
                setAuditLogs(entries.map(e => ({
                    id: e.id,
                    date: e.date,
                    action: e.action as AuditLog['action'],
                    entityType: (e.entityType || 'AppData') as AuditLog['entityType'],
                    entityId: e.entityId || '',
                    userRole: (e.userRole || 'staff') as AuditLog['userRole'],
                    details: e.details || '',
                })));
            })
            .catch(() => { /* viewer falls back to "no entries" */ });
        return () => { cancelled = true; };
    }, [userRole]);

    const isLoading = invLoading || scrapLoading || jobsLoading || txLoading || wtyLoading || expLoading || logsLoading || purLoading || piqLoading || vchLoading || dcLoading || mcLoading || ycLoading;

    // One-shot heal for legacy credit notes stored with NEGATIVE magnitudes.
    // SalesForm used to persist returns with negative total/tax/item prices,
    // while every report helper assumes positive values and flips direction
    // off `type === 'Return'` — a full refund inflated customer spend/dues and
    // drawer balances. Normalize once; the storage layer persists the fix.
    useEffect(() => {
        if (txLoading) return;
        setTransactions(prev => {
            if (!hasLegacyNegativeReturns(prev)) return prev;
            return normalizeLegacyReturnSigns(prev);
        });
        // Runs once per mount; functional update keeps it self-healing but
        // idempotent, so no loop is possible.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [txLoading, setTransactions]);

    const addAuditLog = useCallback((log: Omit<AuditLog, 'id' | 'date'>) => {
        const entry: AuditLog = {
            id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            date: new Date().toISOString(),
            ...log,
        };
        setAuditLogs(prev => [entry, ...prev].slice(0, MAX_AUDIT_LOGS_DISPLAYED));
        api.postAuditLog({
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId,
            userRole: entry.userRole,
            details: entry.details,
            snapshot: entry.snapshot,
        });
    }, []);

    useEffect(() => {
        const needsSharedFirm = inventory.some(item => item.firmId !== SHARED_INVENTORY_FIRM_ID);
        if (needsSharedFirm) {
            setInventory(prev => normalizeInventoryFirmIds(prev));
        }
    }, []);

    const getProductName = useCallback((productTypeId: string) => {
        const product = productTypes.find(p => p.id === productTypeId);
        return product ? `${product.brandName} ${product.name}` : 'Unknown Product';
    }, [productTypes]);

    const normalizeInventoryRecords = useCallback((items: InventoryItem[]): InventoryItem[] =>
        items
            .map(item => isSerialTrackedItem(item) ? { ...item, stock: clampSerialStock(item.stock) } : item)
            .filter(item => item.stock > 0 || isSerialTrackedItem(item)), []);

    /**
     * Side-effect-free logging helper: appends through a functional update only
     * (never call this from inside another setState updater — StrictMode
     * double-invocation would duplicate entries).
     */
    const addInventoryLog = useCallback((logData: Omit<InventoryLog, 'id' | 'date'>) => {
        const newLog: InventoryLog = {
            id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            date: new Date().toISOString(),
            ...logData
        };
        setInventoryLogs(prev => [newLog, ...prev].slice(0, MAX_INVENTORY_LOGS));
    }, [setInventoryLogs]);

    const addStock = useCallback((newItem: Omit<InventoryItem, 'id'>, options?: { referenceId?: string; reason?: string }): boolean => {
        const serialNumber = normalizeSerial(newItem.serialNumber);
        if (!serialNumber) {
            addToast('Serial number is required for each battery.', 'error');
            return false;
        }
        if (isSerialInInventory(serialNumber, inventory)) {
            addToast(`Serial "${serialNumber}" is already in stock.`, 'error');
            return false;
        }

        const soldUnit = findSerialInventoryRecord(serialNumber, inventory);
        if (soldUnit && soldUnit.stock <= 0) {
            const unitId = soldUnit.id;
            const unitProductTypeId = soldUnit.productTypeId;
            setInventory(prev => normalizeInventoryRecords(
                prev.map(item =>
                    item.id === unitId
                        ? {
                            ...item,
                            ...newItem,
                            firmId: sharedInventoryFirmId(),
                            serialNumber,
                            stock: 1,
                            purchaseDate: newItem.purchaseDate || item.purchaseDate,
                            purchasePrice: newItem.purchasePrice ?? item.purchasePrice,
                            mrp: newItem.mrp ?? item.mrp,
                        }
                        : item
                )
            ));
            addInventoryLog({
                inventoryItemId: unitId,
                productName: getProductName(unitProductTypeId),
                change: 1,
                newQuantity: 1,
                reason: options?.reason || 'Battery returned to inventory',
                referenceId: options?.referenceId,
            });
            return true;
        }

        const newStockItem: InventoryItem = {
            id: `INV${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            ...newItem,
            firmId: sharedInventoryFirmId(),
            serialNumber,
            stock: 1,
        };
        setInventory(prev => [...prev, newStockItem]);
        addInventoryLog({
            inventoryItemId: newStockItem.id,
            productName: getProductName(newStockItem.productTypeId),
            change: 1,
            newQuantity: 1,
            reason: options?.reason || 'Battery added to inventory',
            referenceId: options?.referenceId,
        });
        return true;
    }, [inventory, setInventory, addInventoryLog, getProductName, addToast]);

    const updateStockQuantity = useCallback((inventoryItemId: string, quantityToAdd: number) => {
        const item = inventory.find(i => i.id === inventoryItemId);
        if (!item) {
            addToast('Inventory item not found', 'error');
            return;
        }

        if (isSerialTrackedItem(item) && quantityToAdd > 0) {
            addToast('Add new batteries by scanning each serial number.', 'error');
            return;
        }

        let newQuantity = item.stock + quantityToAdd;
        if (isSerialTrackedItem(item)) {
            newQuantity = Math.max(0, Math.min(1, newQuantity));
        }
        if (newQuantity < 0) {
            addToast(`Cannot reduce stock below 0. Current stock: ${item.stock}`, 'error');
            return;
        }
        if (newQuantity === item.stock) return;

        setInventory(prev => normalizeInventoryRecords(
            prev.map(invItem =>
                invItem.id === inventoryItemId
                    ? { ...invItem, stock: newQuantity }
                    : invItem
            )
        ));

        addInventoryLog({
            inventoryItemId: item.id,
            productName: getProductName(item.productTypeId),
            change: newQuantity - item.stock,
            newQuantity: newQuantity,
            reason: quantityToAdd < 0 ? 'Stock Reduction/Transfer' : 'Stock Addition'
        });
    }, [inventory, setInventory, addInventoryLog, getProductName, addToast]);

    const updateBatchDetails = useCallback((inventoryItemId: string, updatedDetails: Partial<Omit<InventoryItem, 'id' | 'stock' | 'productTypeId'>>) => {
        if (updatedDetails.serialNumber !== undefined) {
            const serial = normalizeSerial(updatedDetails.serialNumber);
            const item = inventory.find(i => i.id === inventoryItemId);
            if (serial && item && isSerialInInventory(serial, inventory, undefined, inventoryItemId)) {
                addToast(`Serial "${serial}" is already in stock.`, 'error');
                return;
            }
            updatedDetails = { ...updatedDetails, serialNumber: serial };
        }
        setInventory(prev => prev.map(item =>
            item.id === inventoryItemId
                ? { ...item, ...updatedDetails }
                : item
        ));
        addToast('Batch details updated!', 'info');
    }, [inventory, setInventory, addToast]);

    const deleteBatch = useCallback((inventoryItemId: string) => {
        const itemToDelete = inventory.find(i => i.id === inventoryItemId);
        if (itemToDelete && itemToDelete.stock > 0) {
            addToast('Cannot delete a batch that is not empty. Please adjust stock to 0 first.', 'error');
            return;
        }
        setInventory(prev => prev.filter(item => item.id !== inventoryItemId));
        addToast('Empty batch deleted!', 'warning');
    }, [inventory, setInventory, addToast]);

    const adjustStock = useCallback((inventoryItemId: string, newQuantity: number, reason: string) => {
        if (newQuantity < 0) {
            addToast('Stock quantity cannot be negative', 'error');
            return;
        }

        const itemToAdjust = inventory.find(item => item.id === inventoryItemId);
        if (!itemToAdjust) return;
        if (isSerialTrackedItem(itemToAdjust) && newQuantity > 1) {
            addToast('Serial-tracked batteries can only be in stock (1) or sold (0).', 'error');
            return;
        }

        setInventory(prev => normalizeInventoryRecords(
            prev.map(item => item.id === inventoryItemId ? { ...item, stock: newQuantity } : item)
        ));

        // Log computed from pre-update values outside the setState updater
        // (impure updaters duplicate side effects under StrictMode).
        addInventoryLog({
            inventoryItemId,
            productName: getProductName(itemToAdjust.productTypeId),
            change: newQuantity - itemToAdjust.stock,
            newQuantity,
            reason: `Stock Adjustment: ${reason}`
        });
        addToast('Stock quantity adjusted!', 'info');
    }, [inventory, setInventory, addInventoryLog, getProductName, addToast]);

    const performStockTake = useCallback((adjustments: StockTakeAdjustment[]) => {
        const sessionId = `STK-${Date.now()}`;
        const pendingLogs: Omit<InventoryLog, 'id' | 'date'>[] = [];

        const updated = inventory.map(item => {
            const adj = adjustments.find(a => a.inventoryItemId === item.id);
            if (!adj || adj.countedQty === item.stock) return item;

            const countedQty = isSerialTrackedItem(item) ? clampSerialStock(adj.countedQty) : adj.countedQty;
            const change = countedQty - item.stock;
            pendingLogs.push({
                inventoryItemId: item.id,
                productName: getProductName(item.productTypeId),
                change,
                newQuantity: countedQty,
                reason: `Stock Take ${sessionId}`,
                referenceId: sessionId,
            });
            return { ...item, stock: countedQty };
        });

        if (pendingLogs.length === 0) {
            addToast('Stock take complete: no variances found.', 'info');
            return;
        }

        setInventory(normalizeInventoryRecords(updated));
        pendingLogs.forEach(addInventoryLog);
        addToast(`Stock take complete: ${pendingLogs.length} batch(es) adjusted.`, 'success');
    }, [inventory, setInventory, addInventoryLog, getProductName, addToast]);

    const addScrapItem = useCallback((item: Omit<ScrapItem, 'id'>) => {
        const newItem: ScrapItem = { ...item, id: `SCRAP${Date.now()}` };
        setScrapInventory(prev => [...prev, newItem]);
    }, [setScrapInventory]);

    const markScrapSold = useCallback((id: string) => {
        setScrapInventory(prev => prev.map(item => item.id === id ? { ...item, status: 'Sold' } : item));
    }, [setScrapInventory]);

    const addServiceJob = useCallback((newJob: Omit<ServiceJob, 'id' | 'status' | 'receivedDate'>) => {
        const job: ServiceJob = {
            ...newJob, id: `JOB${Date.now()}`,
            status: ServiceJobStatus.PENDING,
            receivedDate: new Date().toISOString(),
        };
        setServiceJobs(prev => [job, ...prev]);
        addToast('New service job added!', 'success');
    }, [setServiceJobs, addToast]);

    const updateServiceJob = useCallback((updatedJob: ServiceJob) => {
        setServiceJobs(prev => prev.map(job => (job.id === updatedJob.id ? updatedJob : job)));
        addToast(`Job ${updatedJob.id} updated!`, 'info');
    }, [setServiceJobs, addToast]);

    const manageWarrantyLogs = useCallback((transaction: Transaction) => {
        const newLogs: Omit<WarrantyLog, 'id'>[] = [];
        transaction.items.forEach(item => {
            if (item.serialNumbers && (item.guaranteePeriodMonths || item.warrantyPeriodMonths)) {
                const serials = item.serialNumbers.split(',').map(s => s.trim()).filter(Boolean);
                serials.forEach(serial => {
                    // Month-end clamped math: Jan 31 + 1mo ends Feb 28/29,
                    // not Mar 3 (raw setMonth overflow).
                    const { guaranteeEndDate, warrantyEndDate } = computeWarrantyEnds(
                        transaction.date,
                        item.guaranteePeriodMonths || 0,
                        item.warrantyPeriodMonths || 0
                    );

                    newLogs.push({
                        transactionId: transaction.id, inventoryId: item.id, productName: item.name,
                        serialNumber: serial, customerName: transaction.customerName, customerPhone: transaction.customerPhone || '',
                        saleDate: transaction.date,
                        saleCategory: transaction.saleCategory,
                        vehicleNumber: transaction.vehicleNumber,
                        vehicleModel: transaction.vehicleModel,
                        guaranteePeriodMonths: item.guaranteePeriodMonths || 0, guaranteeEndDate,
                        warrantyPeriodMonths: item.warrantyPeriodMonths || 0, warrantyEndDate,
                    });
                });
            }
        });
        if (newLogs.length > 0) {
            setWarrantyLogs(prev => [...prev, ...newLogs.map((log, i) => ({ ...log, id: `WTY-${Date.now()}-${i}` }))]);
        }
    }, [setWarrantyLogs]);

    const addTransaction = useCallback((newTransactionData: Omit<Transaction, 'id'>): Transaction => {
        const newTransaction: Transaction = { ...newTransactionData, id: `TRN${Date.now()}` };
        const isReturn = newTransaction.type === 'Return';

        if (newTransaction.status !== 'Quotation') {
            // Compute stock changes from the current array OUTSIDE setState so
            // the accompanying inventory logs are emitted exactly once.
            const pendingLogs: Omit<InventoryLog, 'id' | 'date'>[] = [];
            const updatedInventory = normalizeInventoryRecords(inventory.map(invItem => {
                const itemInSale = newTransaction.items.find(i => i.id === invItem.id && !i.isCustom && !i.isBuyback);
                if (itemInSale) {
                    const quantityChange = isReturn ? itemInSale.quantity : -itemInSale.quantity;
                    const newStock = isSerialTrackedItem(invItem)
                        ? clampSerialStock(invItem.stock + quantityChange)
                        : invItem.stock + quantityChange;
                    pendingLogs.push({
                        inventoryItemId: invItem.id,
                        productName: getProductName(invItem.productTypeId),
                        change: newStock - invItem.stock,
                        newQuantity: newStock,
                        reason: isReturn ? 'Sales Return' : 'Sale',
                        referenceId: newTransaction.id,
                    });
                    return { ...invItem, stock: newStock };
                }
                return invItem;
            }));
            if (pendingLogs.length > 0) {
                setInventory(updatedInventory);
                pendingLogs.forEach(addInventoryLog);
            }

            if (isReturn && newTransaction.originalTransactionId) {
                const returnedSerials = new Set(
                    newTransaction.items.flatMap(item => parseTransactionSerials(item.serialNumbers))
                );
                if (returnedSerials.size > 0) {
                    setWarrantyLogs(prev => prev.filter(log =>
                        !(log.transactionId === newTransaction.originalTransactionId &&
                            returnedSerials.has(log.serialNumber))
                    ));
                }
            }

            newTransaction.items.forEach(item => {
                if (item.isBuyback) {
                    addScrapItem({
                        date: newTransaction.date,
                        sourceTransactionId: newTransaction.id,
                        productName: `${item.buybackBrand || 'Unknown'} ${item.buybackCapacity || ''} ${item.buybackSerialNumber ? `(SN: ${item.buybackSerialNumber})` : ''}`.trim(),
                        category: item.buybackCapacity?.includes('Ah') ? 'Battery' : 'Other',
                        quantity: item.quantity,
                        purchasePrice: Math.abs(item.price),
                        status: 'In Stock',
                        notes: `Buyback from ${newTransaction.customerName}`
                    });
                }
            });

            if (!isReturn) manageWarrantyLogs(newTransaction);
            addToast(isReturn ? 'Return processed successfully!' : 'Sale recorded successfully!', 'success');
        } else {
            addToast('Quotation saved successfully!', 'success');
        }
        setTransactions(prev => [newTransaction, ...prev]);
        return newTransaction;
    }, [inventory, setInventory, setTransactions, addInventoryLog, addScrapItem, manageWarrantyLogs, getProductName, addToast]);

    const updateTransaction = useCallback((originalTransaction: Transaction, updatedTransactionData: Omit<Transaction, 'id'>) => {
        const wasQuotation = originalTransaction.status === 'Quotation';
        const isNowSale = updatedTransactionData.status === 'Paid' || updatedTransactionData.status === 'Due';

        const stockAdjustments = new Map<string, number>();
        const originalQuantities = new Map(originalTransaction.items.filter(i => !i.isCustom && !i.isBuyback).map(i => [i.id, i.quantity]));
        const updatedQuantities = new Map(updatedTransactionData.items.filter(i => !i.isCustom && !i.isBuyback).map(i => [i.id, i.quantity]));
        const allItemIds = new Set([...originalQuantities.keys(), ...updatedQuantities.keys()]);

        allItemIds.forEach(itemId => {
            const originalQty = wasQuotation ? 0 : (originalQuantities.get(itemId) || 0);
            const updatedQty = isNowSale ? (updatedQuantities.get(itemId) || 0) : 0;
            const adjustment = originalQty - updatedQty;
            if (adjustment !== 0) stockAdjustments.set(itemId, adjustment);
        });

        if (stockAdjustments.size > 0) {
            const pendingLogs: Omit<InventoryLog, 'id' | 'date'>[] = [];
            const updatedInventory = normalizeInventoryRecords(inventory.map(invItem => {
                if (stockAdjustments.has(invItem.id)) {
                    const change = stockAdjustments.get(invItem.id) ?? 0;
                    const newStock = isSerialTrackedItem(invItem)
                        ? clampSerialStock(invItem.stock + change)
                        : invItem.stock + change;
                    pendingLogs.push({
                        inventoryItemId: invItem.id,
                        productName: getProductName(invItem.productTypeId),
                        change: -change,
                        newQuantity: newStock,
                        reason: wasQuotation ? 'Sale from Quotation' : 'Sale Updated',
                        referenceId: originalTransaction.id,
                    });
                    return { ...invItem, stock: newStock };
                }
                return invItem;
            }));
            setInventory(updatedInventory);
            pendingLogs.forEach(addInventoryLog);
        }

        const updatedTransaction: Transaction = { ...updatedTransactionData, id: originalTransaction.id };
        setTransactions(prev => prev.map(t => t.id === originalTransaction.id ? updatedTransaction : t));

        setWarrantyLogs(prev => prev.filter(log => log.transactionId !== originalTransaction.id));
        if (isNowSale && updatedTransaction.type !== 'Return') manageWarrantyLogs(updatedTransaction);

        addToast(`Transaction ${originalTransaction.id} updated!`, 'success');
    }, [inventory, setInventory, setTransactions, setWarrantyLogs, addInventoryLog, manageWarrantyLogs, getProductName, addToast]);

    const checkStockReversalForDelete = useCallback((transaction: Transaction): { ok: boolean; warnings: string[] } => {
        const warnings: string[] = [];
        if (transaction.status === 'Quotation') return { ok: true, warnings };

        const isReturn = transaction.type === 'Return';
        for (const item of transaction.items) {
            if (item.isCustom || item.isBuyback) continue;
            const invItem = inventory.find(i => i.id === item.id);
            if (!invItem) continue;
            const stockChange = isReturn ? -item.quantity : item.quantity;
            if (invItem.stock + stockChange < 0) {
                warnings.push(`${item.name}: would result in negative stock (${invItem.stock} available, need ${item.quantity})`);
            }
        }
        return { ok: warnings.length === 0, warnings };
    }, [inventory]);

    const reverseTransactionStock = useCallback((transaction: Transaction) => {
        if (transaction.status === 'Quotation') return;
        const isReturn = transaction.type === 'Return';

        const pendingLogs: Omit<InventoryLog, 'id' | 'date'>[] = [];
        const updatedInventory = normalizeInventoryRecords(inventory.map(invItem => {
            const itemInTx = transaction.items.find(i => i.id === invItem.id && !i.isCustom && !i.isBuyback);
            if (!itemInTx) return invItem;
            const quantityChange = isReturn ? -itemInTx.quantity : itemInTx.quantity;
            const newStock = isSerialTrackedItem(invItem)
                ? clampSerialStock(invItem.stock + quantityChange)
                : invItem.stock + quantityChange;
            pendingLogs.push({
                inventoryItemId: invItem.id,
                productName: getProductName(invItem.productTypeId),
                change: newStock - invItem.stock,
                newQuantity: newStock,
                reason: `Delete reversal: ${transaction.id}`,
                referenceId: transaction.id,
            });
            return { ...invItem, stock: newStock };
        }));

        if (pendingLogs.length > 0) {
            setInventory(updatedInventory);
            pendingLogs.forEach(addInventoryLog);
        }
    }, [inventory, setInventory, addInventoryLog, getProductName]);

    const getTransactionDeleteWarnings = useCallback((transactionId: string): { ok: boolean; warnings: string[] } | null => {
        const transaction = transactions.find(t => t.id === transactionId);
        if (!transaction) return null;
        return checkStockReversalForDelete(transaction);
    }, [transactions, checkStockReversalForDelete]);

    const deleteTransaction = useCallback((transactionId: string, userRole: UserRole, skipConfirm = false): boolean => {
        const transaction = transactions.find(t => t.id === transactionId);
        if (!transaction) {
            addToast('Transaction not found.', 'error');
            return false;
        }

        if (!skipConfirm) return false;

        reverseTransactionStock(transaction);
        setWarrantyLogs(prev => prev.filter(log => log.transactionId !== transactionId));
        setTransactions(prev => prev.filter(t => t.id !== transactionId));

        addAuditLog({
            action: 'DELETE',
            entityType: 'Transaction',
            entityId: transactionId,
            userRole,
            details: `Deleted ${transaction.type} ${transaction.invoiceNumber || transactionId} for ${transaction.customerName}`,
            snapshot: JSON.stringify(transaction),
        });

        addToast('Transaction deleted.', 'warning');
        return true;
    }, [transactions, setWarrantyLogs, setTransactions, reverseTransactionStock, addAuditLog, addToast]);

    const updateTransactionCompliance = useCallback((transactionId: string, updates: Partial<Transaction>) => {
        setTransactions(prev => prev.map(t =>
            t.id === transactionId ? { ...t, ...updates } : t
        ));
    }, [setTransactions]);

    const addExpense = useCallback((newExpenseData: Omit<Expense, 'id'>) => {
        const newExpense: Expense = { id: `EXP${Date.now()}`, ...newExpenseData };
        setExpenses(prev => [newExpense, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        addToast('Expense recorded successfully!', 'success');
    }, [setExpenses, addToast]);

    const updateExpense = useCallback((updatedExpense: Expense) => {
        setExpenses(prev => prev.map(exp => exp.id === updatedExpense.id ? updatedExpense : exp));
        addToast(`Expense ${updatedExpense.id} updated!`, 'info');
    }, [setExpenses, addToast]);

    const deleteExpense = useCallback((expenseId: string) => {
        setExpenses(prev => prev.filter(exp => exp.id !== expenseId));
        addToast('Expense deleted!', 'warning');
    }, [setExpenses, addToast]);

    const findBatchesForPurchaseItem = (purchase: Purchase, item: PurchaseItem, currentInventory: InventoryItem[]): InventoryItem[] => {
        if (item.serialNumbers && item.serialNumbers.length > 0) {
            return currentInventory.filter(inv =>
                item.serialNumbers!.includes(inv.serialNumber)
            );
        }
        return currentInventory.filter(inv =>
            inv.productTypeId === item.productTypeId &&
            inv.purchaseDate === purchase.date &&
            inv.purchasePrice === item.unitPrice &&
            inv.mrp === item.mrp &&
            inv.type === item.type &&
            (inv.batchNumber?.toLowerCase() || '') === (item.batchNumber?.toLowerCase() || '') &&
            inv.supplierId === purchase.supplierId &&
            !inv.serialNumber
        );
    };

    const applyPurchaseStock = useCallback((purchase: Purchase) => {
        if (purchase.status !== 'Received') return;

        purchase.items.forEach(item => {
            const stockOptions = { referenceId: purchase.id, reason: `Purchase ${purchase.supplierInvoiceNumber || purchase.id}` };

            const serials = (item.serialNumbers ?? []).map(normalizeSerial).filter(Boolean);
            serials.forEach(sn => {
                addStock({
                    firmId: sharedInventoryFirmId(),
                    productTypeId: item.productTypeId,
                    type: item.type,
                    serialNumber: sn,
                    batchNumber: item.batchNumber,
                    purchaseDate: purchase.date,
                    purchasePrice: item.unitPrice,
                    mrp: item.mrp,
                    supplierId: purchase.supplierId,
                    stock: 1,
                }, stockOptions);
            });
        });
    }, [addStock]);

    const revertPurchaseStock = useCallback((purchase: Purchase): boolean => {
        if (purchase.status !== 'Received') return true;

        const purchaseLogs = inventoryLogs.filter(l => l.referenceId === purchase.id);

        if (purchaseLogs.length > 0) {
            for (const log of purchaseLogs) {
                const invItem = inventory.find(i => i.id === log.inventoryItemId);
                if (!invItem || invItem.stock < log.change) {
                    addToast('Cannot update purchase: stock from this bill has been partially sold or transferred.', 'error');
                    return false;
                }
            }

            const working = [...inventory];
            const pendingLogs: Omit<InventoryLog, 'id' | 'date'>[] = [];
            for (const log of purchaseLogs) {
                const idx = working.findIndex(i => i.id === log.inventoryItemId);
                if (idx >= 0) {
                    const newStock = working[idx].stock - log.change;
                    pendingLogs.push({
                        inventoryItemId: log.inventoryItemId,
                        productName: log.productName,
                        change: -log.change,
                        newQuantity: newStock,
                        reason: `Purchase reversal ${purchase.supplierInvoiceNumber || purchase.id}`,
                        referenceId: purchase.id,
                    });
                    if (newStock <= 0 && working[idx].serialNumber) {
                        working.splice(idx, 1);
                    } else {
                        working[idx] = { ...working[idx], stock: Math.max(0, newStock) };
                    }
                }
            }
            setInventory(working.filter(i => i.stock > 0 || !i.serialNumber));
            pendingLogs.forEach(addInventoryLog);
            return true;
        }

        for (const item of purchase.items) {
            const batches = findBatchesForPurchaseItem(purchase, item, inventory);
            const qtyToRevert = item.serialNumbers?.length || item.quantity;
            const available = batches.reduce((sum, b) => sum + b.stock, 0);
            if (available < qtyToRevert) {
                addToast('Cannot update purchase: matching stock is no longer available.', 'error');
                return false;
            }
        }

        const working = [...inventory];
        const pendingLogs: Omit<InventoryLog, 'id' | 'date'>[] = [];
        purchase.items.forEach(item => {
            const batches = findBatchesForPurchaseItem(purchase, item, working);
            let remaining = item.serialNumbers?.length || item.quantity;
            for (const batch of batches) {
                if (remaining <= 0) break;
                const idx = working.findIndex(i => i.id === batch.id);
                if (idx < 0) continue;
                const reduction = Math.min(remaining, working[idx].stock);
                const newStock = working[idx].stock - reduction;
                pendingLogs.push({
                    inventoryItemId: batch.id,
                    productName: getProductName(batch.productTypeId),
                    change: -reduction,
                    newQuantity: newStock,
                    reason: `Purchase reversal ${purchase.supplierInvoiceNumber || purchase.id}`,
                    referenceId: purchase.id,
                });
                if (newStock <= 0 && working[idx].serialNumber) {
                    working.splice(idx, 1);
                } else {
                    working[idx] = { ...working[idx], stock: newStock };
                }
                remaining -= reduction;
            }
        });
        setInventory(working.filter(i => i.stock > 0 || !i.serialNumber));
        pendingLogs.forEach(addInventoryLog);
        return true;
    }, [inventory, inventoryLogs, setInventory, addInventoryLog, getProductName, addToast]);

    const purchaseItemsEqual = (a: PurchaseItem[], b: PurchaseItem[]) => JSON.stringify(a) === JSON.stringify(b);

    const isStockAffectingPurchaseChange = (original: Purchase, updated: Purchase) =>
        original.status !== updated.status ||
        original.date !== updated.date ||
        !purchaseItemsEqual(original.items, updated.items);

    const addPurchase = useCallback((newPurchase: Omit<Purchase, 'id'>) => {
        const purchase: Purchase = { ...newPurchase, id: `PUR${Date.now()}` };
        setPurchases(prev => [purchase, ...prev]);

        if (purchase.status === 'Received') {
            applyPurchaseStock(purchase);
        }
        addToast('Purchase invoice recorded and stock added!', 'success');
    }, [setPurchases, applyPurchaseStock, addToast]);

    const importPurchases = useCallback((drafts: Omit<Purchase, 'id'>[]) => {
        if (drafts.length === 0) return 0;
        const imported: Purchase[] = drafts.map((draft, idx) => ({
            ...draft,
            id: `PUR${Date.now()}-${idx}`,
        }));
        setPurchases(prev => [...imported, ...prev]);
        imported.filter(p => p.status === 'Received').forEach(applyPurchaseStock);
        addToast(`Imported ${imported.length} purchase bill${imported.length === 1 ? '' : 's'}.`, 'success');
        return imported.length;
    }, [setPurchases, applyPurchaseStock, addToast]);

    const addPurchaseInvoiceUpload = useCallback((upload: Omit<PurchaseInvoiceUpload, 'id' | 'capturedAt'>) => {
        const entry: PurchaseInvoiceUpload = {
            ...upload,
            id: `PIU${Date.now()}`,
            capturedAt: new Date().toISOString(),
        };
        setPurchaseInvoiceQueue(prev => [entry, ...prev]);
        addToast('Invoice photo uploaded.', 'success');
        return entry.id;
    }, [setPurchaseInvoiceQueue, addToast]);

    const removePurchaseInvoiceUpload = useCallback((uploadId: string) => {
        setPurchaseInvoiceQueue(prev => prev.filter(item => item.id !== uploadId));
    }, [setPurchaseInvoiceQueue]);

    const updatePurchase = useCallback((updatedPurchase: Purchase) => {
        const original = purchases.find(p => p.id === updatedPurchase.id);
        if (!original) {
            addToast('Purchase not found.', 'error');
            return;
        }

        const stockAffecting = isStockAffectingPurchaseChange(original, updatedPurchase);

        if (original.status === 'Received' && stockAffecting) {
            if (!revertPurchaseStock(original)) return;
        }

        setPurchases(prev => prev.map(p => p.id === updatedPurchase.id ? updatedPurchase : p));

        if (updatedPurchase.status === 'Received' && (stockAffecting || original.status !== 'Received')) {
            applyPurchaseStock(updatedPurchase);
        }

        addToast('Purchase details updated', 'info');
    }, [purchases, setPurchases, revertPurchaseStock, applyPurchaseStock, addToast]);

    const deletePurchase = useCallback((purchaseId: string, userRole: UserRole, skipConfirm = false): boolean => {
        const purchase = purchases.find(p => p.id === purchaseId);
        if (!purchase) {
            addToast('Purchase not found.', 'error');
            return false;
        }

        if (purchase.status === 'Received') {
            if (!revertPurchaseStock(purchase)) return false;
        }

        if (!skipConfirm) {
            if (purchase.status === 'Received') {
                applyPurchaseStock(purchase);
            }
            return false;
        }

        setPurchases(prev => prev.filter(p => p.id !== purchaseId));
        addAuditLog({
            action: 'DELETE',
            entityType: 'Purchase',
            entityId: purchaseId,
            userRole,
            details: `Deleted purchase ${purchase.supplierInvoiceNumber || purchaseId}`,
            snapshot: JSON.stringify(purchase),
        });
        addToast('Purchase deleted.', 'warning');
        return true;
    }, [purchases, setPurchases, revertPurchaseStock, applyPurchaseStock, addAuditLog, addToast]);

    const addPaymentVoucher = useCallback((voucher: Omit<PaymentVoucher, 'id'>) => {
        const newVoucher: PaymentVoucher = { ...voucher, id: `VCH${Date.now()}` };
        setPaymentVouchers(prev => [newVoucher, ...prev]);
        addToast(voucher.type === 'Receipt' ? 'Payment received!' : 'Payment made!', 'success');
    }, [setPaymentVouchers, addToast]);

    const deletePaymentVoucher = useCallback((id: string) => {
        setPaymentVouchers(prev => prev.filter(v => v.id !== id));
        addToast('Voucher deleted', 'warning');
    }, [setPaymentVouchers, addToast]);

    const saveDailyClose = useCallback((close: Omit<DailyClose, 'id' | 'closedAt'>): DailyClose => {
        const entry: DailyClose = {
            ...close,
            id: `DC-${Date.now()}`,
            closedAt: new Date().toISOString(),
        };
        setDailyCloses(prev => {
            const filtered = prev.filter(c => !(c.date === close.date && (c.firmId || 'all') === (close.firmId || 'all')));
            return [entry, ...filtered];
        });
        addToast(`Day closed for ${new Date(close.date).toLocaleDateString('en-IN')}`, 'success');
        return entry;
    }, [setDailyCloses, addToast]);

    const reopenDailyClose = useCallback((date: string, firmId?: string) => {
        setDailyCloses(prev => prev.filter(c => !(c.date === date && (c.firmId || 'all') === (firmId || 'all'))));
        addToast(`Reopened ${new Date(date).toLocaleDateString('en-IN')} for edits`, 'info');
    }, [setDailyCloses, addToast]);

    const saveMonthlyClose = useCallback((close: Omit<MonthlyClose, 'id' | 'closedAt'>): MonthlyClose => {
        const entry: MonthlyClose = {
            ...close,
            id: `MC-${Date.now()}`,
            closedAt: new Date().toISOString(),
        };
        setMonthlyCloses(prev => {
            const filtered = prev.filter(c => !(c.year === close.year && c.month === close.month));
            return [entry, ...filtered];
        });
        addToast(`Month closed for ${close.month}/${close.year}`, 'success');
        return entry;
    }, [setMonthlyCloses, addToast]);

    const reopenMonthlyClose = useCallback((year: number, month: number) => {
        setMonthlyCloses(prev => prev.filter(c => !(c.year === year && c.month === month)));
        addToast(`Reopened ${month}/${year} for edits`, 'info');
    }, [setMonthlyCloses, addToast]);

    const saveYearlyClose = useCallback((close: Omit<YearlyClose, 'id' | 'closedAt'>): YearlyClose => {
        const entry: YearlyClose = {
            ...close,
            id: `YC-${Date.now()}`,
            closedAt: new Date().toISOString(),
        };
        setYearlyCloses(prev => {
            const filtered = prev.filter(c => c.year !== close.year);
            return [entry, ...filtered];
        });
        addToast(`Year ${close.year} closed`, 'success');
        return entry;
    }, [setYearlyCloses, addToast]);

    const reopenYearlyClose = useCallback((year: number) => {
        setYearlyCloses(prev => prev.filter(c => c.year !== year));
        addToast(`Reopened year ${year} for edits`, 'info');
    }, [setYearlyCloses, addToast]);

    // Memoized context value: transient toasts or unrelated mutations no
    // longer recreate ~40 functions and re-render every consumer in the tree.
    const contextValue = useMemo(() => ({
        isLoading,
        inventory, addStock, updateStockQuantity, updateBatchDetails, deleteBatch, adjustStock, performStockTake,
        scrapInventory, addScrapItem, markScrapSold,
        serviceJobs, addServiceJob, updateServiceJob,
        transactions, addTransaction, updateTransaction, deleteTransaction, getTransactionDeleteWarnings, updateTransactionCompliance,
        warrantyLogs,
        expenses, addExpense, updateExpense, deleteExpense,
        inventoryLogs,
        purchases, addPurchase, importPurchases, updatePurchase, deletePurchase,
        purchaseInvoiceQueue, addPurchaseInvoiceUpload, removePurchaseInvoiceUpload,
        paymentVouchers, addPaymentVoucher, deletePaymentVoucher,
        auditLogs,
        dailyCloses, saveDailyClose, reopenDailyClose,
        monthlyCloses, saveMonthlyClose, reopenMonthlyClose,
        yearlyCloses, saveYearlyClose, reopenYearlyClose,
    }), [
        isLoading,
        inventory, addStock, updateStockQuantity, updateBatchDetails, deleteBatch, adjustStock, performStockTake,
        scrapInventory, addScrapItem, markScrapSold,
        serviceJobs, addServiceJob, updateServiceJob,
        transactions, addTransaction, updateTransaction, deleteTransaction, getTransactionDeleteWarnings, updateTransactionCompliance,
        warrantyLogs,
        expenses, addExpense, updateExpense, deleteExpense,
        inventoryLogs,
        purchases, addPurchase, importPurchases, updatePurchase, deletePurchase,
        purchaseInvoiceQueue, addPurchaseInvoiceUpload, removePurchaseInvoiceUpload,
        paymentVouchers, addPaymentVoucher, deletePaymentVoucher,
        auditLogs,
        dailyCloses, saveDailyClose, reopenDailyClose,
        monthlyCloses, saveMonthlyClose, reopenMonthlyClose,
        yearlyCloses, saveYearlyClose, reopenYearlyClose,
    ]);

    return (
        <AppDataContext.Provider value={contextValue}>
            {children}
        </AppDataContext.Provider>
    );
};

export const useAppData = () => {
    const context = useContext(AppDataContext);
    if (context === undefined) {
        throw new Error('useAppData must be used within an AppDataProvider');
    }
    return context;
};
