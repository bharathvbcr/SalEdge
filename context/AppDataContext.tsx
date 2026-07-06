

import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import useApiStorage from '../hooks/useApiStorage.tsx';
import { InventoryItem, ServiceJob, Transaction, ServiceJobStatus, WarrantyLog, Expense, InventoryLog, ScrapItem, Purchase, PurchaseItem, PaymentVoucher, StockTakeAdjustment, AuditLog, UserRole, PurchaseInvoiceUpload, DailyClose, MonthlyClose, YearlyClose } from '../types.ts';
import { INITIAL_INVENTORY, INITIAL_SERVICE_JOBS, INITIAL_TRANSACTIONS, INITIAL_EXPENSES } from '../constants.ts';
import { useToast } from './ToastContext.tsx';
import { useMasterData } from './MasterDataContext.tsx';
import { useConfig } from './ConfigContext.tsx';
import { isSerialInInventory, normalizeSerial, isSerialTrackedItem, clampSerialStock, parseTransactionSerials, findSerialInventoryRecord } from '../utils/serialNumbers.ts';

interface AppDataContextType {
    isLoading: boolean;
    inventory: InventoryItem[];
    addStock: (newItem: Omit<InventoryItem, 'id'>, options?: { referenceId?: string; reason?: string }) => boolean;
    transferStock: (inventoryItemId: string, targetFirmId: string, quantity: number) => void;
    updateStockQuantity: (inventoryItemId: string, quantityToAdd: number) => void;
    updateBatchDetails: (inventoryItemId: string, updatedDetails: Partial<Omit<InventoryItem, 'id' | 'stock' | 'productTypeId'>>) => void;
    deleteBatch: (inventoryItemId: string) => void;
    adjustStock: (inventoryItemId: string, newQuantity: number, reason: string) => void;
    performStockTake: (firmId: string, adjustments: StockTakeAdjustment[]) => void;

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

    const [inventory, setInventory, invLoading] = useApiStorage<InventoryItem[]>('inventory', INITIAL_INVENTORY.map(item => ({ ...item, firmId: item.firmId || 'FIRM001' })));
    const [scrapInventory, setScrapInventory, scrapLoading] = useApiStorage<ScrapItem[]>('scrapInventory', []);
    const [serviceJobs, setServiceJobs, jobsLoading] = useApiStorage<ServiceJob[]>('serviceJobs', INITIAL_SERVICE_JOBS);
    const [transactions, setTransactions, txLoading] = useApiStorage<Transaction[]>('transactions', INITIAL_TRANSACTIONS.map(t => ({ ...t, type: t.type || 'Sale' })));
    const [warrantyLogs, setWarrantyLogs, wtyLoading] = useApiStorage<WarrantyLog[]>('warrantyLogs', []);
    const [expenses, setExpenses, expLoading] = useApiStorage<Expense[]>('expenses', INITIAL_EXPENSES);
    const [inventoryLogs, setInventoryLogs, logsLoading] = useApiStorage<InventoryLog[]>('inventoryLogs', []);
    const [purchases, setPurchases, purLoading] = useApiStorage<Purchase[]>('purchases', []);
    const [purchaseInvoiceQueue, setPurchaseInvoiceQueue, piqLoading] = useApiStorage<PurchaseInvoiceUpload[]>('purchaseInvoiceQueue', []);
    const [paymentVouchers, setPaymentVouchers, vchLoading] = useApiStorage<PaymentVoucher[]>('paymentVouchers', []);
    const [auditLogs, setAuditLogs, audLoading] = useApiStorage<AuditLog[]>('auditLogs', []);
    const [dailyCloses, setDailyCloses, dcLoading] = useApiStorage<DailyClose[]>('dailyCloses', []);
    const [monthlyCloses, setMonthlyCloses, mcLoading] = useApiStorage<MonthlyClose[]>('monthlyCloses', []);
    const [yearlyCloses, setYearlyCloses, ycLoading] = useApiStorage<YearlyClose[]>('yearlyCloses', []);

    const isLoading = invLoading || scrapLoading || jobsLoading || txLoading || wtyLoading || expLoading || logsLoading || purLoading || piqLoading || vchLoading || audLoading || dcLoading || mcLoading || ycLoading;

    const addAuditLog = (log: Omit<AuditLog, 'id' | 'date'>) => {
        const entry: AuditLog = {
            id: `AUD-${Date.now()}`,
            date: new Date().toISOString(),
            ...log,
        };
        setAuditLogs(prev => [entry, ...prev].slice(0, 500));
    };

    useEffect(() => {
        const hasMissingFirmId = inventory.some(item => !item.firmId);
        if (hasMissingFirmId) {
            setInventory(prev => prev.map(item => item.firmId ? item : { ...item, firmId: config.preferences.defaultFirmId || 'FIRM001' }));
        }
    }, [config.preferences.defaultFirmId]);

    const getProductName = (productTypeId: string) => {
        const product = productTypes.find(p => p.id === productTypeId);
        return product ? `${product.brandName} ${product.name}` : 'Unknown Product';
    };

    const normalizeInventoryRecords = (items: InventoryItem[]): InventoryItem[] =>
        items
            .map(item => isSerialTrackedItem(item) ? { ...item, stock: clampSerialStock(item.stock) } : item)
            .filter(item => item.stock > 0 || isSerialTrackedItem(item));

    const addInventoryLog = (logData: Omit<InventoryLog, 'id' | 'date'>) => {
        const newLog: InventoryLog = {
            id: `LOG-${Date.now()}`,
            date: new Date().toISOString(),
            ...logData
        };
        setInventoryLogs(prev => [newLog, ...prev]);
    };

    const addStock = (newItem: Omit<InventoryItem, 'id'>, options?: { referenceId?: string; reason?: string }): boolean => {
        const serialNumber = normalizeSerial(newItem.serialNumber);
        if (!serialNumber) {
            addToast('Serial number is required for each battery.', 'error');
            return false;
        }
        if (isSerialInInventory(serialNumber, inventory, newItem.firmId)) {
            addToast(`Serial "${serialNumber}" is already in stock.`, 'error');
            return false;
        }

        const soldUnit = findSerialInventoryRecord(serialNumber, inventory, newItem.firmId);
        if (soldUnit && soldUnit.stock <= 0) {
            setInventory(prev => normalizeInventoryRecords(
                prev.map(item =>
                    item.id === soldUnit.id
                        ? {
                            ...item,
                            ...newItem,
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
                inventoryItemId: soldUnit.id,
                productName: getProductName(soldUnit.productTypeId),
                change: 1,
                newQuantity: 1,
                reason: options?.reason || 'Battery returned to inventory',
                referenceId: options?.referenceId,
            });
            return true;
        }

        const newStockItem: InventoryItem = {
            id: `INV${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            ...newItem,
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
    };

    const transferStock = (inventoryItemId: string, targetFirmId: string, quantity: number) => {
        const sourceItem = inventory.find(i => i.id === inventoryItemId);
        if (!sourceItem || sourceItem.stock < quantity) {
            addToast('Insufficient stock for transfer.', 'error');
            return;
        }
        if (isSerialTrackedItem(sourceItem) && quantity !== 1) {
            addToast('Serial-tracked batteries must be transferred one at a time.', 'error');
            return;
        }

        updateStockQuantity(inventoryItemId, -quantity);

        const transferred = addStock({
            firmId: targetFirmId,
            productTypeId: sourceItem.productTypeId,
            type: sourceItem.type,
            serialNumber: sourceItem.serialNumber,
            batchNumber: sourceItem.batchNumber,
            purchaseDate: sourceItem.purchaseDate,
            purchasePrice: sourceItem.purchasePrice,
            mrp: sourceItem.mrp,
            supplierId: sourceItem.supplierId,
            stock: isSerialTrackedItem(sourceItem) ? 1 : quantity,
        });
        if (!transferred) {
            if (isSerialTrackedItem(sourceItem)) {
                addStock({
                    firmId: sourceItem.firmId,
                    productTypeId: sourceItem.productTypeId,
                    type: sourceItem.type,
                    serialNumber: sourceItem.serialNumber,
                    batchNumber: sourceItem.batchNumber,
                    purchaseDate: sourceItem.purchaseDate,
                    purchasePrice: sourceItem.purchasePrice,
                    mrp: sourceItem.mrp,
                    supplierId: sourceItem.supplierId,
                    stock: 1,
                }, { reason: 'Transfer rollback' });
            } else {
                updateStockQuantity(inventoryItemId, quantity);
            }
            addToast('Transfer failed — stock restored at source.', 'error');
            return;
        }

        addToast('Stock transferred successfully!', 'success');
    };

    const updateStockQuantity = (inventoryItemId: string, quantityToAdd: number) => {
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

        setInventory(prev => {
            const updated = prev.map(invItem =>
                invItem.id === inventoryItemId
                    ? { ...invItem, stock: newQuantity }
                    : invItem
            );
            return normalizeInventoryRecords(updated);
        });

        addInventoryLog({
            inventoryItemId: item.id,
            productName: getProductName(item.productTypeId),
            change: newQuantity - item.stock,
            newQuantity: newQuantity,
            reason: quantityToAdd < 0 ? 'Stock Reduction/Transfer' : 'Stock Addition'
        });
    };

    const updateBatchDetails = (inventoryItemId: string, updatedDetails: Partial<Omit<InventoryItem, 'id' | 'stock' | 'productTypeId'>>) => {
        if (updatedDetails.serialNumber !== undefined) {
            const serial = normalizeSerial(updatedDetails.serialNumber);
            const item = inventory.find(i => i.id === inventoryItemId);
            if (serial && item && isSerialInInventory(serial, inventory, item.firmId, inventoryItemId)) {
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
    };

    const deleteBatch = (inventoryItemId: string) => {
        const itemToDelete = inventory.find(i => i.id === inventoryItemId);
        if (itemToDelete && itemToDelete.stock > 0) {
            addToast('Cannot delete a batch that is not empty. Please adjust stock to 0 first.', 'error');
            return;
        }
        setInventory(prev => prev.filter(item => item.id !== inventoryItemId));
        addToast('Empty batch deleted!', 'warning');
    };

    const adjustStock = (inventoryItemId: string, newQuantity: number, reason: string) => {
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

        setInventory(prev => {
            let change = 0;
            const item = prev.find(i => i.id === inventoryItemId);
            if (item) {
                change = newQuantity - item.stock;
                addInventoryLog({
                    inventoryItemId,
                    productName: getProductName(item.productTypeId),
                    change,
                    newQuantity,
                    reason: `Stock Adjustment: ${reason}`
                });
            }
            return normalizeInventoryRecords(
                prev
                    .map(item => item.id === inventoryItemId ? { ...item, stock: newQuantity } : item)
            );
        });
        addToast('Stock quantity adjusted!', 'info');
    };

    const performStockTake = (firmId: string, adjustments: StockTakeAdjustment[]) => {
        const sessionId = `STK-${Date.now()}`;
        let adjustedCount = 0;

        setInventory(prev => {
            const updated = prev.map(item => {
                const adj = adjustments.find(a => a.inventoryItemId === item.id);
                if (!adj || item.firmId !== firmId || adj.countedQty === item.stock) return item;

                const countedQty = isSerialTrackedItem(item) ? clampSerialStock(adj.countedQty) : adj.countedQty;
                const change = countedQty - item.stock;
                addInventoryLog({
                    inventoryItemId: item.id,
                    productName: getProductName(item.productTypeId),
                    change,
                    newQuantity: countedQty,
                    reason: `Stock Take ${sessionId}`,
                    referenceId: sessionId,
                });
                adjustedCount++;
                return { ...item, stock: countedQty };
            });
            return normalizeInventoryRecords(updated);
        });

        if (adjustedCount > 0) {
            addToast(`Stock take complete: ${adjustedCount} batch(es) adjusted.`, 'success');
        } else {
            addToast('Stock take complete: no variances found.', 'info');
        }
    };

    const addScrapItem = (item: Omit<ScrapItem, 'id'>) => {
        const newItem: ScrapItem = { ...item, id: `SCRAP${Date.now()}` };
        setScrapInventory(prev => [...prev, newItem]);
    };

    const markScrapSold = (id: string) => {
        setScrapInventory(prev => prev.map(item => item.id === id ? { ...item, status: 'Sold' } : item));
    };

    const addServiceJob = (newJob: Omit<ServiceJob, 'id' | 'status' | 'receivedDate'>) => {
        const job: ServiceJob = {
            ...newJob, id: `JOB${Date.now()}`,
            status: ServiceJobStatus.PENDING,
            receivedDate: new Date().toISOString(),
        };
        setServiceJobs(prev => [job, ...prev]);
        addToast('New service job added!', 'success');
    };

    const updateServiceJob = (updatedJob: ServiceJob) => {
        setServiceJobs(prev => prev.map(job => (job.id === updatedJob.id ? updatedJob : job)));
        addToast(`Job ${updatedJob.id} updated!`, 'info');
    };

    const manageWarrantyLogs = (transaction: Transaction) => {
        const newLogs: Omit<WarrantyLog, 'id'>[] = [];
        transaction.items.forEach(item => {
            if (item.serialNumbers && (item.guaranteePeriodMonths || item.warrantyPeriodMonths)) {
                const serials = item.serialNumbers.split(',').map(s => s.trim()).filter(Boolean);
                serials.forEach(serial => {
                    const saleDate = new Date(transaction.date);
                    const guaranteeMonths = item.guaranteePeriodMonths || 0;
                    const warrantyMonths = item.warrantyPeriodMonths || 0;
                    const guaranteeEndDate = new Date(saleDate);
                    guaranteeEndDate.setMonth(guaranteeEndDate.getMonth() + guaranteeMonths);
                    const warrantyEndDate = new Date(saleDate);
                    warrantyEndDate.setMonth(warrantyEndDate.getMonth() + guaranteeMonths + warrantyMonths);

                    newLogs.push({
                        transactionId: transaction.id, inventoryId: item.id, productName: item.name,
                        serialNumber: serial, customerName: transaction.customerName, customerPhone: transaction.customerPhone || '',
                        saleDate: transaction.date,
                        saleCategory: transaction.saleCategory,
                        vehicleNumber: transaction.vehicleNumber,
                        vehicleModel: transaction.vehicleModel,
                        guaranteePeriodMonths: guaranteeMonths, guaranteeEndDate: guaranteeEndDate.toISOString(),
                        warrantyPeriodMonths: warrantyMonths, warrantyEndDate: warrantyEndDate.toISOString(),
                    });
                });
            }
        });
        if (newLogs.length > 0) {
            setWarrantyLogs(prev => [...prev, ...newLogs.map((log, i) => ({ ...log, id: `WTY-${Date.now()}-${i}` }))]);
        }
    };

    const addTransaction = (newTransactionData: Omit<Transaction, 'id'>): Transaction => {
        const newTransaction: Transaction = { ...newTransactionData, id: `TRN${Date.now()}` };
        const isReturn = newTransaction.type === 'Return';

        if (newTransaction.status !== 'Quotation') {
            setInventory(currentInventory => {
                return normalizeInventoryRecords(currentInventory.map(invItem => {
                    const itemInSale = newTransaction.items.find(i => i.id === invItem.id && !i.isCustom && !i.isBuyback);
                    if (itemInSale) {
                        const quantityChange = isReturn ? itemInSale.quantity : -itemInSale.quantity;
                        const newStock = isSerialTrackedItem(invItem)
                            ? clampSerialStock(invItem.stock + quantityChange)
                            : invItem.stock + quantityChange;
                        addInventoryLog({
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
            });

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
    };

    const updateTransaction = (originalTransaction: Transaction, updatedTransactionData: Omit<Transaction, 'id'>) => {
        const wasQuotation = originalTransaction.status === 'Quotation';
        const isNowSale = updatedTransactionData.status === 'Paid' || updatedTransactionData.status === 'Due';

        setInventory(currentInventory => {
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

            if (stockAdjustments.size === 0) return currentInventory;

            return normalizeInventoryRecords(currentInventory.map(invItem => {
                if (stockAdjustments.has(invItem.id)) {
                    const change = stockAdjustments.get(invItem.id) ?? 0;
                    const newStock = isSerialTrackedItem(invItem)
                        ? clampSerialStock(invItem.stock + change)
                        : invItem.stock + change;
                    addInventoryLog({
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
        });

        const updatedTransaction: Transaction = { ...updatedTransactionData, id: originalTransaction.id };
        setTransactions(prev => prev.map(t => t.id === originalTransaction.id ? updatedTransaction : t));

        setWarrantyLogs(prev => prev.filter(log => log.transactionId !== originalTransaction.id));
        if (isNowSale && updatedTransaction.type !== 'Return') manageWarrantyLogs(updatedTransaction);

        addToast(`Transaction ${originalTransaction.id} updated!`, 'success');
    };

    const checkStockReversalForDelete = (transaction: Transaction): { ok: boolean; warnings: string[] } => {
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
    };

    const reverseTransactionStock = (transaction: Transaction) => {
        if (transaction.status === 'Quotation') return;
        const isReturn = transaction.type === 'Return';

        setInventory(currentInventory => {
            return normalizeInventoryRecords(currentInventory.map(invItem => {
                const itemInTx = transaction.items.find(i => i.id === invItem.id && !i.isCustom && !i.isBuyback);
                if (!itemInTx) return invItem;
                const quantityChange = isReturn ? -itemInTx.quantity : itemInTx.quantity;
                const newStock = isSerialTrackedItem(invItem)
                    ? clampSerialStock(invItem.stock + quantityChange)
                    : invItem.stock + quantityChange;
                addInventoryLog({
                    inventoryItemId: invItem.id,
                    productName: getProductName(invItem.productTypeId),
                    change: newStock - invItem.stock,
                    newQuantity: newStock,
                    reason: `Delete reversal: ${transaction.id}`,
                    referenceId: transaction.id,
                });
                return { ...invItem, stock: newStock };
            }));
        });
    };

    const getTransactionDeleteWarnings = (transactionId: string): { ok: boolean; warnings: string[] } | null => {
        const transaction = transactions.find(t => t.id === transactionId);
        if (!transaction) return null;
        return checkStockReversalForDelete(transaction);
    };

    const deleteTransaction = (transactionId: string, userRole: UserRole, skipConfirm = false): boolean => {
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
    };

    const updateTransactionCompliance = (transactionId: string, updates: Partial<Transaction>) => {
        setTransactions(prev => prev.map(t =>
            t.id === transactionId ? { ...t, ...updates } : t
        ));
    };

    const addExpense = (newExpenseData: Omit<Expense, 'id'>) => {
        const newExpense: Expense = { id: `EXP${Date.now()}`, ...newExpenseData };
        setExpenses(prev => [newExpense, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        addToast('Expense recorded successfully!', 'success');
    };

    const updateExpense = (updatedExpense: Expense) => {
        setExpenses(prev => prev.map(exp => exp.id === updatedExpense.id ? updatedExpense : exp));
        addToast(`Expense ${updatedExpense.id} updated!`, 'info');
    };

    const deleteExpense = (expenseId: string) => {
        setExpenses(prev => prev.filter(exp => exp.id !== expenseId));
        addToast('Expense deleted!', 'warning');
    };

    const findBatchesForPurchaseItem = (purchase: Purchase, item: PurchaseItem, currentInventory: InventoryItem[]): InventoryItem[] => {
        if (item.serialNumbers && item.serialNumbers.length > 0) {
            return currentInventory.filter(inv =>
                inv.firmId === purchase.firmId &&
                item.serialNumbers!.includes(inv.serialNumber)
            );
        }
        return currentInventory.filter(inv =>
            inv.firmId === purchase.firmId &&
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

    const applyPurchaseStock = (purchase: Purchase) => {
        if (purchase.status !== 'Received') return;

        purchase.items.forEach(item => {
            const stockOptions = { referenceId: purchase.id, reason: `Purchase ${purchase.supplierInvoiceNumber || purchase.id}` };

            const serials = (item.serialNumbers ?? []).map(normalizeSerial).filter(Boolean);
            serials.forEach(sn => {
                addStock({
                    firmId: purchase.firmId,
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
    };

    const revertPurchaseStock = (purchase: Purchase): boolean => {
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

            setInventory(prev => {
                const updated = [...prev];
                for (const log of purchaseLogs) {
                    const idx = updated.findIndex(i => i.id === log.inventoryItemId);
                    if (idx >= 0) {
                        const newStock = updated[idx].stock - log.change;
                        addInventoryLog({
                            inventoryItemId: log.inventoryItemId,
                            productName: log.productName,
                            change: -log.change,
                            newQuantity: newStock,
                            reason: `Purchase reversal ${purchase.supplierInvoiceNumber || purchase.id}`,
                            referenceId: purchase.id,
                        });
                        if (newStock <= 0 && updated[idx].serialNumber) {
                            updated.splice(idx, 1);
                        } else {
                            updated[idx] = { ...updated[idx], stock: Math.max(0, newStock) };
                        }
                    }
                }
                return updated.filter(i => i.stock > 0 || !i.serialNumber);
            });
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

        setInventory(prev => {
            let updated = [...prev];
            purchase.items.forEach(item => {
                const batches = findBatchesForPurchaseItem(purchase, item, updated);
                let remaining = item.serialNumbers?.length || item.quantity;
                for (const batch of batches) {
                    if (remaining <= 0) break;
                    const idx = updated.findIndex(i => i.id === batch.id);
                    if (idx < 0) continue;
                    const reduction = Math.min(remaining, updated[idx].stock);
                    const newStock = updated[idx].stock - reduction;
                    addInventoryLog({
                        inventoryItemId: batch.id,
                        productName: getProductName(batch.productTypeId),
                        change: -reduction,
                        newQuantity: newStock,
                        reason: `Purchase reversal ${purchase.supplierInvoiceNumber || purchase.id}`,
                        referenceId: purchase.id,
                    });
                    if (newStock <= 0 && updated[idx].serialNumber) {
                        updated.splice(idx, 1);
                    } else {
                        updated[idx] = { ...updated[idx], stock: newStock };
                    }
                    remaining -= reduction;
                }
            });
            return updated.filter(i => i.stock > 0 || !i.serialNumber);
        });
        return true;
    };

    const purchaseItemsEqual = (a: PurchaseItem[], b: PurchaseItem[]) => JSON.stringify(a) === JSON.stringify(b);

    const isStockAffectingPurchaseChange = (original: Purchase, updated: Purchase) =>
        original.status !== updated.status ||
        original.firmId !== updated.firmId ||
        original.date !== updated.date ||
        !purchaseItemsEqual(original.items, updated.items);

    const addPurchase = (newPurchase: Omit<Purchase, 'id'>) => {
        const purchase: Purchase = { ...newPurchase, id: `PUR${Date.now()}` };
        setPurchases(prev => [purchase, ...prev]);

        if (purchase.status === 'Received') {
            applyPurchaseStock(purchase);
        }
        addToast('Purchase invoice recorded and stock added!', 'success');
    };

    const importPurchases = (drafts: Omit<Purchase, 'id'>[]) => {
        if (drafts.length === 0) return 0;
        const imported: Purchase[] = drafts.map((draft, idx) => ({
            ...draft,
            id: `PUR${Date.now()}-${idx}`,
        }));
        setPurchases(prev => [...imported, ...prev]);
        imported.filter(p => p.status === 'Received').forEach(applyPurchaseStock);
        addToast(`Imported ${imported.length} purchase bill${imported.length === 1 ? '' : 's'}.`, 'success');
        return imported.length;
    };

    const addPurchaseInvoiceUpload = (upload: Omit<PurchaseInvoiceUpload, 'id' | 'capturedAt'>) => {
        const entry: PurchaseInvoiceUpload = {
            ...upload,
            id: `PIU${Date.now()}`,
            capturedAt: new Date().toISOString(),
        };
        setPurchaseInvoiceQueue(prev => [entry, ...prev]);
        addToast('Invoice photo uploaded.', 'success');
        return entry.id;
    };

    const removePurchaseInvoiceUpload = (uploadId: string) => {
        setPurchaseInvoiceQueue(prev => prev.filter(item => item.id !== uploadId));
    };

    const updatePurchase = (updatedPurchase: Purchase) => {
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
    };

    const deletePurchase = (purchaseId: string, userRole: UserRole, skipConfirm = false): boolean => {
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
    };

    const addPaymentVoucher = (voucher: Omit<PaymentVoucher, 'id'>) => {
        const newVoucher: PaymentVoucher = { ...voucher, id: `VCH${Date.now()}` };
        setPaymentVouchers(prev => [newVoucher, ...prev]);
        addToast(voucher.type === 'Receipt' ? 'Payment received!' : 'Payment made!', 'success');
    };

    const deletePaymentVoucher = (id: string) => {
        setPaymentVouchers(prev => prev.filter(v => v.id !== id));
        addToast('Voucher deleted', 'warning');
    };

    const saveDailyClose = (close: Omit<DailyClose, 'id' | 'closedAt'>): DailyClose => {
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
    };

    const reopenDailyClose = (date: string, firmId?: string) => {
        setDailyCloses(prev => prev.filter(c => !(c.date === date && (c.firmId || 'all') === (firmId || 'all'))));
        addToast(`Reopened ${new Date(date).toLocaleDateString('en-IN')} for edits`, 'info');
    };

    const saveMonthlyClose = (close: Omit<MonthlyClose, 'id' | 'closedAt'>): MonthlyClose => {
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
    };

    const reopenMonthlyClose = (year: number, month: number) => {
        setMonthlyCloses(prev => prev.filter(c => !(c.year === year && c.month === month)));
        addToast(`Reopened ${month}/${year} for edits`, 'info');
    };

    const saveYearlyClose = (close: Omit<YearlyClose, 'id' | 'closedAt'>): YearlyClose => {
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
    };

    const reopenYearlyClose = (year: number) => {
        setYearlyCloses(prev => prev.filter(c => c.year !== year));
        addToast(`Reopened year ${year} for edits`, 'info');
    };

    return (
        <AppDataContext.Provider value={{
            isLoading,
            inventory, addStock, transferStock, updateStockQuantity, updateBatchDetails, deleteBatch, adjustStock, performStockTake,
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
        }}>
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