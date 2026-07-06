
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { Purchase, PurchaseItem, ProductType, PaymentMethod, PurchaseInvoiceUpload } from '../types.ts';
import { IconPlus, IconShoppingBag, IconTrash, IconChevronDown, IconUpload, IconDownload } from './icons.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { ConfirmationModal } from './ConfirmationModal.tsx';
import { EmptyState } from './EmptyState.tsx';
import { PageHeader } from './PageHeader.tsx';
import { SearchInput } from './SearchInput.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { PurchaseImportModal } from './PurchaseImportModal.tsx';
import { readImageAsDataUrl } from '../utils/imageFile.ts';
import { consumeOpenPurchaseRequest } from '../utils/mobilePurchaseQueue.ts';
import { downloadTextFile, exportPurchasesCsv, exportPurchasesJson } from '../utils/purchaseExport.ts';
import { extractPurchaseFromImage, PurchaseOcrPrefill, rematchExtractionPrefill } from '../utils/purchaseOcr.ts';
import { CONFIDENCE_LABELS, CONFIDENCE_STYLES, productDraftFromExtractionRow } from '../utils/purchaseOcrHelpers.ts';
import { LoadingSpinner } from './LoadingSpinner.tsx';
import { serialsForQuantity, validateBatterySerials, fillSerialsFromPool } from '../utils/serialNumbers.ts';

const PurchaseFormModal: React.FC<{
    onClose: () => void;
    onSave: (purchase: Omit<Purchase, 'id'>) => void;
    onUpdate?: (purchase: Purchase) => void;
    existingPurchase?: Purchase | null;
    initialInvoiceImage?: string;
    linkedUploadId?: string;
    onConsumeUpload?: (uploadId: string) => void;
    initialDraft?: {
        firmId?: string;
        supplierInvoiceNumber?: string;
        notes?: string;
        scannedSerials?: string[];
    };
    ocrPrefill?: PurchaseOcrPrefill | null;
    aiEnabled?: boolean;
}> = ({ onClose, onSave, onUpdate, existingPurchase, initialInvoiceImage, linkedUploadId, onConsumeUpload, initialDraft, ocrPrefill, aiEnabled }) => {
    const { suppliers, productTypes, addSupplier, addProductType } = useMasterData();
    const { inventory } = useAppData();
    const { config } = useConfig();
    const { addToast } = useToast();
    const isEdit = !!existingPurchase;
    
    const [formData, setFormData] = useState({
        firmId: existingPurchase?.firmId || initialDraft?.firmId || config.preferences.defaultFirmId || '',
        supplierId: existingPurchase?.supplierId || '',
        supplierInvoiceNumber: existingPurchase?.supplierInvoiceNumber || initialDraft?.supplierInvoiceNumber || '',
        date: existingPurchase?.date?.split('T')[0] || new Date().toISOString().split('T')[0],
        status: (existingPurchase?.status || 'Received') as 'Received' | 'Ordered',
        paymentStatus: (existingPurchase?.paymentStatus || 'Due') as 'Paid' | 'Due' | 'Partial',
        paidAmount: existingPurchase?.paidAmount || 0,
        paymentMethod: (existingPurchase?.paymentMethod || 'Bank Transfer') as PaymentMethod,
        paymentDueDate: existingPurchase?.paymentDueDate?.split('T')[0] || '',
        notes: existingPurchase?.notes || initialDraft?.notes || ''
    });

    // Search state for Supplier
    const [supplierSearch, setSupplierSearch] = useState(() => {
        if (existingPurchase) {
            return suppliers.find(s => s.id === existingPurchase.supplierId)?.name || '';
        }
        return '';
    });
    const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

    // Search state for Product
    const [productSearch, setProductSearch] = useState('');
    const [showProductDropdown, setShowProductDropdown] = useState(false);

    const [items, setItems] = useState<PurchaseItem[]>(existingPurchase?.items || []);
    const [invoiceImage, setInvoiceImage] = useState<string | undefined>(
        existingPurchase?.invoiceImage || initialInvoiceImage
    );
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [newItem, setNewItem] = useState<Partial<PurchaseItem>>({
        quantity: 1,
        taxRate: 18,
        type: 'New'
    });
    const [newItemSerials, setNewItemSerials] = useState<string[]>(['']);
    const [mobileSerialPool, setMobileSerialPool] = useState<string[]>(() => {
        const fromDraft = initialDraft?.scannedSerials ?? [];
        const used = new Set(
            (existingPurchase?.items ?? [])
                .flatMap(i => i.serialNumbers ?? [])
                .map(s => s.trim().toLowerCase())
                .filter(Boolean)
        );
        return fromDraft.filter(s => !used.has(s.trim().toLowerCase()));
    });
    const [isExtracting, setIsExtracting] = useState(false);
    const [hasExtracted, setHasExtracted] = useState(!!ocrPrefill);
    const [ocrConfidence, setOcrConfidence] = useState<PurchaseOcrPrefill['confidence'] | null>(ocrPrefill?.confidence ?? null);
    const [ocrWarnings, setOcrWarnings] = useState<string[]>(ocrPrefill?.warnings ?? []);
    const [itemWarnings, setItemWarnings] = useState<Record<number, string>>(ocrPrefill?.itemWarnings ?? {});
    const [lastExtraction, setLastExtraction] = useState(ocrPrefill?.extraction ?? null);
    const [unmatchedSupplier, setUnmatchedSupplier] = useState(ocrPrefill?.unmatchedSupplier);
    const [unmatchedItems, setUnmatchedItems] = useState(ocrPrefill?.unmatchedItems ?? []);
    const [creatingProductIndex, setCreatingProductIndex] = useState<number | null>(null);
    const [creatingSupplier, setCreatingSupplier] = useState(false);

    const applyOcrPrefill = (prefill: PurchaseOcrPrefill) => {
        setFormData(prev => ({
            ...prev,
            supplierId: prefill.supplierId || prev.supplierId,
            supplierInvoiceNumber: prefill.supplierInvoiceNumber || prev.supplierInvoiceNumber,
            date: prefill.date?.split('T')[0] || prev.date,
        }));
        if (prefill.supplierId) {
            const supplier = suppliers.find(s => s.id === prefill.supplierId);
            if (supplier) setSupplierSearch(supplier.name);
        }
        if (prefill.items.length > 0) setItems(prefill.items);
        setOcrWarnings(prefill.warnings);
        setItemWarnings(prefill.itemWarnings);
        setOcrConfidence(prefill.confidence);
        setLastExtraction(prefill.extraction);
        setUnmatchedSupplier(prefill.unmatchedSupplier);
        setUnmatchedItems(prefill.unmatchedItems);
        setHasExtracted(true);
    };

    useEffect(() => {
        if (ocrPrefill) applyOcrPrefill(ocrPrefill);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleExtractFromInvoice = async () => {
        if (!invoiceImage || !config.preferences.aiSettings?.enabled) {
            addToast('Enable AI in Settings before extracting invoices.', 'warning');
            return;
        }
        setIsExtracting(true);
        try {
            const prefill = await extractPurchaseFromImage(
                invoiceImage,
                config.preferences.aiSettings,
                { suppliers, productTypes },
            );
            applyOcrPrefill(prefill);
            if (prefill.warnings.length > 0) {
                addToast(`Extracted with ${prefill.warnings.length} warning(s). Review before saving.`, 'warning');
            } else {
                addToast('Invoice extracted successfully.', 'success');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invoice extraction failed.';
            addToast(message.includes('disabled') ? 'AI assistant is disabled in Settings.' : message, 'error');
        } finally {
            setIsExtracting(false);
        }
    };

    const handleCreateSupplierFromOcr = () => {
        if (!unmatchedSupplier || creatingSupplier) return;
        setCreatingSupplier(true);
        try {
            const created = addSupplier({
                name: unmatchedSupplier.name,
                contactPerson: '—',
                phone: '—',
                gstin: unmatchedSupplier.gstin,
            });
            const updatedSuppliers = [...suppliers, created];
            const prefill = rematchExtractionPrefill(lastExtraction!, {
                suppliers: updatedSuppliers,
                productTypes,
            });
            applyOcrPrefill(prefill);
            addToast(`Created supplier "${created.name}" and re-matched.`, 'success');
        } finally {
            setCreatingSupplier(false);
        }
    };

    const handleCreateProductFromOcr = (item: typeof unmatchedItems[0]) => {
        if (creatingProductIndex !== null) return;
        setCreatingProductIndex(item.index);
        try {
            const created = addProductType(productDraftFromExtractionRow(item.row));
            const updatedProducts = [...productTypes, created];
            const prefill = rematchExtractionPrefill(lastExtraction!, {
                suppliers,
                productTypes: updatedProducts,
            });
            applyOcrPrefill(prefill);
            addToast(`Created product "${created.brandName} ${created.name}" and re-matched.`, 'success');
        } finally {
            setCreatingProductIndex(null);
        }
    };

    const filteredSuppliers = useMemo(() => {
        if (!supplierSearch) return suppliers;
        return suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()));
    }, [suppliers, supplierSearch]);

    const filteredProducts = useMemo(() => {
        if (!productSearch) return productTypes;
        return productTypes.filter(p => 
            p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
            p.brandName.toLowerCase().includes(productSearch.toLowerCase())
        );
    }, [productTypes, productSearch]);

    const handleSelectSupplier = (supplier: any) => {
        setFormData({ ...formData, supplierId: supplier.id });
        setSupplierSearch(supplier.name);
        setShowSupplierDropdown(false);
    };

    const handleSelectProduct = (product: ProductType) => {
        setNewItem({ ...newItem, productTypeId: product.id });
        setProductSearch(`${product.brandName} ${product.name}`);
        setShowProductDropdown(false);
    };

    const handleQuantityChange = (qty: number) => {
        const quantity = Math.max(1, qty);
        setNewItem(prev => ({ ...prev, quantity }));
        setNewItemSerials(prev => {
            const next = serialsForQuantity(quantity, prev);
            if (formData.status !== 'Received' || mobileSerialPool.length === 0) return next;
            const { filled } = fillSerialsFromPool(next, mobileSerialPool);
            return filled;
        });
    };

    const handleFillSerialsFromMobile = () => {
        const quantity = Number(newItem.quantity) || 1;
        const slots = serialsForQuantity(quantity, newItemSerials);
        const { filled, consumed, remaining } = fillSerialsFromPool(slots, mobileSerialPool);
        if (consumed.length === 0) {
            addToast('No unused mobile serials left to fill.', 'info');
            return;
        }
        setNewItemSerials(filled);
        setMobileSerialPool(remaining);
        addToast(`Filled ${consumed.length} serial(s) from mobile scans.`, 'success');
    };

    const handleSerialChange = (index: number, value: string) => {
        setNewItemSerials(prev => {
            const next = [...prev];
            next[index] = value;
            return next;
        });
    };

    const validatePurchaseItemSerials = (item: PurchaseItem, firmId: string, existingInventory = inventory): string | null => {
        if (formData.status !== 'Received') return null;
        return validateBatterySerials(item.serialNumbers ?? [], item.quantity, existingInventory, firmId);
    };

    const handleAddItem = () => {
        if (!newItem.productTypeId || !newItem.unitPrice || !newItem.mrp) {
            addToast('Please select product and enter price/MRP', 'warning');
            return;
        }
        
        const quantity = Number(newItem.quantity) || 1;
        const price = Number(newItem.unitPrice) || 0;
        const taxRate = Number(newItem.taxRate) || 0;
        let serialSlots = newItemSerials.map(s => s.trim());

        if (formData.status === 'Received') {
            const { filled, consumed, remaining } = fillSerialsFromPool(
                serialsForQuantity(quantity, serialSlots),
                mobileSerialPool,
            );
            serialSlots = filled;
            if (consumed.length > 0) setMobileSerialPool(remaining);

            const serialError = validateBatterySerials(serialSlots, quantity, inventory, formData.firmId);
            if (serialError) {
                addToast(serialError, 'warning');
                return;
            }
        }

        const serialNumbers = serialSlots.filter(Boolean);

        const totalExclTax = price * quantity;
        const taxAmount = totalExclTax * (taxRate / 100);
        const total = totalExclTax + taxAmount;

        const item: PurchaseItem = {
            productTypeId: newItem.productTypeId,
            type: newItem.type as 'New' | 'Refurbished',
            quantity,
            unitPrice: price,
            mrp: Number(newItem.mrp),
            taxRate,
            taxAmount,
            total,
            batchNumber: newItem.batchNumber,
            serialNumbers: formData.status === 'Received'
                ? serialSlots
                : serialNumbers,
        };

        setItems([...items, item]);
        setNewItem({ quantity: 1, taxRate: 18, type: 'New', unitPrice: undefined, mrp: undefined, batchNumber: '' });
        setNewItemSerials(['']);
        setProductSearch('');
    };

    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleUpdateItemSerial = (index: number, serialIndex: number, value: string) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const serialNumbers = serialsForQuantity(item.quantity, item.serialNumbers ?? []);
            serialNumbers[serialIndex] = value;
            return { ...item, serialNumbers };
        }));
    };

    const totals = useMemo(() => {
        return items.reduce((acc, item) => ({
            subtotal: acc.subtotal + (item.unitPrice * item.quantity),
            tax: acc.tax + item.taxAmount,
            total: acc.total + item.total
        }), { subtotal: 0, tax: 0, total: 0 });
    }, [items]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (items.length === 0) {
            addToast('Please add items to purchase', 'warning');
            return;
        }
        if (!formData.supplierId || !formData.firmId) {
            addToast('Please select firm and supplier', 'warning');
            return;
        }

        if (formData.status === 'Received') {
            for (const item of items) {
                const serialError = validatePurchaseItemSerials(item, formData.firmId);
                if (serialError) {
                    addToast(serialError, 'warning');
                    return;
                }
            }
        }

        const payload = {
            ...formData,
            entryDate: existingPurchase?.entryDate || new Date().toISOString(),
            items,
            subtotal: totals.subtotal,
            totalTax: totals.tax,
            totalAmount: totals.total,
            paidAmount: Number(formData.paidAmount),
            paymentDueDate: formData.paymentStatus !== 'Paid' && formData.paymentDueDate ? formData.paymentDueDate : undefined,
            invoiceImage,
        };

        if (isEdit && existingPurchase && onUpdate) {
            onUpdate({ ...payload, id: existingPurchase.id });
        } else {
            onSave(payload);
            if (linkedUploadId) onConsumeUpload?.(linkedUploadId);
        }
        onClose();
    };

    const handleInvoiceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setInvoiceImage(await readImageAsDataUrl(file));
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to upload image.', 'error');
        }
        e.target.value = '';
    };

    const activeFirm = config.firms.find(f => f.id === formData.firmId);

    return (
        <Modal onClose={onClose} size="xl" ariaLabel={isEdit ? 'Edit Purchase Bill' : 'New Purchase Entry'}>
                <ModalHeader title={isEdit ? 'Edit Purchase Bill' : 'New Purchase Entry'} onClose={onClose} />
                
                <main className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[70vh]">
                    {/* Header Details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-text-muted mb-1">Billing Firm</label>
                            <select value={formData.firmId} onChange={e => setFormData({...formData, firmId: e.target.value})} className="form-input">
                                {config.firms.map(f => <option key={f.id} value={f.id}>{f.shopDetails.name}</option>)}
                            </select>
                        </div>
                        <div className="relative">
                            <label className="block text-xs font-medium text-text-muted mb-1">Supplier</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search Supplier..."
                                    value={supplierSearch}
                                    onChange={(e) => {
                                        setSupplierSearch(e.target.value);
                                        setShowSupplierDropdown(true);
                                        if(formData.supplierId) setFormData({...formData, supplierId: ''});
                                    }}
                                    onFocus={() => setShowSupplierDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                                    className={`form-input pr-8 ${!formData.supplierId && supplierSearch ? 'border-yellow-500' : ''}`}
                                />
                                <IconChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
                            </div>
                            {showSupplierDropdown && (
                                <ul className="absolute z-10 w-full bg-bg-secondary border border-border-color rounded-md mt-1 max-h-48 overflow-y-auto shadow-xl">
                                    {filteredSuppliers.length > 0 ? (
                                        filteredSuppliers.map(s => (
                                            <li key={s.id} onMouseDown={() => handleSelectSupplier(s)} className="px-4 py-2 hover:bg-bg-tertiary cursor-pointer text-sm text-text-primary">
                                                {s.name}
                                            </li>
                                        ))
                                    ) : (
                                        <li className="px-4 py-2 text-sm text-text-muted italic">No suppliers found</li>
                                    )}
                                </ul>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-text-muted mb-1">Invoice No.</label>
                            <input type="text" value={formData.supplierInvoiceNumber} onChange={e => setFormData({...formData, supplierInvoiceNumber: e.target.value})} className="form-input" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-text-muted mb-1">Invoice Date</label>
                            <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="form-input" />
                        </div>
                    </div>

                    <div className="bg-bg-primary/50 p-4 rounded-lg border border-border-color space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <h4 className="font-semibold text-text-primary">Invoice Photo</h4>
                            <div className="flex gap-2 flex-wrap justify-end">
                                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleInvoiceImageUpload} />
                                <button type="button" onClick={() => imageInputRef.current?.click()} className="btn-secondary btn-sm inline-flex items-center gap-1">
                                    <IconUpload className="h-4 w-4" /> {invoiceImage ? 'Replace' : 'Upload'}
                                </button>
                                {invoiceImage && aiEnabled && (
                                    <button
                                        type="button"
                                        onClick={handleExtractFromInvoice}
                                        disabled={isExtracting}
                                        className="btn-info btn-sm inline-flex items-center gap-1"
                                    >
                                        {isExtracting ? 'Extracting…' : hasExtracted ? 'Re-extract' : 'Extract from invoice'}
                                    </button>
                                )}
                                {invoiceImage && (
                                    <button type="button" onClick={() => setInvoiceImage(undefined)} className="btn-secondary btn-sm text-red-600">Remove</button>
                                )}
                            </div>
                        </div>
                        {isExtracting && (
                            <LoadingSpinner message="Reading invoice with AI…" size="sm" />
                        )}
                        {ocrConfidence && (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${CONFIDENCE_STYLES[ocrConfidence]}`}>
                                    {CONFIDENCE_LABELS[ocrConfidence]}
                                </span>
                                {ocrWarnings.length > 0 && (
                                    <span className="text-xs text-text-muted">{ocrWarnings.length} field warning(s)</span>
                                )}
                            </div>
                        )}
                        {unmatchedSupplier && (
                            <div className="flex flex-wrap items-center justify-between gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-2">
                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                    Unmatched supplier: <strong>{unmatchedSupplier.name}</strong>
                                    {unmatchedSupplier.gstin ? ` (${unmatchedSupplier.gstin})` : ''}
                                </p>
                                <button
                                    type="button"
                                    onClick={handleCreateSupplierFromOcr}
                                    disabled={creatingSupplier}
                                    className="btn-secondary btn-sm whitespace-nowrap"
                                >
                                    {creatingSupplier ? 'Creating…' : 'Create supplier'}
                                </button>
                            </div>
                        )}
                        {unmatchedItems.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Unmatched line items</p>
                                {unmatchedItems.map(item => (
                                    <div key={item.index} className="flex flex-wrap items-center justify-between gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-2">
                                        <p className="text-sm text-yellow-800 dark:text-yellow-200">{item.description}</p>
                                        <button
                                            type="button"
                                            onClick={() => handleCreateProductFromOcr(item)}
                                            disabled={creatingProductIndex === item.index}
                                            className="btn-secondary btn-sm whitespace-nowrap"
                                        >
                                            {creatingProductIndex === item.index ? 'Creating…' : 'Create product'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {ocrWarnings.length > 0 && (
                            <div className="space-y-1">
                                {ocrWarnings.map((w, i) => (
                                    <p key={i} className="text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded">{w}</p>
                                ))}
                            </div>
                        )}
                        {invoiceImage && (
                            <img src={invoiceImage} alt="Vendor invoice" className="max-h-48 rounded-lg border border-border-color object-contain bg-bg-tertiary" />
                        )}
                    </div>

                    {(initialDraft?.scannedSerials?.length || mobileSerialPool.length > 0) && (
                        <div className="bg-status-blue-bg/30 border border-status-blue-text/20 rounded-lg p-4 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <h4 className="font-semibold text-text-primary">
                                    Mobile Scanned Serials
                                </h4>
                                <span className="text-xs font-bold text-brand-red">
                                    {mobileSerialPool.length} remaining
                                </span>
                            </div>
                            <p className="text-xs text-text-muted">
                                Scanned on the mobile companion. Remaining serials auto-fill when you add line items.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {mobileSerialPool.map((serial, idx) => (
                                    <span key={`${serial}-${idx}`} className="text-xs font-mono bg-bg-secondary border border-border-color rounded px-2 py-1">
                                        {serial}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Add Items Section */}
                    <div className="bg-bg-primary/50 p-4 rounded-lg border border-border-color space-y-4">
                        <h4 className="font-semibold text-text-primary">Add Line Items</h4>
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                            <div className="md:col-span-2 relative">
                                <label className="block text-xs font-medium text-text-muted">Product</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search Product..."
                                        value={productSearch}
                                        onChange={(e) => {
                                            setProductSearch(e.target.value);
                                            setShowProductDropdown(true);
                                            if(newItem.productTypeId) setNewItem({...newItem, productTypeId: ''});
                                        }}
                                        onFocus={() => setShowProductDropdown(true)}
                                        onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                                        className="form-input w-full pr-8"
                                    />
                                    <IconChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
                                </div>
                                {showProductDropdown && (
                                    <ul className="absolute z-10 w-full bg-bg-secondary border border-border-color rounded-md mt-1 max-h-48 overflow-y-auto shadow-xl left-0">
                                        {filteredProducts.length > 0 ? (
                                            filteredProducts.map(pt => (
                                                <li key={pt.id} onMouseDown={() => handleSelectProduct(pt)} className="px-4 py-2 hover:bg-bg-tertiary cursor-pointer text-sm text-text-primary">
                                                    <span className="font-bold">{pt.brandName}</span> {pt.name}
                                                </li>
                                            ))
                                        ) : (
                                            <li className="px-4 py-2 text-sm text-text-muted italic">No products found</li>
                                        )}
                                    </ul>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-text-muted">Batch/Model Year</label>
                                <input type="text" placeholder="Batch No" value={newItem.batchNumber || ''} onChange={e => setNewItem({...newItem, batchNumber: e.target.value})} className="form-input" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-text-muted">Qty</label>
                                <input type="number" placeholder="1" value={newItem.quantity} onChange={e => handleQuantityChange(Number(e.target.value))} className="form-input" min="1" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-text-muted">Price (Ex.Tax)</label>
                                <input type="number" placeholder="Cost" value={newItem.unitPrice || ''} onChange={e => setNewItem({...newItem, unitPrice: Number(e.target.value)})} className="form-input" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-text-muted">MRP</label>
                                <input type="number" placeholder="MRP" value={newItem.mrp || ''} onChange={e => setNewItem({...newItem, mrp: Number(e.target.value)})} className="form-input" />
                            </div>
                        </div>
                        {formData.status === 'Received' && (newItem.quantity ?? 1) > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="block text-xs font-medium text-text-muted">
                                        Serial Numbers ({newItemSerials.filter(s => s.trim()).length}/{newItem.quantity ?? 1}) — one per battery
                                    </label>
                                    {mobileSerialPool.length > 0 && (
                                        <button type="button" onClick={handleFillSerialsFromMobile} className="btn-secondary btn-sm">
                                            Fill from mobile ({mobileSerialPool.length})
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                    {newItemSerials.map((serial, index) => (
                                        <input
                                            key={index}
                                            type="text"
                                            placeholder={`Serial #${index + 1}`}
                                            value={serial}
                                            onChange={e => handleSerialChange(index, e.target.value)}
                                            className="form-input text-sm font-mono"
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex justify-between items-center">
                             <div className="flex gap-4">
                                <label className="flex items-center gap-2 text-sm text-text-secondary">
                                    Tax Rate: <input type="number" value={newItem.taxRate} onChange={e => setNewItem({...newItem, taxRate: Number(e.target.value)})} className="form-input w-16 p-1 h-8" />%
                                </label>
                             </div>
                             <button type="button" onClick={handleAddItem} className="btn-info">Add Item</button>
                        </div>
                    </div>

                    {/* Items List Table */}
                    {items.length > 0 && (
                        <div className="table-wrap rounded-lg border border-border-color overflow-hidden">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th scope="col">Product</th>
                                    <th scope="col" className="text-center">Qty</th>
                                    <th scope="col">Serials</th>
                                    <th scope="col" className="text-right">Rate</th>
                                    <th scope="col" className="text-right">Tax</th>
                                    <th scope="col" className="text-right">Total</th>
                                    <th scope="col" className="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => {
                                    const pt = productTypes.find(p => p.id === item.productTypeId);
                                    const warning = itemWarnings[idx];
                                    return (
                                        <tr key={idx} className={warning ? 'bg-status-yellow-bg/30' : ''}>
                                            <td>
                                                {pt?.brandName} {pt?.name}
                                                {warning && <span className="text-xs text-warning block">{warning}</span>}
                                                <span className="text-xs text-text-muted block">{item.batchNumber}</span>
                                            </td>
                                            <td className="text-center">{item.quantity}</td>
                                            <td>
                                                {formData.status === 'Received' ? (
                                                    <div className="grid grid-cols-1 gap-1 min-w-[140px]">
                                                        {serialsForQuantity(item.quantity, item.serialNumbers ?? []).map((serial, serialIdx) => (
                                                            <input
                                                                key={serialIdx}
                                                                type="text"
                                                                value={serial}
                                                                onChange={e => handleUpdateItemSerial(idx, serialIdx, e.target.value)}
                                                                placeholder={`Serial #${serialIdx + 1}`}
                                                                className="form-input text-xs font-mono p-1"
                                                            />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs font-mono text-text-muted">
                                                        {(item.serialNumbers?.length ?? 0) > 0
                                                            ? item.serialNumbers!.join(', ')
                                                            : 'Add when received'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-right">{item.unitPrice}</td>
                                            <td className="text-right">{item.taxAmount.toFixed(2)} ({item.taxRate}%)</td>
                                            <td className="text-right">{item.total.toFixed(2)}</td>
                                            <td className="text-center"><button type="button" onClick={() => handleRemoveItem(idx)} className="btn-icon text-negative"><IconTrash className="h-4 w-4"/></button></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                        </div>
                    )}

                    {/* Footer / Summary */}
                    <div className="flex justify-end border-t border-border-color pt-4">
                        <div className="w-1/3 space-y-2 text-right">
                            <div className="flex justify-between text-text-secondary"><span>Subtotal:</span> <span>{activeFirm?.financials.currencySymbol}{totals.subtotal.toFixed(2)}</span></div>
                            <div className="flex justify-between text-text-secondary"><span>Total Tax:</span> <span>{activeFirm?.financials.currencySymbol}{totals.tax.toFixed(2)}</span></div>
                            <div className="flex justify-between font-bold text-lg text-text-primary"><span>Total Amount:</span> <span>{activeFirm?.financials.currencySymbol}{totals.total.toFixed(2)}</span></div>
                            
                            <div className="pt-4 space-y-2">
                                <div className="flex items-center justify-end gap-2">
                                    <label className="text-sm">Payment Status:</label>
                                    <select value={formData.paymentStatus} onChange={e => setFormData({...formData, paymentStatus: e.target.value as any})} className="form-input w-auto py-1">
                                        <option value="Due">Credit / Due</option>
                                        <option value="Paid">Paid Fully</option>
                                        <option value="Partial">Partial</option>
                                    </select>
                                </div>
                                {formData.paymentStatus !== 'Due' && (
                                    <>
                                    <div className="flex items-center justify-end gap-2">
                                        <label className="text-sm">Paid Amount:</label>
                                        <input type="number" value={formData.paidAmount} onChange={e => setFormData({...formData, paidAmount: Number(e.target.value)})} className="form-input w-32 text-right" />
                                    </div>
                                    <div className="flex items-center justify-end gap-2">
                                        <label className="text-sm">Payment Method:</label>
                                        <select value={formData.paymentMethod} onChange={e => setFormData({...formData, paymentMethod: e.target.value as PaymentMethod})} className="form-input w-auto py-1">
                                            <option value="Bank Transfer">Bank Transfer</option>
                                            <option value="UPI">UPI</option>
                                            <option value="Cash">Cash</option>
                                            <option value="Card">Card</option>
                                        </select>
                                    </div>
                                    </>
                                )}
                                {formData.paymentStatus !== 'Paid' && (
                                    <div className="flex items-center justify-end gap-2">
                                        <label className="text-sm">Payment Due Date:</label>
                                        <input type="date" value={formData.paymentDueDate} onChange={e => setFormData({...formData, paymentDueDate: e.target.value})} className="form-input w-auto" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
                <ModalFooter>
                    <div className="flex gap-3 ml-auto">
                        <button onClick={onClose} className="btn-secondary">Cancel</button>
                        <button onClick={handleSubmit} className="btn-primary">{isEdit ? 'Update Purchase' : 'Save Purchase'}</button>
                    </div>
                </ModalFooter>
        </Modal>
    );
};

export const PurchasePage: React.FC = () => {
    const { purchases, addPurchase, updatePurchase, deletePurchase, purchaseInvoiceQueue, removePurchaseInvoiceUpload } = useAppData();
    const { suppliers, productTypes } = useMasterData();
    const { config } = useConfig();
    const { userRole } = useAuth();
    const { addToast } = useToast();
    const [isModalOpen, setModalOpen] = useState(false);
    const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
    const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
    const [importFormat, setImportFormat] = useState<'csv' | 'json' | null>(null);
    const [pendingUpload, setPendingUpload] = useState<PurchaseInvoiceUpload | null>(null);
    const [viewingImage, setViewingImage] = useState<string | null>(null);
    const [attachUpload, setAttachUpload] = useState<PurchaseInvoiceUpload | null>(null);
    const [attachPurchaseId, setAttachPurchaseId] = useState('');
    const [ocrPrefill, setOcrPrefill] = useState<PurchaseOcrPrefill | null>(null);
    const [scanningUploadId, setScanningUploadId] = useState<string | null>(null);
    const [batchScanning, setBatchScanning] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [supplierFilter, setSupplierFilter] = useState('');
    const [paymentFilter, setPaymentFilter] = useState<'all' | 'Paid' | 'Due' | 'Partial'>('all');

    const aiEnabled = userRole === 'admin' && (config.preferences.aiSettings?.enabled ?? false);

    const filteredPurchases = useMemo(() => {
        return purchases.filter(p => {
            if (supplierFilter && p.supplierId !== supplierFilter) return false;
            if (paymentFilter !== 'all' && p.paymentStatus !== paymentFilter) return false;
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            const supplier = suppliers.find(s => s.id === p.supplierId);
            return (
                p.supplierInvoiceNumber?.toLowerCase().includes(q) ||
                p.id.toLowerCase().includes(q) ||
                supplier?.name.toLowerCase().includes(q) ||
                p.notes?.toLowerCase().includes(q)
            );
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [purchases, searchQuery, supplierFilter, paymentFilter, suppliers]);

    const openNewPurchase = useCallback((upload?: PurchaseInvoiceUpload | null, prefill?: PurchaseOcrPrefill | null) => {
        setEditingPurchase(null);
        setPendingUpload(upload ?? null);
        setOcrPrefill(prefill ?? null);
        setModalOpen(true);
    }, []);

    useEffect(() => {
        const { open, uploadId } = consumeOpenPurchaseRequest();
        if (!open) return;
        if (uploadId) {
            const upload = purchaseInvoiceQueue.find(u => u.id === uploadId);
            if (upload) openNewPurchase(upload);
            else openNewPurchase(null);
        } else {
            openNewPurchase(null);
        }
    }, [openNewPurchase, purchaseInvoiceQueue]);

    const handleCloseModal = () => {
        setModalOpen(false);
        setEditingPurchase(null);
        setPendingUpload(null);
        setOcrPrefill(null);
    };

    const handleScanWithAI = async (upload: PurchaseInvoiceUpload) => {
        if (!config.preferences.aiSettings?.enabled) {
            addToast('Enable AI in Settings before scanning invoices.', 'warning');
            return;
        }
        setScanningUploadId(upload.id);
        try {
            const prefill = await extractPurchaseFromImage(
                upload.image,
                config.preferences.aiSettings,
                { suppliers, productTypes },
            );
            openNewPurchase(upload, prefill);
            if (prefill.warnings.length > 0) {
                addToast(`Scanned with ${prefill.warnings.length} warning(s). Review before saving.`, 'warning');
            } else {
                addToast('Invoice scanned successfully.', 'success');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'AI scan failed.';
            addToast(message.includes('disabled') ? 'AI assistant is disabled in Settings.' : message, 'error');
        } finally {
            setScanningUploadId(null);
        }
    };

    const handleScanAllPending = async () => {
        if (!config.preferences.aiSettings?.enabled || purchaseInvoiceQueue.length === 0) return;
        const first = purchaseInvoiceQueue[0];
        setBatchScanning(true);
        setScanningUploadId(first.id);
        try {
            const prefill = await extractPurchaseFromImage(
                first.image,
                config.preferences.aiSettings,
                { suppliers, productTypes },
            );
            openNewPurchase(first, prefill);
            addToast(
                purchaseInvoiceQueue.length > 1
                    ? `Scanned first of ${purchaseInvoiceQueue.length} pending invoices. Save this bill, then scan the next.`
                    : 'Invoice scanned successfully.',
                prefill.warnings.length > 0 ? 'warning' : 'success',
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Batch scan failed.';
            addToast(message, 'error');
        } finally {
            setBatchScanning(false);
            setScanningUploadId(null);
        }
    };

    const openFromUpload = (upload: PurchaseInvoiceUpload) => {
        openNewPurchase(upload);
    };

    const handleExport = (format: 'csv' | 'json') => {
        if (purchases.length === 0) {
            addToast('No purchases to export.', 'warning');
            return;
        }
        const stamp = new Date().toISOString().split('T')[0];
        if (format === 'csv') {
            downloadTextFile(
                exportPurchasesCsv(purchases, suppliers, productTypes),
                `purchases-${stamp}.csv`,
                'text/csv;charset=utf-8;',
            );
        } else {
            downloadTextFile(
                exportPurchasesJson(purchases, suppliers, productTypes),
                `purchases-${stamp}.json`,
                'application/json',
            );
        }
        addToast(`Exported ${purchases.length} purchase bill${purchases.length === 1 ? '' : 's'}.`, 'success');
    };

    const attachablePurchases = useMemo(
        () => purchases.filter(p => !p.invoiceImage).slice(0, 50),
        [purchases],
    );

    const handleAttachPhoto = () => {
        if (!attachUpload || !attachPurchaseId) {
            addToast('Select a purchase bill to attach the photo.', 'warning');
            return;
        }
        const target = purchases.find(p => p.id === attachPurchaseId);
        if (!target) {
            addToast('Purchase not found.', 'error');
            return;
        }
        updatePurchase({
            ...target,
            invoiceImage: attachUpload.image,
            supplierInvoiceNumber: target.supplierInvoiceNumber || attachUpload.supplierInvoiceNumber || '',
            notes: [target.notes, attachUpload.notes].filter(Boolean).join('\n') || target.notes,
        });
        removePurchaseInvoiceUpload(attachUpload.id);
        setAttachUpload(null);
        setAttachPurchaseId('');
    };

    return (
        <div className="page-shell">
            <PageHeader title="Purchase Management">
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleExport('csv')} className="btn-secondary inline-flex items-center gap-2">
                        <IconDownload className="h-4 w-4" /> Export CSV
                    </button>
                    <button onClick={() => handleExport('json')} className="btn-secondary inline-flex items-center gap-2">
                        <IconDownload className="h-4 w-4" /> Export JSON
                    </button>
                    <button onClick={() => setImportFormat('csv')} className="btn-secondary inline-flex items-center gap-2">
                        <IconUpload className="h-4 w-4" /> Import CSV
                    </button>
                    <button onClick={() => setImportFormat('json')} className="btn-secondary inline-flex items-center gap-2">
                        <IconUpload className="h-4 w-4" /> Import JSON
                    </button>
                    <button onClick={() => openNewPurchase(null)} className="btn-primary">
                        <IconPlus className="h-4 w-4" /> New Purchase Bill
                    </button>
                </div>
            </PageHeader>

            {purchaseInvoiceQueue.length > 0 && (
                <div className="card-section mb-6 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="font-semibold text-text-primary">Mobile Invoice Photos</h3>
                            <p className="text-sm text-text-muted">Captured from the mobile companion — create a purchase bill from each photo.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {aiEnabled && purchaseInvoiceQueue.length > 1 && (
                                <button
                                    type="button"
                                    onClick={handleScanAllPending}
                                    disabled={batchScanning || scanningUploadId !== null}
                                    className="btn-info btn-sm whitespace-nowrap"
                                >
                                    {batchScanning ? 'Scanning…' : 'Scan all pending'}
                                </button>
                            )}
                            <span className="text-sm font-bold text-brand-red">{purchaseInvoiceQueue.length} pending</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {purchaseInvoiceQueue.map(upload => {
                            const firm = config.firms.find(f => f.id === upload.firmId);
                            return (
                                <div key={upload.id} className="bg-bg-secondary border border-border-color rounded-xl overflow-hidden">
                                    <button type="button" onClick={() => setViewingImage(upload.image)} className="w-full">
                                        <img src={upload.image} alt="Pending invoice" className="w-full h-36 object-cover bg-bg-tertiary" />
                                    </button>
                                    <div className="p-3 space-y-2">
                                        <p className="text-xs text-text-muted">{firm?.shopDetails.name || 'Unknown firm'}</p>
                                        {upload.supplierInvoiceNumber && (
                                            <p className="text-sm font-mono text-text-primary">{upload.supplierInvoiceNumber}</p>
                                        )}
                                        {upload.notes && <p className="text-xs text-text-secondary line-clamp-2">{upload.notes}</p>}
                                        {upload.scannedSerials && upload.scannedSerials.length > 0 && (
                                            <p className="text-xs font-mono text-brand-red">{upload.scannedSerials.length} serial(s) scanned</p>
                                        )}
                                        <p className="text-xs text-text-muted">{new Date(upload.capturedAt).toLocaleString()}</p>
                                        <div className="flex flex-col gap-2">
                                            <button onClick={() => openFromUpload(upload)} className="btn-primary btn-sm w-full">Create Bill</button>
                                            {aiEnabled && (
                                                <button
                                                    onClick={() => handleScanWithAI(upload)}
                                                    disabled={scanningUploadId === upload.id}
                                                    className="btn-info btn-sm w-full"
                                                >
                                                    {scanningUploadId === upload.id ? 'Scanning…' : 'Scan with AI'}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => { setAttachUpload(upload); setAttachPurchaseId(''); }}
                                                className="btn-secondary btn-sm w-full"
                                                disabled={attachablePurchases.length === 0}
                                            >
                                                Attach to Bill
                                            </button>
                                            <button onClick={() => removePurchaseInvoiceUpload(upload.id)} className="btn-secondary btn-sm w-full text-red-600">Delete</button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {purchases.length === 0 ? (
                <EmptyState icon={<IconShoppingBag />} title="No Purchases Recorded" message="Start recording your vendor bills to track Input GST and Accounts Payable." action={{label: 'Record First Purchase', onClick: () => setModalOpen(true)}} />
            ) : (
                <div className="card-section space-y-4">
                    <div className="flex flex-col md:flex-row flex-wrap gap-3 p-4 pb-0">
                        <SearchInput
                            value={searchQuery}
                            onChange={setSearchQuery}
                            placeholder="Search invoice #, supplier, notes..."
                            className="md:flex-1 md:min-w-[200px]"
                        />
                        <select
                            value={supplierFilter}
                            onChange={e => setSupplierFilter(e.target.value)}
                            className="form-input md:w-48"
                            aria-label="Filter by supplier"
                        >
                            <option value="">All Suppliers</option>
                            {suppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        <select
                            value={paymentFilter}
                            onChange={e => setPaymentFilter(e.target.value as typeof paymentFilter)}
                            className="form-input md:w-40"
                            aria-label="Filter by payment status"
                        >
                            <option value="all">All Payments</option>
                            <option value="Paid">Paid</option>
                            <option value="Due">Due</option>
                            <option value="Partial">Partial</option>
                        </select>
                        {(searchQuery || supplierFilter || paymentFilter !== 'all') && (
                            <span className="text-sm text-text-muted self-center">{filteredPurchases.length} of {purchases.length}</span>
                        )}
                    </div>
                    <div className="table-wrap rounded-lg border border-border-color overflow-hidden">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th scope="col">Date</th>
                                <th scope="col">Invoice #</th>
                                <th scope="col">Supplier</th>
                                <th scope="col" className="text-right">Tax (Input GST)</th>
                                <th scope="col" className="text-right">Total Amount</th>
                                <th scope="col" className="text-center">Status</th>
                                <th scope="col" className="text-center">Payment</th>
                                <th scope="col" className="text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPurchases.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-0">
                                        <EmptyState
                                            compact
                                            icon={<IconShoppingBag />}
                                            title="No matching purchases"
                                            message="Try adjusting your search or filters."
                                        />
                                    </td>
                                </tr>
                            ) : filteredPurchases.map(p => {
                                const supplier = suppliers.find(s => s.id === p.supplierId);
                                const firm = config.firms.find(f => f.id === p.firmId);
                                return (
                                    <tr key={p.id}>
                                        <td>{new Date(p.date).toLocaleDateString()}</td>
                                        <td className="font-mono">
                                            {p.supplierInvoiceNumber}
                                            {p.invoiceImage && (
                                                <button
                                                    type="button"
                                                    onClick={() => setViewingImage(p.invoiceImage!)}
                                                    className="block text-xs text-info hover:underline mt-1"
                                                >
                                                    View photo
                                                </button>
                                            )}
                                        </td>
                                        <td className="font-bold text-text-primary">{supplier?.name || 'Unknown'}</td>
                                        <td className="text-right text-text-muted">{firm?.financials.currencySymbol}{p.totalTax.toFixed(2)}</td>
                                        <td className="text-right font-bold text-text-primary">{firm?.financials.currencySymbol}{p.totalAmount.toFixed(2)}</td>
                                        <td className="text-center">
                                            <span className="badge badge-blue">{p.status}</span>
                                        </td>
                                        <td className="text-center">
                                            <span className={`badge ${p.paymentStatus === 'Paid' ? 'badge-green' : p.paymentStatus === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>
                                                {p.paymentStatus}
                                            </span>
                                            {p.paymentDueDate && p.paymentStatus !== 'Paid' && (
                                                <p className="text-xs text-text-muted mt-1">Due: {new Date(p.paymentDueDate).toLocaleDateString()}</p>
                                            )}
                                        </td>
                                        <td className="text-center">
                                            <div className="flex justify-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => { setEditingPurchase(p); setModalOpen(true); }}
                                                    className="text-sm text-info hover:underline font-medium"
                                                >
                                                    Edit
                                                </button>
                                                {true && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setPurchaseToDelete(p)}
                                                        className="text-sm text-negative hover:underline font-medium"
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}

            {(isModalOpen || editingPurchase) && (
                <PurchaseFormModal
                    onClose={handleCloseModal}
                    onSave={addPurchase}
                    onUpdate={updatePurchase}
                    existingPurchase={editingPurchase}
                    initialInvoiceImage={pendingUpload?.image}
                    linkedUploadId={pendingUpload?.id}
                    onConsumeUpload={removePurchaseInvoiceUpload}
                    initialDraft={pendingUpload ? {
                        firmId: pendingUpload.firmId,
                        supplierInvoiceNumber: pendingUpload.supplierInvoiceNumber,
                        notes: pendingUpload.notes,
                        scannedSerials: pendingUpload.scannedSerials,
                    } : undefined}
                    ocrPrefill={ocrPrefill}
                    aiEnabled={aiEnabled}
                />
            )}

            {importFormat && (
                <PurchaseImportModal format={importFormat} onClose={() => setImportFormat(null)} />
            )}

            {viewingImage && (
                <Modal onClose={() => setViewingImage(null)} size="lg" ariaLabel="Invoice photo">
                    <ModalHeader title="Invoice Photo" onClose={() => setViewingImage(null)} />
                    <main className="p-6">
                        <img src={viewingImage} alt="Invoice" className="max-h-[70vh] w-full object-contain rounded-lg bg-bg-tertiary" />
                    </main>
                </Modal>
            )}

            {attachUpload && (
                <Modal onClose={() => { setAttachUpload(null); setAttachPurchaseId(''); }} size="md" ariaLabel="Attach invoice photo">
                    <ModalHeader title="Attach Photo to Purchase" onClose={() => { setAttachUpload(null); setAttachPurchaseId(''); }} />
                    <main className="p-6 space-y-4">
                        <img src={attachUpload.image} alt="Invoice preview" className="max-h-40 w-full object-contain rounded-lg border border-border-color bg-bg-tertiary" />
                        <div>
                            <label className="block text-xs font-medium text-text-muted mb-1">Select purchase bill</label>
                            <select value={attachPurchaseId} onChange={e => setAttachPurchaseId(e.target.value)} className="form-input">
                                <option value="">Choose a bill...</option>
                                {attachablePurchases.map(p => {
                                    const supplier = suppliers.find(s => s.id === p.supplierId);
                                    return (
                                        <option key={p.id} value={p.id}>
                                            {p.supplierInvoiceNumber} · {supplier?.name || 'Supplier'} · {new Date(p.date).toLocaleDateString()}
                                        </option>
                                    );
                                })}
                            </select>
                            {attachablePurchases.length === 0 && (
                                <p className="text-xs text-text-muted mt-2">All purchases already have photos attached.</p>
                            )}
                        </div>
                    </main>
                    <ModalFooter>
                        <div className="flex gap-3 ml-auto">
                            <button type="button" onClick={() => { setAttachUpload(null); setAttachPurchaseId(''); }} className="btn-secondary">Cancel</button>
                            <button type="button" onClick={handleAttachPhoto} disabled={!attachPurchaseId} className="btn-primary">Attach Photo</button>
                        </div>
                    </ModalFooter>
                </Modal>
            )}

            {purchaseToDelete && (
                <ConfirmationModal
                    title="Delete Purchase"
                    message={`Delete purchase ${purchaseToDelete.supplierInvoiceNumber}? Stock will be reversed if received.`}
                    confirmText="Delete"
                    onConfirm={() => {
                        deletePurchase(purchaseToDelete.id, userRole!, true);
                        setPurchaseToDelete(null);
                    }}
                    onCancel={() => setPurchaseToDelete(null)}
                />
            )}
        </div>
    );
};
