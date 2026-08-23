import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { BrandMark } from './BrandMark.tsx';
import { Page, InventoryItem, ProductType, WarrantyLog } from '../types.ts';
import { useAppData } from '../context/AppDataContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { BarcodeScanner } from './BarcodeScanner.tsx';
import { MobileInstallBanner } from './MobileInstallBanner.tsx';
import { lookupByBarcode, searchInventory, getProductName, InventoryLookupResult } from '../utils/inventoryLookup.ts';
import { lookupWarrantyBySerial, getWarrantyStatus } from '../utils/warrantyLookup.ts';
import { requestWarrantySearch } from '../utils/pageActions.ts';
import { getMobilePrefs, setMobilePrefs, MobilePrefs } from '../utils/mobilePrefs.ts';
import {
    getSaleQueue, addToSaleQueue, removeFromSaleQueue, clearSaleQueue, requestOpenSale,
    MobileSaleQueueItem,
} from '../utils/mobileSaleQueue.ts';
import { hapticError, hapticSuccess, playScanBeep, playScanErrorBeep } from '../utils/haptics.ts';
import { isSerialInInventory, isSerialTrackedItem, findSerialInventoryRecord } from '../utils/serialNumbers.ts';
import { sharedInventoryFirmId } from '../utils/sharedInventory.ts';
import { IconPlus, IconMinus, IconAlertTriangle, IconTrash, IconSales, IconSettings, IconUpload } from './icons.tsx';
import { ConfirmationModal } from './ConfirmationModal.tsx';

import { readMobileInvoiceImage } from '../utils/imageFile.ts';
import { requestOpenPurchase } from '../utils/mobilePurchaseQueue.ts';
import { MobileModelPickerSheet } from './mobile/MobileModelPickerSheet.tsx';
import { MobileConnectPanel } from './MobileConnectPanel.tsx';
import { SharedStockHint } from './SharedStockHint.tsx';
import { DEFAULT_SALE_CATEGORIES } from '../constants.ts';
import { extractGstFromFinalMulti } from '../utils/salePricing.ts';
import { getGstRateForHsn, splitTaxAmount } from '../indianGST.ts';

type MobileMode = 'scan' | 'sale' | 'add' | 'count' | 'inventory' | 'warranty' | 'purchase';

const SALE_MATCH_TYPES = new Set(['serial', 'inventory_id', 'batch']);
const COUNT_MATCH_TYPES = new Set(['serial', 'inventory_id', 'batch']);

interface ScanHistoryEntry {
    code: string;
    label: string;
    at: string;
}

interface MobileCompanionPageProps {
    onNavigate?: (page: Page) => void;
}

const SCAN_HISTORY_KEY = 'bsms_mobile_scan_history';
const MAX_HISTORY = 15;

function loadScanHistory(): ScanHistoryEntry[] {
    try {
        const raw = sessionStorage.getItem(SCAN_HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveScanHistory(entries: ScanHistoryEntry[]) {
    sessionStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
}

const ModeTab: React.FC<{ label: string; active: boolean; onClick: () => void; badge?: number }> = ({ label, active, onClick, badge }) => (
    <button
        onClick={onClick}
        className={`relative flex-shrink-0 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
            active ? 'btn-primary shadow-md' : 'bg-bg-tertiary text-text-muted'
        }`}
    >
        {label}
        {badge !== undefined && badge > 0 && (
            <span className="absolute -top-1 -right-1 bg-white text-brand-red text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {badge > 9 ? '9+' : badge}
            </span>
        )}
    </button>
);

const ResultCard: React.FC<{
    result: InventoryLookupResult;
    currencySymbol: string;
    onAdjust?: (item: InventoryItem, delta: number) => void;
    onUpdateMrp?: (item: InventoryItem, mrp: number) => void;
    onAssignBarcode?: (product: ProductType, barcode: string) => void;
    onAddToSale?: (item: InventoryItem) => void;
    scannedCode?: string;
    compact?: boolean;
}> = ({ result, currencySymbol, onAdjust, onUpdateMrp, onAssignBarcode, onAddToSale, scannedCode, compact }) => {
    const item = result.inventoryItem;
    const product = result.productType;
    const name = getProductName(product);
    const [mrpEdit, setMrpEdit] = useState(item?.mrp?.toString() ?? '');
    const [showBatches, setShowBatches] = useState(false);

    useEffect(() => {
        setMrpEdit(item?.mrp?.toString() ?? '');
    }, [item?.id, item?.mrp]);

    const matchLabel = {
        serial: 'Serial',
        batch: 'Batch',
        inventory_id: 'ID',
        product_barcode: 'Barcode',
        product_id: 'SKU',
    }[result.matchType];

    const margin = item && item.mrp > 0
        ? Math.round(((item.mrp - item.purchasePrice) / item.mrp) * 100)
        : null;

    return (
        <div className={`bg-bg-secondary rounded-xl border border-border-color shadow-sm ${compact ? 'p-3' : 'p-4 space-y-3'}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold tracking-wide text-brand-red">{matchLabel}</span>
                    <h3 className={`font-bold text-text-primary leading-tight ${compact ? 'text-sm' : 'text-lg'}`}>{name}</h3>
                    {product && !compact && (
                        <p className="text-xs text-text-muted mt-0.5">
                            {product.specifications.capacity} · {product.specifications.voltage}
                            {product.specifications.technology ? ` · ${product.specifications.technology}` : ''}
                        </p>
                    )}
                </div>
                <div className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${
                    result.totalStock <= 0 ? 'bg-status-red-bg text-status-red-text' :
                    result.totalStock <= (product?.lowStockThreshold ?? 5) ? 'bg-status-yellow-bg text-status-yellow-text' :
                    'bg-status-green-bg text-status-green-text'
                }`}>
                    {result.totalStock}
                </div>
            </div>

            {item && !compact && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className={`bg-bg-tertiary rounded-lg p-2 ${item.serialNumber ? 'col-span-2' : ''}`}>
                        <p className="text-[10px] text-text-muted uppercase">Serial</p>
                        <p className="font-mono font-medium text-text-primary truncate">
                            {item.serialNumber || <span className="text-text-muted italic">Not set</span>}
                        </p>
                    </div>
                    {item.batchNumber && (
                        <div className="bg-bg-tertiary rounded-lg p-2">
                            <p className="text-[10px] text-text-muted uppercase">Batch</p>
                            <p className="font-mono font-medium text-text-primary truncate">{item.batchNumber}</p>
                        </div>
                    )}
                    <div className="bg-bg-tertiary rounded-lg p-2">
                        <p className="text-[10px] text-text-muted uppercase">Cost</p>
                        <p className="font-medium">{currencySymbol}{item.purchasePrice.toLocaleString()}</p>
                    </div>
                    <div className="bg-bg-tertiary rounded-lg p-2">
                        <p className="text-[10px] text-text-muted uppercase">MRP</p>
                        <p className="font-bold text-brand-red">{currencySymbol}{item.mrp.toLocaleString()}</p>
                        {margin !== null && <p className="text-[10px] text-status-green-text">{margin}% margin</p>}
                    </div>
                </div>
            )}

            {compact && item?.serialNumber && (
                <p className="text-xs font-mono text-text-muted mt-1 truncate">SN: {item.serialNumber}</p>
            )}

            {!item && product && result.batches.length > 1 && (
                <button
                    onClick={() => setShowBatches(!showBatches)}
                    className="text-xs text-brand-red font-medium"
                >
                    {showBatches ? 'Hide' : 'Show'} {result.batches.length} batches
                </button>
            )}
            {showBatches && result.batches.map(b => (
                <div key={b.id} className="text-xs bg-bg-tertiary rounded p-2 flex justify-between">
                    <span className="font-mono truncate">{b.serialNumber || b.batchNumber || b.id}</span>
                    <span className="font-bold ml-2">{b.stock} · {currencySymbol}{b.mrp}</span>
                </div>
            ))}

            {item && onAdjust && !isSerialTrackedItem(item) && (
                <div className="flex items-center gap-3">
                    <span className="text-sm text-text-muted">Adjust:</span>
                    <button onClick={() => onAdjust(item, -1)} className="p-2 rounded-lg bg-bg-tertiary hover:bg-status-red-bg text-status-red-text">
                        <IconMinus className="h-5 w-5" />
                    </button>
                    <span className="font-bold text-lg w-8 text-center">{item.stock}</span>
                    <button onClick={() => onAdjust(item, 1)} className="p-2 rounded-lg bg-bg-tertiary hover:bg-status-green-bg text-status-green-text">
                        <IconPlus className="h-5 w-5" />
                    </button>
                </div>
            )}

            {item && onUpdateMrp && (
                <div className="flex gap-2 items-center">
                    <input type="number" value={mrpEdit} onChange={e => setMrpEdit(e.target.value)} className="form-input flex-1" placeholder="MRP" />
                    <button
                        onClick={() => { const v = parseFloat(mrpEdit); if (!isNaN(v) && v >= 0) onUpdateMrp(item, v); }}
                        className="btn-primary btn-sm"
                    >
                        Save
                    </button>
                </div>
            )}

            {item && onAddToSale && item.stock > 0 && (
                <button
                    onClick={() => onAddToSale(item)}
                    className="w-full btn-info py-2.5 text-sm"
                >
                    <IconSales className="h-4 w-4" /> Add to Sale
                </button>
            )}

            {product && onAssignBarcode && scannedCode && !product.barcode && (
                <button
                    onClick={() => onAssignBarcode(product, scannedCode)}
                    className="w-full btn-outline py-2 text-sm"
                >
                    Assign barcode "{scannedCode}"
                </button>
            )}
            {product?.barcode && (
                <p className="text-xs text-text-muted">Barcode: <span className="font-mono">{product.barcode}</span></p>
            )}
        </div>
    );
};

const WarrantyCard: React.FC<{ log: WarrantyLog; onViewWarranty?: () => void }> = ({ log, onViewWarranty }) => {
    const status = getWarrantyStatus(log);
    return (
        <div className="bg-bg-secondary rounded-xl border border-border-color p-4 space-y-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <span className="text-[10px] uppercase font-bold tracking-wide text-brand-red">Warranty</span>
                    <h3 className="text-lg font-bold text-text-primary">{log.productName}</h3>
                    <p className="text-xs font-mono text-text-muted mt-1">{log.serialNumber}</p>
                    {(log.saleCategory || log.vehicleNumber) && (
                        <p className="text-xs text-text-muted mt-1">
                            {[log.saleCategory, log.vehicleModel, log.vehicleNumber].filter(Boolean).join(' · ')}
                        </p>
                    )}
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${status.className}`}>{status.text}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-bg-tertiary rounded-lg p-2">
                    <p className="text-[10px] text-text-muted uppercase">Customer</p>
                    <p className="font-medium">{log.customerName}</p>
                    <p className="text-xs text-text-muted">{log.customerPhone}</p>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-2">
                    <p className="text-[10px] text-text-muted uppercase">Sale Date</p>
                    <p className="font-medium">{new Date(log.saleDate).toLocaleDateString()}</p>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-2">
                    <p className="text-[10px] text-text-muted uppercase">Guarantee Until</p>
                    <p className="font-medium">{new Date(log.guaranteeEndDate).toLocaleDateString()}</p>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-2">
                    <p className="text-[10px] text-text-muted uppercase">Warranty Until</p>
                    <p className="font-medium">{new Date(log.warrantyEndDate).toLocaleDateString()}</p>
                </div>
            </div>
            {status.daysRemaining !== null && status.phase !== 'expired' && (
                <p className="text-sm text-center font-semibold text-status-green-text">
                    {status.daysRemaining} days remaining in {status.phase}
                </p>
            )}
            {onViewWarranty && (
                <button onClick={onViewWarranty} className="w-full btn-secondary py-2 text-sm">
                    Open Warranty Page
                </button>
            )}
        </div>
    );
};

export const MobileCompanionPage: React.FC<MobileCompanionPageProps> = ({ onNavigate }) => {
    const { inventory, addStock, addTransaction, updateStockQuantity, updateBatchDetails, performStockTake, warrantyLogs, addPurchaseInvoiceUpload } = useAppData();
    const { productTypes, addProductType, updateProductType } = useMasterData();
    const { config } = useConfig();
    const { addToast } = useToast();

    const [mode, setMode] = useState<MobileMode>('scan');
    const [firmId, setFirmId] = useState(config.firms[0]?.id ?? '');
    const [manualCode, setManualCode] = useState('');
    const [lastCode, setLastCode] = useState('');
    const [lookupResult, setLookupResult] = useState<InventoryLookupResult | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showScanner, setShowScanner] = useState(true);
    const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>(loadScanHistory);
    const [saleQueue, setSaleQueue] = useState<MobileSaleQueueItem[]>(getSaleQueue);
    const [countMap, setCountMap] = useState<Record<string, number>>({});
    const [warrantyLog, setWarrantyLog] = useState<WarrantyLog | null>(null);
    const [prefs, setPrefs] = useState<MobilePrefs>(getMobilePrefs);
    const [showSettings, setShowSettings] = useState(false);
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [countConfirm, setCountConfirm] = useState<{ count: number; onConfirm: () => void } | null>(null);
    const [quickSaleConfirm, setQuickSaleConfirm] = useState<{ count: number; total: number } | null>(null);
    const [lastSaleScan, setLastSaleScan] = useState<{ serial: string; label: string } | null>(null);

    const [addProductId, setAddProductId] = useState('');
    const [addSerial, setAddSerial] = useState('');
    const [addBatch, setAddBatch] = useState('');
    const [addMrp, setAddMrp] = useState('');
    const [addCost, setAddCost] = useState('');
    const [addSessionCount, setAddSessionCount] = useState(0);
    const [addSessionSerials, setAddSessionSerials] = useState<{ serial: string; name: string }[]>([]);
    const [addModelLocked, setAddModelLocked] = useState(false);
    const [pendingAddSerial, setPendingAddSerial] = useState('');
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [purchaseSerials, setPurchaseSerials] = useState<string[]>([]);
    const [purchaseInvoiceNo, setPurchaseInvoiceNo] = useState('');
    const [purchaseNotes, setPurchaseNotes] = useState('');
    const [purchasePreview, setPurchasePreview] = useState<string | null>(null);
    const purchaseImageRef = useRef<HTMLInputElement>(null);
    const serialInputRef = useRef<HTMLInputElement>(null);
    const manualInputRef = useRef<HTMLInputElement>(null);

    const activeFirm = config.firms.find(f => f.id === firmId) ?? config.firms[0];
    const currencySymbol = activeFirm?.financials.currencySymbol ?? '₹';
    const productCategories = config.preferences.saleCategories?.length
        ? config.preferences.saleCategories
        : DEFAULT_SALE_CATEGORIES;
    const queuedInventoryIds = useMemo(() => new Set(saleQueue.map(q => q.inventoryItemId)), [saleQueue]);

    const searchResults = useMemo(
        () => searchInventory(searchQuery, inventory, productTypes),
        [searchQuery, inventory, productTypes]
    );

    const lowStockProducts = useMemo(() => {
        return productTypes
            .filter(pt => pt.lowStockThreshold && pt.lowStockThreshold > 0)
            .map(pt => {
                const stock = inventory.filter(i => i.productTypeId === pt.id).reduce((s, i) => s + i.stock, 0);
                return { product: pt, stock, threshold: pt.lowStockThreshold! };
            })
            .filter(x => x.stock <= x.threshold)
            .sort((a, b) => a.stock - b.stock);
    }, [productTypes, inventory]);

    const countRows = useMemo(() => {
        return Object.entries(countMap).map(([id, counted]) => {
            const item = inventory.find(i => i.id === id);
            const pt = item ? productTypes.find(p => p.id === item.productTypeId) : undefined;
            const countedQty = Number(counted);
            return {
                item: item!,
                name: getProductName(pt),
                system: item?.stock ?? 0,
                counted: countedQty,
                variance: countedQty - (item?.stock ?? 0),
            };
        }).filter(r => r.item);
    }, [countMap, inventory, productTypes]);

    // Auto-fill prices from most recent batch when product changes
    useEffect(() => {
        if (!addProductId) return;
        const batches = inventory
            .filter(i => i.productTypeId === addProductId)
            .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
        const last = batches[0];
        if (last) {
            setAddMrp(last.mrp.toString());
            setAddCost(last.purchasePrice.toString());
        }
    }, [addProductId, inventory]);

    useEffect(() => {
        const on = () => setIsOnline(true);
        const off = () => setIsOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);

    const updatePrefs = (partial: Partial<MobilePrefs>) => setPrefs(setMobilePrefs(partial));

    const pauseOnScan = !(prefs.continuousScan && (mode === 'sale' || mode === 'count' || mode === 'add' || mode === 'purchase'));

    const feedbackSuccess = useCallback(() => {
        hapticSuccess();
        if (prefs.scanSound) playScanBeep();
    }, [prefs.scanSound]);

    const focusScanInput = useCallback(() => {
        setTimeout(() => {
            if (mode === 'add' && !prefs.continuousScan) {
                serialInputRef.current?.focus();
            } else {
                manualInputRef.current?.focus();
            }
        }, 50);
    }, [mode, prefs.continuousScan]);

    const clearScanInput = useCallback(() => {
        setManualCode('');
    }, []);

    const describeSerialStockConflict = useCallback((serial: string, activeProductId?: string): string | null => {
        const existing = findSerialInventoryRecord(serial, inventory);
        if (!existing || existing.stock <= 0) return null;
        const modelName = getProductName(productTypes.find(p => p.id === existing.productTypeId));
        if (activeProductId && existing.productTypeId !== activeProductId) {
            return `Serial "${serial}" is already in stock as ${modelName}.`;
        }
        return `Serial "${serial}" is already in stock${modelName ? ` (${modelName})` : ''}.`;
    }, [inventory, productTypes]);

    const describeSoldSerial = useCallback((serial: string): string | null => {
        const wLog = lookupWarrantyBySerial(serial, warrantyLogs);
        if (!wLog) return null;
        const soldDate = new Date(wLog.saleDate).toLocaleDateString();
        return `Already sold to ${wLog.customerName} on ${soldDate}${wLog.productName ? ` (${wLog.productName})` : ''}.`;
    }, [warrantyLogs]);

    useEffect(() => {
        if ((mode === 'add' || mode === 'sale') && prefs.continuousScan) {
            focusScanInput();
        }
    }, [mode, prefs.continuousScan, focusScanInput]);

    const pushHistory = useCallback((code: string, label: string) => {
        const entry: ScanHistoryEntry = { code, label, at: new Date().toISOString() };
        setScanHistory(prev => {
            const next = [entry, ...prev.filter(e => e.code !== code)].slice(0, MAX_HISTORY);
            saveScanHistory(next);
            return next;
        });
    }, []);

    const queueSaleItem = useCallback((item: InventoryItem, code: string) => {
        const pt = productTypes.find(p => p.id === item.productTypeId);
        const label = getProductName(pt);
        const serialNumber = item.serialNumber || code;
        const existing = getSaleQueue();
        const next = addToSaleQueue({
            inventoryItemId: item.id,
            firmId: item.firmId,
            scannedCode: code,
            label,
            serialNumber: serialNumber || undefined,
        });
        if (next.length === existing.length) {
            hapticError();
            playScanErrorBeep();
            addToast('This battery is already in the sale queue.', 'warning');
            return;
        }
        setSaleQueue(next);
        feedbackSuccess();
        setLastSaleScan({ serial: serialNumber || code, label });
        addToast(`Added ${label}${serialNumber ? ` · ${serialNumber}` : ''}`, 'success');
        if (prefs.continuousScan && mode === 'sale') {
            clearScanInput();
            focusScanInput();
        }
    }, [productTypes, addToast, feedbackSuccess, prefs.continuousScan, mode, clearScanInput, focusScanInput]);

    const submitAddStock = useCallback((overrides?: { productId?: string; serial?: string; batch?: string; cost?: number; mrp?: number }) => {
        if (!isOnline) {
            addToast('You appear offline. Connect to save inventory changes.', 'error');
            return false;
        }
        const productId = overrides?.productId ?? addProductId;
        if (!productId) {
            addToast('Select a product', 'error');
            return false;
        }
        const serial = (overrides?.serial ?? addSerial).trim();
        const batch = (overrides?.batch ?? addBatch).trim();
        if (!serial) {
            addToast('Serial number is required for each battery.', 'error');
            return false;
        }
        const mrp = overrides?.mrp ?? parseFloat(addMrp);
        const cost = overrides?.cost ?? parseFloat(addCost);
        if (isNaN(mrp) || mrp < 0 || isNaN(cost) || cost < 0) {
            addToast('Enter valid cost and MRP first', 'error');
            return false;
        }
        const added = addStock({
            firmId: sharedInventoryFirmId(), productTypeId: productId, type: 'New',
            serialNumber: serial, batchNumber: batch || undefined,
            purchaseDate: new Date().toISOString().split('T')[0],
            purchasePrice: cost, mrp, stock: 1,
        }, { reason: 'Added via mobile companion' });
        if (!added) return false;
        const pt = productTypes.find(p => p.id === productId);
        const name = getProductName(pt);
        feedbackSuccess();
        addToast(`Added ${name} (${serial})`, 'success');
        setAddSessionCount(c => c + 1);
        setAddSessionSerials(prev => [{ serial, name }, ...prev].slice(0, 20));
        setAddSerial('');
        setAddBatch('');
        if (!prefs.continuousScan || mode !== 'add') {
            setLookupResult(null);
            setShowScanner(true);
        } else {
            clearScanInput();
            focusScanInput();
        }
        return true;
    }, [addProductId, addSerial, addBatch, addMrp, addCost, addStock, productTypes, addToast, prefs.continuousScan, mode, isOnline, feedbackSuccess, clearScanInput, focusScanInput]);

    const getPricesForProduct = useCallback((productId: string) => {
        const batches = inventory
            .filter(i => i.productTypeId === productId)
            .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
        const last = batches[0];
        if (last) {
            return { cost: last.purchasePrice, mrp: last.mrp, costStr: last.purchasePrice.toString(), mrpStr: last.mrp.toString() };
        }
        const cost = parseFloat(addCost);
        const mrp = parseFloat(addMrp);
        return {
            cost: isNaN(cost) ? NaN : cost,
            mrp: isNaN(mrp) ? NaN : mrp,
            costStr: addCost,
            mrpStr: addMrp,
        };
    }, [inventory, addCost, addMrp]);

    const tryProcessAddSerial = useCallback((serial: string, overrides?: { productId?: string; batch?: string }) => {
        const trimmed = serial.trim();
        if (!trimmed) return false;

        if (addSessionSerials.some(e => e.serial.toLowerCase() === trimmed.toLowerCase())) {
            hapticError();
            playScanErrorBeep();
            addToast(`Serial "${trimmed}" was already added this session.`, 'warning');
            if (prefs.continuousScan && mode === 'add') {
                clearScanInput();
                focusScanInput();
            }
            return false;
        }

        const stockConflict = describeSerialStockConflict(trimmed, overrides?.productId ?? addProductId);
        if (stockConflict) {
            hapticError();
            playScanErrorBeep();
            addToast(stockConflict, 'error');
            if (prefs.continuousScan && mode === 'add') {
                clearScanInput();
                focusScanInput();
            }
            return false;
        }

        const productId = overrides?.productId ?? addProductId;
        if (!productId) {
            setPendingAddSerial(trimmed);
            setShowModelPicker(true);
            addToast('Select which model this serial belongs to.', 'info');
            return false;
        }

        const prices = getPricesForProduct(productId);
        if (isNaN(prices.cost) || prices.cost < 0 || isNaN(prices.mrp) || prices.mrp < 0) {
            setPendingAddSerial(trimmed);
            setAddSerial(trimmed);
            addToast('Enter cost and MRP for this model first.', 'warning');
            return false;
        }

        if (prices.costStr !== addCost || prices.mrpStr !== addMrp) {
            setAddCost(prices.costStr);
            setAddMrp(prices.mrpStr);
        }

        return submitAddStock({
            productId,
            serial: trimmed,
            batch: overrides?.batch ?? addBatch,
            cost: prices.cost,
            mrp: prices.mrp,
        });
    }, [addSessionSerials, describeSerialStockConflict, addProductId, addBatch, addCost, addMrp, getPricesForProduct, submitAddStock, addToast, prefs.continuousScan, mode, clearScanInput, focusScanInput]);

    const assignModelForSerial = useCallback((productId: string, serial?: string) => {
        setAddProductId(productId);
        setAddModelLocked(true);
        setShowModelPicker(false);

        const prices = getPricesForProduct(productId);
        if (!isNaN(prices.cost) && !isNaN(prices.mrp)) {
            setAddCost(prices.costStr);
            setAddMrp(prices.mrpStr);
        }

        const targetSerial = (serial ?? pendingAddSerial).trim();
        setPendingAddSerial('');
        if (targetSerial) {
            setTimeout(() => tryProcessAddSerial(targetSerial, { productId }), 0);
        }
    }, [getPricesForProduct, pendingAddSerial, tryProcessAddSerial]);

    const handleCreateModel = useCallback((data: Omit<ProductType, 'id'>) => {
        const created = addProductType(data);
        assignModelForSerial(created.id);
    }, [addProductType, assignModelForSerial]);

    const computeQuickSaleTotals = useCallback((queue: MobileSaleQueueItem[]) => {
        let subtotal = 0;
        for (const q of queue) {
            const inv = inventory.find(i => i.id === q.inventoryItemId);
            if (inv && inv.stock > 0) subtotal += inv.mrp;
        }
        const taxRegime = activeFirm?.financials.taxRegime ?? 'Composition';
        const gstRate = activeFirm?.financials.gstRate ?? 0;
        const total = subtotal;
        // Per-item HSN rates so mixed-brand carts are taxed correctly.
        const buckets = queue.flatMap(q => {
            const inv = inventory.find(i => i.id === q.inventoryItemId);
            if (!inv || inv.stock <= 0) return [];
            const pt = productTypes.find(p => p.id === inv.productTypeId);
            return [{ rate: getGstRateForHsn(pt?.hsnCode) ?? gstRate, net: inv.mrp }];
        });
        const { taxAmount } = extractGstFromFinalMulti(total, gstRate, taxRegime, buckets);
        return { subtotal, total, taxAmount, taxRegime };
    }, [inventory, productTypes, activeFirm]);

    const executeQuickSale = useCallback(() => {
        const queue = getSaleQueue();
        if (queue.length === 0) {
            addToast('Scan items first', 'warning');
            return;
        }

        const items: Parameters<typeof addTransaction>[0]['items'] = [];
        const skipped: string[] = [];
        for (const q of queue) {
            const inv = inventory.find(i => i.id === q.inventoryItemId);
            if (!inv || inv.stock <= 0) {
                skipped.push(q.label);
                continue;
            }
            const pt = productTypes.find(p => p.id === inv.productTypeId);
            const serial = q.serialNumber ?? q.scannedCode ?? inv.serialNumber ?? '';
            items.push({
                id: inv.id,
                name: q.label,
                quantity: 1,
                price: inv.mrp,
                purchasePrice: inv.purchasePrice,
                serialNumbers: serial,
                discount: { type: 'fixed', value: 0 },
                hsnCode: pt?.hsnCode,
                gstRate: getGstRateForHsn(pt?.hsnCode),
                guaranteePeriodMonths: pt?.defaultGuaranteeMonths ?? 0,
                warrantyPeriodMonths: pt?.defaultWarrantyMonths ?? 0,
            });
        }

        if (skipped.length > 0) {
            hapticError();
            playScanErrorBeep();
            addToast(`${skipped.length} item(s) no longer in stock and were skipped.`, 'warning');
        }

        if (items.length === 0) {
            clearSaleQueue();
            setSaleQueue([]);
            setLastSaleScan(null);
            return;
        }

        const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const taxRegime = activeFirm?.financials.taxRegime ?? 'Composition';
        const gstRate = activeFirm?.financials.gstRate ?? 0;
        const total = subtotal;
        // Per-item HSN rates + reconciled component split (matches desktop POS).
        const buckets = items.map(item => ({
            rate: item.gstRate ?? gstRate,
            net: item.price * item.quantity,
        }));
        const { taxAmount } = extractGstFromFinalMulti(total, gstRate, taxRegime, buckets);
        const splits = splitTaxAmount(taxAmount, false);

        addTransaction({
            firmId,
            type: 'Sale',
            date: new Date().toISOString(),
            customerName: 'Walk-in',
            customerPhone: '',
            items,
            subtotal,
            discount: { type: 'percentage', value: 0 },
            taxRegime,
            taxAmount,
            total,
            totalCgst: splits.cgst,
            totalSgst: splits.sgst,
            totalIgst: 0,
            priceIncludesTax: true,
            payments: [{ method: 'Cash', amount: total }],
            status: 'Paid',
            notes: 'Mobile quick sale',
        });

        clearSaleQueue();
        setSaleQueue([]);
        setLastSaleScan(null);
        feedbackSuccess();
        addToast(`Sold ${items.length} battery(ies) for ${currencySymbol}${total.toLocaleString()}.`, 'success');
    }, [inventory, productTypes, firmId, activeFirm, addTransaction, addToast, currencySymbol, feedbackSuccess]);

    const handleQuickSale = useCallback(() => {
        if (!isOnline) {
            addToast('You appear offline. Connect to record the sale.', 'error');
            return;
        }
        const queue = getSaleQueue();
        if (queue.length === 0) {
            addToast('Scan items first', 'warning');
            return;
        }

        let inStockCount = 0;
        for (const q of queue) {
            const inv = inventory.find(i => i.id === q.inventoryItemId);
            if (inv && inv.stock > 0) inStockCount += 1;
        }
        if (inStockCount === 0) {
            addToast('No queued items are still in stock.', 'error');
            return;
        }

        const { total } = computeQuickSaleTotals(queue);
        setQuickSaleConfirm({ count: inStockCount, total });
    }, [inventory, addToast, isOnline, computeQuickSaleTotals]);

    const processCode = useCallback((code: string) => {
        const trimmed = code.trim();
        if (!trimmed) return;
        setLastCode(trimmed);
        setManualCode(trimmed);
        setWarrantyLog(null);

        if (mode === 'warranty') {
            const log = lookupWarrantyBySerial(trimmed, warrantyLogs);
            setWarrantyLog(log);
            if (log) {
                pushHistory(trimmed, log.productName);
            } else {
                hapticError();
                playScanErrorBeep();
                addToast('No warranty record for this serial.', 'warning');
            }
            setShowScanner(false);
            return;
        }

        if (mode === 'purchase') {
            if (isSerialInInventory(trimmed, inventory)) {
                hapticError();
                playScanErrorBeep();
                addToast(`Serial "${trimmed}" is already in stock.`, 'warning');
                return;
            }
            setPurchaseSerials(prev => {
                if (prev.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
                    hapticError();
                    playScanErrorBeep();
                    addToast('Serial already captured for this bill.', 'warning');
                    return prev;
                }
                addToast(`Captured serial #${prev.length + 1}`, 'success');
                return [...prev, trimmed];
            });
            pushHistory(trimmed, 'Purchase serial');
            if (!prefs.continuousScan) setShowScanner(false);
            return;
        }

        const result = lookupByBarcode(trimmed, inventory, productTypes);
        setLookupResult(result);

        if (result) {
            pushHistory(trimmed, getProductName(result.productType));

            if (mode === 'sale') {
                if (!SALE_MATCH_TYPES.has(result.matchType)) {
                    hapticError();
                    playScanErrorBeep();
                    addToast('Scan a battery serial to add to sale.', 'warning');
                    if (!prefs.continuousScan) setShowScanner(true);
                    return;
                }
                const item = result.inventoryItem ?? result.batches.find(b => b.stock > 0);
                const modelName = getProductName(result.productType);
                if (item && item.stock > 0 && !queuedInventoryIds.has(item.id)) {
                    queueSaleItem(item, trimmed);
                } else if (item && queuedInventoryIds.has(item.id)) {
                    hapticError();
                    playScanErrorBeep();
                    addToast(`Already in queue: ${modelName}${item.serialNumber ? ` (${item.serialNumber})` : ''}.`, 'warning');
                    if (prefs.continuousScan) {
                        clearScanInput();
                        focusScanInput();
                    }
                } else {
                    hapticError();
                    playScanErrorBeep();
                    const soldMsg = describeSoldSerial(trimmed);
                    addToast(soldMsg ?? `No stock for ${modelName}.`, soldMsg ? 'warning' : 'error');
                    if (prefs.continuousScan) {
                        clearScanInput();
                        focusScanInput();
                    }
                }
                if (!prefs.continuousScan) setShowScanner(true);
                return;
            }

            if (mode === 'count') {
                const item = result.inventoryItem;
                if (!item || !COUNT_MATCH_TYPES.has(result.matchType)) {
                    hapticError();
                    playScanErrorBeep();
                    addToast('Scan a battery serial to count.', 'warning');
                    return;
                }
                setCountMap(prev => ({
                    ...prev,
                    [item.id]: isSerialTrackedItem(item) ? 1 : (prev[item.id] ?? item.stock) + 1,
                }));
                addToast(`Counted: ${getProductName(result.productType)}${item.serialNumber ? ` (${item.serialNumber})` : ''}`, 'info');
                if (!prefs.continuousScan) setShowScanner(true);
                return;
            }

            if (mode === 'add') {
                if (result.matchType === 'serial' && result.inventoryItem && result.inventoryItem.stock > 0) {
                    hapticError();
                    playScanErrorBeep();
                    const conflict = describeSerialStockConflict(trimmed, addProductId);
                    addToast(conflict ?? `Serial "${trimmed}" is already in stock.`, 'error');
                    if (prefs.continuousScan) {
                        clearScanInput();
                        focusScanInput();
                    }
                    return;
                }

                if (result.matchType === 'product_barcode' || result.matchType === 'product_id') {
                    setAddProductId(result.productType!.id);
                    setAddModelLocked(true);
                    addToast(`Model set: ${getProductName(result.productType)}. Scan serials to add.`, 'info');
                    if (!prefs.continuousScan) setShowScanner(false);
                    return;
                }

                if (result.matchType === 'batch') {
                    hapticError();
                    playScanErrorBeep();
                    addToast('Scan each battery serial, not the batch number.', 'warning');
                    return;
                }

                if (addModelLocked && addProductId) {
                    tryProcessAddSerial(trimmed, { batch: result.inventoryItem?.batchNumber ?? addBatch });
                    return;
                }

                setPendingAddSerial(trimmed);
                setShowModelPicker(true);
                addToast('Which model is this battery?', 'info');
                return;
            }
        } else {
            hapticError();
            playScanErrorBeep();
            if (mode === 'add') {
                const conflict = describeSerialStockConflict(trimmed, addProductId);
                if (conflict) {
                    addToast(conflict, 'error');
                    if (prefs.continuousScan) {
                        clearScanInput();
                        focusScanInput();
                    }
                    return;
                }
                if (addModelLocked && addProductId) {
                    tryProcessAddSerial(trimmed);
                } else {
                    setPendingAddSerial(trimmed);
                    setShowModelPicker(true);
                    addToast('Which model is this battery?', 'info');
                }
            } else if (mode === 'sale') {
                const soldMsg = describeSoldSerial(trimmed);
                addToast(soldMsg ?? 'Serial not found in stock. Scan a battery serial on hand.', 'warning');
                if (prefs.continuousScan) {
                    clearScanInput();
                    focusScanInput();
                }
            } else {
                addToast('No match found.', 'warning');
            }
        }

        if (mode === 'scan') setShowScanner(false);
    }, [inventory, productTypes, firmId, mode, pushHistory, addToast, queueSaleItem, warrantyLogs, prefs.continuousScan, addProductId, addBatch, addModelLocked, tryProcessAddSerial, queuedInventoryIds, describeSerialStockConflict, describeSoldSerial, clearScanInput, focusScanInput]);

    const handleAdjust = (item: InventoryItem, delta: number) => {
        if (item.stock + delta < 0) { addToast('Cannot reduce below zero.', 'error'); return; }
        updateStockQuantity(item.id, delta);
        const newStock = item.stock + delta;
        setLookupResult(prev => {
            if (!prev) return prev;
            if (prev.inventoryItem?.id === item.id) {
                const updated = { ...prev.inventoryItem, stock: newStock };
                return { ...prev, inventoryItem: updated, batches: prev.batches.map(b => b.id === item.id ? updated : b), totalStock: newStock };
            }
            return {
                ...prev,
                batches: prev.batches.map(b => b.id === item.id ? { ...b, stock: newStock } : b),
                totalStock: prev.batches.reduce((s, b) => s + (b.id === item.id ? newStock : b.stock), 0),
            };
        });
    };

    const handleUpdateMrp = (item: InventoryItem, mrp: number) => {
        updateBatchDetails(item.id, { mrp });
    };

    const handleAssignBarcode = (product: ProductType, barcode: string) => {
        updateProductType({ ...product, barcode });
        addToast(`Barcode assigned`, 'success');
    };

    const handleAddStock = (e: React.FormEvent) => {
        e.preventDefault();
        if (addSerial.trim()) {
            tryProcessAddSerial(addSerial);
        } else {
            submitAddStock();
        }
    };

    const handleCheckout = () => {
        if (saleQueue.length === 0) { addToast('Scan items first', 'warning'); return; }
        requestOpenSale();
        addToast('Opening sale form with scanned items', 'info');
        onNavigate?.('Sales');
    };

    const handleApplyCount = () => {
        const adjustments = countRows.filter(r => r.variance !== 0).map(r => ({ inventoryItemId: r.item.id, countedQty: r.counted }));
        if (adjustments.length === 0) { addToast('No variances to apply', 'info'); return; }
        setCountConfirm({
            count: adjustments.length,
            onConfirm: () => {
                performStockTake(adjustments);
                setCountMap({});
                addToast('Stock take applied', 'success');
            },
        });
    };

    const switchMode = (m: MobileMode) => {
        setMode(m);
        setShowScanner(m !== 'inventory');
        setLookupResult(null);
        setWarrantyLog(null);
        if (m !== 'add') {
            setAddSessionCount(0);
            setAddSessionSerials([]);
            setAddModelLocked(false);
            setPendingAddSerial('');
            setShowModelPicker(false);
        }
        if (m !== 'sale') {
            setLastSaleScan(null);
        }
        if (m !== 'purchase') {
            setPurchasePreview(null);
            setPurchaseSerials([]);
        }
    };

    const handlePurchaseImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setPurchasePreview(await readMobileInvoiceImage(file));
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to read image.', 'error');
        }
        e.target.value = '';
    };

    const handleSubmitPurchasePhoto = (goToPurchases = false) => {
        if (!purchasePreview) {
            addToast('Capture or choose an invoice photo first.', 'warning');
            return;
        }
        const uploadId = addPurchaseInvoiceUpload({
            firmId,
            image: purchasePreview,
            supplierInvoiceNumber: purchaseInvoiceNo.trim() || undefined,
            notes: purchaseNotes.trim() || undefined,
            scannedSerials: purchaseSerials.length > 0 ? purchaseSerials : undefined,
        });
        setPurchasePreview(null);
        setPurchaseInvoiceNo('');
        setPurchaseNotes('');
        setPurchaseSerials([]);
        if (goToPurchases) {
            requestOpenPurchase(uploadId);
            onNavigate?.('Purchases');
        }
    };

    return (
        <div className="min-h-full bg-bg-primary md:hidden">
            <header className="sticky top-0 z-20 bg-glass-bg backdrop-blur-md border-b border-glass-border px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <BrandMark className="h-6 w-6" />
                            <h1 className="text-lg font-bold text-text-primary">Mobile Companion</h1>
                            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} title={isOnline ? 'Online' : 'Offline'} />
                        </div>
                        <p className="text-xs text-text-muted">Bill as: {activeFirm?.shopDetails.name}</p>
                        {config.firms.length > 1 && <SharedStockHint />}
                    </div>
                    <div className="flex items-center gap-2">
                        {config.firms.length > 1 && (
                            <select value={firmId} onChange={e => setFirmId(e.target.value)} className="form-input w-auto text-sm py-1.5" aria-label="Billing firm">
                                {config.firms.map(f => <option key={f.id} value={f.id}>{f.shopDetails.name}</option>)}
                            </select>
                        )}
                        <button onClick={() => setShowSettings(s => !s)} className="p-2 rounded-lg bg-bg-tertiary" aria-label="Settings">
                            <IconSettings className="h-5 w-5" />
                        </button>
                    </div>
                </div>
                {showSettings && (
                    <div className="mb-3 p-3 bg-bg-secondary rounded-lg border border-border-color space-y-2 text-sm">
                        <label className="flex items-center justify-between">
                            <span>Continuous scan (Sale/Count/Add/Bill)</span>
                            <input type="checkbox" checked={prefs.continuousScan} onChange={e => updatePrefs({ continuousScan: e.target.checked })} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Scan beep sound</span>
                            <input type="checkbox" checked={prefs.scanSound} onChange={e => updatePrefs({ scanSound: e.target.checked })} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Fullscreen scanner</span>
                            <input type="checkbox" checked={prefs.fullscreenScanner} onChange={e => updatePrefs({ fullscreenScanner: e.target.checked })} />
                        </label>
                    </div>
                )}
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                    <ModeTab label="Scan" active={mode === 'scan'} onClick={() => switchMode('scan')} />
                    <ModeTab label="Sale" active={mode === 'sale'} onClick={() => switchMode('sale')} badge={saleQueue.length} />
                    <ModeTab label="Bill" active={mode === 'purchase'} onClick={() => switchMode('purchase')} />
                    <ModeTab label="Warranty" active={mode === 'warranty'} onClick={() => switchMode('warranty')} />
                    <ModeTab label="Add" active={mode === 'add'} onClick={() => switchMode('add')} badge={addSessionCount || undefined} />
                    <ModeTab label="Count" active={mode === 'count'} onClick={() => switchMode('count')} badge={countRows.length} />
                    <ModeTab label="Stock" active={mode === 'inventory'} onClick={() => switchMode('inventory')} badge={lowStockProducts.length || undefined} />
                </div>
            </header>

            <div className="p-4 space-y-4 pb-28">
                <MobileInstallBanner />
                {/* Sale queue */}
                {mode === 'sale' && saleQueue.length > 0 && (
                    <div className="bg-bg-secondary rounded-xl border border-border-color p-3 space-y-2">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-sm">Sale Queue ({saleQueue.length})</h3>
                            <button onClick={() => { clearSaleQueue(); setSaleQueue([]); setLastSaleScan(null); }} className="text-xs text-text-muted">Clear</button>
                        </div>
                        {lastSaleScan && (
                            <p className="text-xs text-status-green-text bg-status-green-bg/40 rounded-lg px-3 py-2 truncate">
                                Last scan: {lastSaleScan.label} · <span className="font-mono">{lastSaleScan.serial}</span>
                            </p>
                        )}
                        {saleQueue.map(q => (
                            <div key={q.inventoryItemId} className="flex justify-between items-center text-sm bg-bg-tertiary rounded-lg px-3 py-2 gap-2">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium">{q.label}</p>
                                    {q.serialNumber && (
                                        <p className="text-xs font-mono text-text-muted truncate">{q.serialNumber}</p>
                                    )}
                                </div>
                                <button onClick={() => setSaleQueue(removeFromSaleQueue(q.inventoryItemId))} className="p-1 text-status-red-text flex-shrink-0" aria-label={`Remove ${q.label} from queue`}>
                                    <IconTrash className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                        <button onClick={handleQuickSale} className="w-full btn-primary py-3">
                            <IconSales className="h-5 w-5" /> Quick Sale — {currencySymbol}{computeQuickSaleTotals(saleQueue).total.toLocaleString()} ({saleQueue.length})
                        </button>
                        <button onClick={handleCheckout} className="w-full btn-secondary py-2.5 text-sm">
                            Full sale (customer & payment details)
                        </button>
                    </div>
                )}

                {mode !== 'inventory' && showScanner && (
                    <BarcodeScanner
                        onScan={processCode}
                        pauseOnScan={pauseOnScan}
                        scanSound={prefs.scanSound}
                        fullscreen={prefs.fullscreenScanner}
                        active={showScanner}
                        className="shadow-lg"
                    />
                )}

                {mode !== 'inventory' && (
                    <div className="flex gap-2">
                        <input
                            ref={manualInputRef}
                            type="text" value={manualCode}
                            onChange={e => setManualCode(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') processCode(manualCode); }}
                            placeholder={
                                mode === 'sale' ? 'Scan battery serial...' :
                                mode === 'add' ? 'Scan serial to add...' :
                                mode === 'count' ? 'Scan serial to count...' :
                                mode === 'purchase' ? 'Scan serial on invoice...' :
                                mode === 'warranty' ? 'Enter serial number...' :
                                'Serial / barcode...'
                            }
                            className="form-input flex-1 font-mono" autoComplete="off"
                        />
                        <button onClick={() => processCode(manualCode)} className="btn-primary">Go</button>
                        {!showScanner && (
                            <button onClick={() => setShowScanner(true)} className="btn-secondary px-3" aria-label="Open camera scanner">📷</button>
                        )}
                    </div>
                )}

                {lookupResult && mode === 'scan' && (
                    <>
                        <ResultCard
                            result={lookupResult} currencySymbol={currencySymbol}
                            onAdjust={handleAdjust} onUpdateMrp={handleUpdateMrp}
                            onAssignBarcode={handleAssignBarcode} onAddToSale={(item) => queueSaleItem(item, lastCode)}
                            scannedCode={lastCode}
                        />
                        {lookupResult.inventoryItem?.serialNumber && (() => {
                            const wLog = lookupWarrantyBySerial(lookupResult.inventoryItem!.serialNumber, warrantyLogs);
                            return wLog ? <WarrantyCard log={wLog} onViewWarranty={() => { requestWarrantySearch(wLog.serialNumber); onNavigate?.('Warranty'); }} /> : null;
                        })()}
                    </>
                )}

                {warrantyLog && mode === 'warranty' && (
                    <WarrantyCard log={warrantyLog} onViewWarranty={() => { requestWarrantySearch(warrantyLog.serialNumber); onNavigate?.('Warranty'); }} />
                )}

                {mode === 'purchase' && (
                    <div className="bg-bg-secondary rounded-xl border border-border-color p-4 space-y-4">
                        <div>
                            <h3 className="font-bold text-text-primary">Vendor Invoice Photo</h3>
                            <p className="text-sm text-text-muted mt-1">
                                Capture the bill and scan battery serials from the delivery. Serials sync to Purchase Management on desktop.
                            </p>
                        </div>
                        {purchaseSerials.length > 0 && (
                            <div className="bg-bg-tertiary rounded-lg p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold">Scanned Serials ({purchaseSerials.length})</h4>
                                    <button type="button" onClick={() => setPurchaseSerials([])} className="text-xs text-text-muted">Clear</button>
                                </div>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                    {purchaseSerials.map((serial, idx) => (
                                        <div key={`${serial}-${idx}`} className="flex items-center justify-between text-sm bg-bg-secondary rounded px-2 py-1.5">
                                            <span className="font-mono truncate">{serial}</span>
                                            <button
                                                type="button"
                                                onClick={() => setPurchaseSerials(prev => prev.filter((_, i) => i !== idx))}
                                                className="text-status-red-text p-1"
                                                aria-label={`Remove serial ${serial}`}
                                            >
                                                <IconTrash className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <input
                            ref={purchaseImageRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handlePurchaseImageSelect}
                        />
                        {purchasePreview ? (
                            <img src={purchasePreview} alt="Invoice preview" className="w-full max-h-64 object-contain rounded-lg border border-border-color bg-bg-tertiary" />
                        ) : (
                            <button
                                type="button"
                                onClick={() => purchaseImageRef.current?.click()}
                                className="w-full border-2 border-dashed border-border-color rounded-xl py-10 text-text-muted"
                            >
                                <IconUpload className="h-8 w-8 mx-auto mb-2" />
                                Tap to capture invoice
                            </button>
                        )}
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-text-muted mb-1">Invoice No. (optional)</label>
                                <input
                                    type="text"
                                    value={purchaseInvoiceNo}
                                    onChange={e => setPurchaseInvoiceNo(e.target.value)}
                                    className="form-input"
                                    placeholder="Supplier invoice number"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-text-muted mb-1">Notes (optional)</label>
                                <textarea
                                    value={purchaseNotes}
                                    onChange={e => setPurchaseNotes(e.target.value)}
                                    className="form-input min-h-[72px]"
                                    placeholder="Supplier name, delivery details..."
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            {purchasePreview && (
                                <button type="button" onClick={() => setPurchasePreview(null)} className="btn-secondary w-full">Retake</button>
                            )}
                            <button type="button" onClick={() => handleSubmitPurchasePhoto(false)} className="btn-primary w-full">
                                Upload to Purchases
                            </button>
                            <button type="button" onClick={() => handleSubmitPurchasePhoto(true)} className="btn-secondary w-full">
                                Upload & Open Purchases
                            </button>
                        </div>
                    </div>
                )}

                {mode === 'add' && (
                    <form onSubmit={handleAddStock} className="bg-bg-secondary rounded-xl border border-border-color p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="font-bold">Add Batteries</h3>
                            {addSessionCount > 0 && (
                                <span className="text-xs font-semibold text-status-green-text">{addSessionCount} added</span>
                            )}
                        </div>
                        {addModelLocked && addProductId ? (
                            <div className="flex items-center justify-between gap-2 bg-status-green-bg/40 border border-status-green-text/20 rounded-lg px-3 py-2.5">
                                <div className="min-w-0">
                                    <p className="text-[10px] uppercase font-bold text-status-green-text">Active model</p>
                                    <p className="text-sm font-semibold truncate">{getProductName(productTypes.find(p => p.id === addProductId))}</p>
                                    {addMrp && !isNaN(parseFloat(addMrp)) && (
                                        <p className="text-xs text-text-muted mt-0.5">MRP {currencySymbol}{parseFloat(addMrp).toLocaleString()} · Cost {currencySymbol}{(parseFloat(addCost || '0') || 0).toLocaleString()}</p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setAddModelLocked(false); setAddProductId(''); }}
                                    className="text-xs text-brand-red font-medium flex-shrink-0"
                                >
                                    Change
                                </button>
                            </div>
                        ) : (
                            <p className="text-xs text-text-muted">Scan a serial — you will pick the model, then keep scanning more of the same type.</p>
                        )}
                        {prefs.continuousScan && addModelLocked && (
                            <p className="text-xs text-text-muted">Continuous scan on — each serial is added automatically.</p>
                        )}
                        {addSessionSerials.length > 0 && (
                            <div className="bg-bg-tertiary rounded-lg p-2 space-y-1 max-h-28 overflow-y-auto">
                                <p className="text-[10px] uppercase font-bold text-text-muted">Added this session</p>
                                {addSessionSerials.map((entry, idx) => (
                                    <p key={`${entry.serial}-${idx}`} className="text-xs font-mono truncate">
                                        {entry.serial} · {entry.name}
                                    </p>
                                ))}
                            </div>
                        )}
                        {!addModelLocked && (
                            <select value={addProductId} onChange={e => { setAddProductId(e.target.value); if (e.target.value) setAddModelLocked(true); }} className="form-input">
                                <option value="">Or pick model manually...</option>
                                {productTypes.map(pt => <option key={pt.id} value={pt.id}>{getProductName(pt)}</option>)}
                            </select>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <input ref={serialInputRef} value={addSerial} onChange={e => setAddSerial(e.target.value)} className="form-input font-mono" placeholder="Serial *" />
                            <input value={addBatch} onChange={e => setAddBatch(e.target.value)} className="form-input" placeholder="Batch (optional)" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <input type="number" value={addCost} onChange={e => setAddCost(e.target.value)} className="form-input" placeholder="Cost" required />
                            <input type="number" value={addMrp} onChange={e => setAddMrp(e.target.value)} className="form-input" placeholder="MRP" required />
                        </div>
                        <button type="submit" className="w-full btn-primary py-3">Add Battery</button>
                    </form>
                )}

                {mode === 'count' && (
                    <div className="space-y-3">
                        <p className="text-sm text-text-muted">Scan each battery serial to confirm it is physically present.</p>
                        {countRows.length > 0 && (
                            <div className="bg-bg-secondary rounded-xl border border-border-color overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-bg-tertiary text-text-muted text-xs">
                                        <tr>
                                            <th className="p-2 text-left">Serial</th>
                                            <th className="p-2 text-center">Sys</th>
                                            <th className="p-2 text-center">Cnt</th>
                                            <th className="p-2 text-center">Var</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {countRows.map(r => (
                                            <tr key={r.item.id} className="border-t border-border-color">
                                                <td className="p-2 max-w-[140px]">
                                                    <p className="font-mono text-xs truncate">{r.item.serialNumber || r.name}</p>
                                                </td>
                                                <td className="p-2 text-center">{r.system}</td>
                                                <td className="p-2 text-center font-bold">{r.counted}</td>
                                                <td className={`p-2 text-center font-bold ${r.variance !== 0 ? 'text-orange-600' : ''}`}>
                                                    {r.variance > 0 ? '+' : ''}{r.variance || '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="p-3 flex gap-2">
                                    <button onClick={() => setCountMap({})} className="flex-1 btn-secondary py-2 text-sm">Reset</button>
                                    <button onClick={handleApplyCount} className="flex-1 btn-primary py-2 text-sm">Apply</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {mode === 'inventory' && (
                    <>
                        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search..." className="form-input" />
                        {lowStockProducts.length > 0 && !searchQuery && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-bold flex items-center gap-2">
                                    <IconAlertTriangle className="h-4 w-4 text-status-yellow-text" /> Low Stock
                                </h3>
                                {lowStockProducts.map(({ product, stock, threshold }) => (
                                    <button key={product.id} onClick={() => {
                                        setSearchQuery(getProductName(product));
                                        setLookupResult(lookupByBarcode(product.id, inventory, productTypes));
                                    }} className="w-full text-left bg-status-yellow-bg/50 border border-status-yellow-text/20 rounded-lg p-3 flex justify-between">
                                        <span className="font-medium text-sm">{getProductName(product)}</span>
                                        <span className="text-sm font-bold text-status-yellow-text">{stock}/{threshold}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="space-y-2">
                            {(searchQuery ? searchResults : []).map((r, i) => (
                                <button key={i} onClick={() => setLookupResult(r)} className="w-full text-left">
                                    <ResultCard result={r} currencySymbol={currencySymbol} compact />
                                </button>
                            ))}
                        </div>
                        {lookupResult && (
                            <ResultCard result={lookupResult} currencySymbol={currencySymbol}
                                onAdjust={handleAdjust} onUpdateMrp={handleUpdateMrp}
                                onAssignBarcode={handleAssignBarcode} scannedCode={lastCode} />
                        )}
                    </>
                )}

                {scanHistory.length > 0 && mode !== 'inventory' && mode !== 'count' && (
                    <div>
                        <h3 className="text-xs font-bold text-text-muted uppercase mb-2">Recent</h3>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {scanHistory.map(e => (
                                <button key={e.code} onClick={() => processCode(e.code)}
                                    className="flex-shrink-0 px-3 py-2 bg-bg-secondary border border-border-color rounded-lg min-w-[100px]">
                                    <p className="text-xs font-mono truncate">{e.code}</p>
                                    <p className="text-[10px] text-text-muted truncate">{e.label}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {countConfirm && (
                <ConfirmationModal
                    title="Apply Adjustments"
                    message={`Apply ${countConfirm.count} stock adjustment(s)?`}
                    confirmText="Apply"
                    variant="default"
                    onConfirm={() => { countConfirm.onConfirm(); setCountConfirm(null); }}
                    onCancel={() => setCountConfirm(null)}
                />
            )}

            {quickSaleConfirm && (
                <ConfirmationModal
                    title="Confirm Quick Sale"
                    message={`Sell ${quickSaleConfirm.count} battery(ies) to Walk-in for ${currencySymbol}${quickSaleConfirm.total.toLocaleString()} (cash)? Inventory will be deducted.`}
                    confirmText="Complete Sale"
                    cancelText="Cancel"
                    variant="default"
                    onConfirm={() => { setQuickSaleConfirm(null); executeQuickSale(); }}
                    onCancel={() => setQuickSaleConfirm(null)}
                />
            )}

            {showModelPicker && pendingAddSerial && (
                <MobileModelPickerSheet
                    serial={pendingAddSerial}
                    productTypes={productTypes}
                    categories={productCategories}
                    onSelect={assignModelForSerial}
                    onCreateModel={handleCreateModel}
                    onClose={() => {
                        if (pendingAddSerial) setAddSerial(pendingAddSerial);
                        setShowModelPicker(false);
                        setPendingAddSerial('');
                    }}
                />
            )}
        </div>
    );
};

export const MobileCompanionDesktopHint: React.FC = () => (
        <div className="hidden md:flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="max-w-xl w-full space-y-5">
                <div className="text-6xl">📱</div>
                <h2 className="text-2xl font-bold text-text-primary">Mobile Companion</h2>
                <p className="text-text-muted">
                    Scan with your phone for camera scanning, sales checkout, stock counts, inventory lookup, and vendor invoice photos.
                </p>
                <MobileConnectPanel />
            </div>
        </div>
    );
