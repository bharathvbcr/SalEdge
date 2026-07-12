import React, { useState, useMemo, useCallback } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { AddStockModal } from './AddStockModal.tsx';
import { IconPlus, IconChevronDown, IconTrash, IconBox, IconHistory, IconAdjustments, IconChevronUp, IconTrendingUp, IconAlertTriangle, IconPrint } from './icons.tsx';
import { InventoryItem, ProductType } from '../types.ts';
import { COMMON_HSN_CODES, DEFAULT_BATTERY_HSN } from '../indianGST.ts';
import { EmptyState } from './EmptyState.tsx';
import { ConfirmationModal } from './ConfirmationModal.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { StockAdjustmentModal } from './StockAdjustmentModal.tsx';
import { InventoryHistoryModal } from './InventoryHistoryModal.tsx';
import { SuppliersView } from './SuppliersPage.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { BarcodeModal } from './BarcodeModal.tsx';
import { StockTakeModal } from './StockTakeModal.tsx';
import { PageHeader } from './PageHeader.tsx';
import { SearchInput } from './SearchInput.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';
import { FormField } from './FormField.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { isSerialTrackedItem } from '../utils/serialNumbers.ts';
import { sharedInventoryFirmId } from '../utils/sharedInventory.ts';
import { consumeInventorySearchRequest } from '../utils/pageActions.ts';
import { usePageIntent } from '../hooks/usePageIntent.ts';
import { useBarcodeWedge } from '../hooks/useBarcodeWedge.ts';

// --- Product Form Modal Component ---
const ProductFormModal: React.FC<{
    product?: ProductType | null;
    onSave: (data: Omit<ProductType, 'id'> | ProductType) => void;
    onClose: () => void;
}> = ({ product, onSave, onClose }) => {
    const { config } = useConfig();
    const productCategories = config.preferences.saleCategories?.length
        ? config.preferences.saleCategories
        : ['Inverter', '2-Wheeler', '3-Wheeler', '4-Wheeler', 'Truck', 'Generator', 'Solar', 'E-Rickshaw', 'Other'];
    const [formData, setFormData] = useState({
        brandName: product?.brandName || '',
        name: product?.name || '',
        category: product?.category || productCategories[0] || 'Inverter',
        capacity: product?.specifications.capacity || '',
        voltage: product?.specifications.voltage || '',
        technology: product?.specifications.technology || 'Tubular',
        cRating: product?.specifications.cRating || 'C20',
        lowStockThreshold: product?.lowStockThreshold || config.preferences.defaultLowStockAlert || 0,
        barcode: product?.barcode || '',
        hsnCode: product?.hsnCode || DEFAULT_BATTERY_HSN,
        defaultGuaranteeMonths: product?.defaultGuaranteeMonths || 0,
        defaultWarrantyMonths: product?.defaultWarrantyMonths || 0,
    });
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const saveData = {
            brandName: formData.brandName,
            name: formData.name,
            category: formData.category,
            specifications: {
                capacity: formData.capacity,
                voltage: formData.voltage,
                technology: formData.technology as any,
                cRating: formData.cRating as any,
            },
            lowStockThreshold: Number(formData.lowStockThreshold),
            barcode: formData.barcode.trim() || undefined,
            hsnCode: formData.hsnCode.trim() || undefined,
            defaultGuaranteeMonths: Number(formData.defaultGuaranteeMonths),
            defaultWarrantyMonths: Number(formData.defaultWarrantyMonths),
        }
        onSave(product ? { ...saveData, id: product.id } : saveData);
    };

    const categories = productCategories;
    const technologies = ['Tubular', 'Flat Plate', 'SMF', 'Gel', 'Lithium'];
    const cRatings = ['C20', 'C10', 'C5', 'N/A'];

    return (
        <Modal onClose={onClose} size="lg" ariaLabel={product ? 'Edit Product Type' : 'Add New Product Type'}>
            <ModalHeader title={product ? 'Edit Product Type' : 'Add New Product Type'} onClose={onClose} />
                <form onSubmit={handleSubmit} className="p-6 max-h-[70vh] overflow-y-auto">
                    {/* ... (rest of form) ... */}
                    <div className="space-y-4">
                        <h4 className="text-base font-semibold text-text-primary">Basic Information</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Brand Name">
                                <input type="text" placeholder="e.g., Amaron" value={formData.brandName} onChange={e => setFormData({...formData, brandName: e.target.value})} className="form-input" required />
                            </FormField>
                            <FormField label="Category">
                                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="form-input" required>
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </FormField>
                        </div>
                        <FormField label="Product Name / Model">
                            <input type="text" placeholder="e.g., 150Ah Solar Battery" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="form-input" required />
                        </FormField>
                        <FormField label="Barcode / SKU (optional)">
                            <input type="text" placeholder="Product-level barcode for scanning" value={formData.barcode} onChange={e => setFormData({...formData, barcode: e.target.value})} className="form-input font-mono" />
                        </FormField>
                        <FormField label="HSN Code">
                            <input
                                type="text"
                                list="common-hsn-codes"
                                placeholder="e.g. 8507"
                                value={formData.hsnCode}
                                onChange={e => setFormData({...formData, hsnCode: e.target.value})}
                                className="form-input font-mono"
                            />
                            <datalist id="common-hsn-codes">
                                {COMMON_HSN_CODES.map(h => (
                                    <option key={h.code} value={h.code}>{h.description} ({h.gstRate}%)</option>
                                ))}
                            </datalist>
                        </FormField>
                    </div>

                     <div className="space-y-4 pt-4 mt-4 border-t border-border-color">
                        <h4 className="text-base font-semibold text-text-primary">Technical Specs</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Technology">
                                <select value={formData.technology} onChange={e => setFormData({...formData, technology: e.target.value as ProductType['specifications']['technology']})} className="form-input">
                                    {technologies.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </FormField>
                             <FormField label="C-Rating (Solar)">
                                <select value={formData.cRating} onChange={e => setFormData({...formData, cRating: e.target.value as ProductType['specifications']['cRating']})} className="form-input">
                                    {cRatings.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </FormField>
                            <FormField label="Capacity">
                                <input type="text" placeholder="e.g. 150Ah" value={formData.capacity} onChange={e => setFormData({...formData, capacity: e.target.value})} className="form-input" required />
                            </FormField>
                            <FormField label="Voltage">
                                <input type="text" placeholder="e.g. 12V" value={formData.voltage} onChange={e => setFormData({...formData, voltage: e.target.value})} className="form-input" required />
                            </FormField>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 mt-4 border-t border-border-color">
                        <h4 className="text-base font-semibold text-text-primary">Stock & Warranty Defaults</h4>
                         <FormField label="Low Stock Threshold">
                           <input type="number" placeholder="e.g. 5" value={formData.lowStockThreshold} onChange={e => setFormData({...formData, lowStockThreshold: Number(e.target.value)})} className="form-input" />
                        </FormField>
                         <div className="grid grid-cols-2 gap-4">
                            <FormField label="Free Replacement (Months)">
                                <input type="number" placeholder="0" value={formData.defaultGuaranteeMonths} onChange={e => setFormData({...formData, defaultGuaranteeMonths: Number(e.target.value)})} className="form-input" />
                            </FormField>
                            <FormField label="Pro-rata Warranty (Months)">
                                <input type="number" placeholder="0" value={formData.defaultWarrantyMonths} onChange={e => setFormData({...formData, defaultWarrantyMonths: Number(e.target.value)})} className="form-input" />
                            </FormField>
                        </div>
                    </div>

                    <ModalFooter>
                        <div className="flex gap-3 ml-auto">
                            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                            <button type="submit" className="btn-primary">Save Product</button>
                        </div>
                    </ModalFooter>
                </form>
        </Modal>
    );
};


const InventoryStatCard: React.FC<{ title: string; value: string; icon: React.ReactElement; onClick?: () => void }> = ({ title, value, icon, onClick }) => (
    <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
        className={`bg-bg-secondary p-4 rounded-xl shadow-lg border border-border-color flex items-center space-x-4 ${onClick ? 'cursor-pointer hover:border-brand-red/40 transition-colors' : ''}`}
    >
        <div className="p-3 bg-brand-red/10 rounded-lg text-brand-red">
            {icon}
        </div>
        <div>
            <p className="text-sm text-text-muted font-medium">{title}</p>
            <p className="text-2xl font-bold text-text-primary">{value}</p>
        </div>
    </div>
);

type SortKey = 'name' | 'category' | 'totalStock' | 'dealerPrice' | 'mrp';

export const InventoryPage: React.FC = () => {
    const { inventory, addStock, updateStockQuantity, updateBatchDetails, deleteBatch, scrapInventory, markScrapSold } = useAppData();
    const { productTypes, addProductType, updateProductType, deleteProductType } = useMasterData();
    const { config } = useConfig();
    const { userRole } = useAuth();
    
    const defaultFirm = config.firms.find(f => f.id === config.preferences.defaultFirmId) || config.firms[0];
    const currencySymbol = defaultFirm?.financials.currencySymbol || '₹';
    const [isManageStockModalOpen, setManageStockModalOpen] = useState(false);
    const [isProductFormOpen, setProductFormOpen] = useState(false);
    const [productToEdit, setProductToEdit] = useState<ProductType | null>(null);
    const [productForStock, setProductForStock] = useState<ProductType | null>(null);
    const [productToDelete, setProductToDelete] = useState<ProductType | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [lowStockOnly, setLowStockOnly] = useState(false);
    const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
    const [itemToAdjust, setItemToAdjust] = useState<InventoryItem | null>(null);
    const [itemForHistory, setItemForHistory] = useState<InventoryItem | null>(null);
    const [itemToPrintBarcode, setItemToPrintBarcode] = useState<InventoryItem | null>(null);
    const [isStockTakeOpen, setStockTakeOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'stock' | 'scrap' | 'suppliers'>('stock');
    const { addToast } = useToast();

    const applyInventorySearchIntent = useCallback(() => {
        const prefill = consumeInventorySearchRequest();
        if (prefill) {
            if (prefill.query) setSearchQuery(prefill.query);
            if (prefill.lowStockOnly) setLowStockOnly(true);
        }
    }, []);

    usePageIntent(applyInventorySearchIntent);

    useBarcodeWedge(activeTab === 'stock' && !isManageStockModalOpen && !isProductFormOpen && !isStockTakeOpen, (code) => {
        setSearchQuery(code);
        addToast(`Looking up: ${code}`, 'info');
    });

    const stockInventory = useMemo(() => inventory, [inventory]);

     const { totalCostValue, totalMrpValue, lowStockCount } = useMemo(() => {
        const cost = stockInventory.reduce((sum, item) => sum + item.purchasePrice * item.stock, 0);
        const mrp = stockInventory.reduce((sum, item) => sum + (item.mrp * item.stock), 0);
        
        const lowStockProducts = productTypes.filter(pt => {
            if (!pt.lowStockThreshold || pt.lowStockThreshold <= 0) return false;
            const totalStock = stockInventory
                .filter(inv => inv.productTypeId === pt.id)
                .reduce((sum, item) => sum + item.stock, 0);
            return totalStock <= pt.lowStockThreshold;
        });

        return {
            totalCostValue: cost,
            totalMrpValue: mrp,
            lowStockCount: lowStockProducts.length
        };
    }, [stockInventory, productTypes]);

    const filteredAndSortedProducts = useMemo(() => {
        // ... (sorting logic same as before)
        let products = productTypes.map(pt => {
            let relevantInventory = stockInventory.filter(inv => inv.productTypeId === pt.id);

            if (searchQuery) {
                const lowerQuery = searchQuery.toLowerCase();
                const productMatches = pt.name.toLowerCase().includes(lowerQuery) ||
                                       pt.brandName.toLowerCase().includes(lowerQuery) ||
                                       pt.category.toLowerCase().includes(lowerQuery);
                
                if (!productMatches) {
                     relevantInventory = relevantInventory.filter(i => 
                        (i.serialNumber && i.serialNumber.toLowerCase().includes(lowerQuery)) ||
                        (i.batchNumber && i.batchNumber.toLowerCase().includes(lowerQuery))
                    );
                }
            }

            const totalStock = relevantInventory.reduce((sum, item) => sum + item.stock, 0);
            const lowStockThreshold = pt.lowStockThreshold || 0;
            return { ...pt, totalStock, inventoryItems: relevantInventory, lowStockThreshold };
        });

        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            products = products.filter(p => {
                 const productMatches = p.name.toLowerCase().includes(lowerQuery) ||
                                        p.brandName.toLowerCase().includes(lowerQuery) ||
                                        p.category.toLowerCase().includes(lowerQuery);
                 return productMatches || p.inventoryItems.length > 0;
            });
        }

        if (lowStockOnly) {
            products = products.filter(p =>
                p.lowStockThreshold > 0 && p.totalStock <= p.lowStockThreshold
            );
        }

        products.sort((a, b) => {
            let aValue: any = a[sortConfig.key as keyof typeof a];
            let bValue: any = b[sortConfig.key as keyof typeof b];

            if (sortConfig.key === 'name') {
                aValue = `${a.brandName} ${a.name}`;
                bValue = `${b.brandName} ${b.name}`;
            } else if (sortConfig.key === 'dealerPrice') {
                 const aPrices = a.inventoryItems.map(i => i.purchasePrice);
                 const bPrices = b.inventoryItems.map(i => i.purchasePrice);
                 aValue = aPrices.length ? Math.min(...aPrices) : 0;
                 bValue = bPrices.length ? Math.min(...bPrices) : 0;
            } else if (sortConfig.key === 'mrp') {
                 const aPrices = a.inventoryItems.map(i => i.mrp);
                 const bPrices = b.inventoryItems.map(i => i.mrp);
                 aValue = aPrices.length ? Math.min(...aPrices) : 0;
                 bValue = bPrices.length ? Math.min(...bPrices) : 0;
            }

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return products;
    }, [productTypes, stockInventory, searchQuery, sortConfig, lowStockOnly]);


    const getPriceRange = (items: InventoryItem[], key: 'purchasePrice' | 'mrp') => {
        if (items.length === 0) return 'N/A';
        const prices = items.map(item => item[key]);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const currency = currencySymbol;

        if (min === max) return `${currency}${min.toLocaleString('en-IN')}`;
        return `${currency}${min.toLocaleString('en-IN')} - ${currency}${max.toLocaleString('en-IN')}`;
    };

    const handleSaveProduct = (data: Omit<ProductType, 'id'> | ProductType) => {
        if ('id' in data) {
            updateProductType(data);
        } else {
            addProductType(data);
        }
        setProductFormOpen(false);
        setProductToEdit(null);
    };

    const handleOpenProductForm = (product?: ProductType) => {
        setProductToEdit(product || null);
        setProductFormOpen(true);
    };

    const handleOpenManageStock = (product: ProductType) => {
        setProductForStock(product);
        setManageStockModalOpen(true);
    };
    
    const handleDeleteConfirm = () => {
        if (productToDelete) {
            deleteProductType(productToDelete.id);
            setProductToDelete(null);
        }
    };
    
    const handleOpenAdjustModal = (item: InventoryItem) => setItemToAdjust(item);
    const handleOpenHistoryModal = (item: InventoryItem) => setItemForHistory(item);


    const SortableHeader: React.FC<{ sortKey: SortKey; children: React.ReactNode; className?: string }> = ({ sortKey, children, className }) => {
        const isSorted = sortConfig.key === sortKey;
        const direction = sortConfig.direction;

        const requestSort = () => {
            let newDirection: 'asc' | 'desc' = 'asc';
            if (isSorted && direction === 'asc') {
                newDirection = 'desc';
            }
            setSortConfig({ key: sortKey, direction: newDirection });
        };

        return (
            <th className={`p-4 ${className || ''}`}>
                <button onClick={requestSort} className="group flex items-center gap-2 uppercase text-xs font-bold tracking-wider">
                    {children}
                    <div className="w-4 h-4">
                        {isSorted ? (direction === 'asc' ? <IconChevronUp /> : <IconChevronDown />) : <IconChevronUp className="opacity-0 group-hover:opacity-50 transition-opacity" />}
                    </div>
                </button>
            </th>
        );
    };
    
    const getStockStatus = (product: { totalStock: number; lowStockThreshold: number }) => {
        if (product.totalStock === 0) return { level: 100, color: 'bg-red-500/80', textColor: 'text-red-500' };
        const threshold = product.lowStockThreshold;
        if (threshold === 0) return { level: 100, color: 'bg-green-500/80', textColor: 'text-green-500' };
        
        if (product.totalStock <= threshold) return { level: (product.totalStock / threshold) * 50, color: 'bg-red-500/80', textColor: 'text-red-500' };
        if (product.totalStock <= threshold * 1.5) return { level: 50 + ((product.totalStock - threshold) / (threshold * 0.5)) * 25, color: 'bg-yellow-500/80', textColor: 'text-yellow-500' };
        return { level: 75 + Math.min(25, ((product.totalStock - threshold * 1.5) / threshold) * 25), color: 'bg-green-500/80', textColor: 'text-green-500' };
    };


    return (
        <div className="page-shell">
            <PageHeader title="Products & Inventory" subtitle="One stock pool for the whole shop">
                    {activeTab !== 'suppliers' && (
                        <>
                            <SearchInput
                              value={searchQuery}
                              onChange={setSearchQuery}
                              placeholder="Search by name, serial..."
                            />
                            <button
                                type="button"
                                onClick={() => setLowStockOnly(v => !v)}
                                className={`filter-pill flex-shrink-0 ${lowStockOnly ? 'active' : ''}`}
                            >
                                Low Stock
                            </button>
                            <button onClick={() => setStockTakeOpen(true)} className="btn-secondary flex-shrink-0">
                                <IconAdjustments className="h-4 w-4" /> Stock Take
                            </button>
                            <button onClick={() => handleOpenProductForm()} className="btn-primary flex-shrink-0">
                                <IconPlus className="h-4 w-4" /> Add Product
                            </button>
                        </>
                    )}
            </PageHeader>

            {activeTab !== 'suppliers' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {userRole === 'admin' && (
                        <InventoryStatCard title="Total Inventory Value (Cost)" value={`${currencySymbol}${totalCostValue.toLocaleString('en-IN')}`} icon={<IconBox />} />
                    )}
                    <InventoryStatCard title="Total Inventory Value (MRP)" value={`${currencySymbol}${totalMrpValue.toLocaleString('en-IN')}`} icon={<IconTrendingUp />} />
                    <InventoryStatCard
                        title="Low Stock Items"
                        value={lowStockCount.toString()}
                        icon={<IconAlertTriangle />}
                        onClick={() => setLowStockOnly(v => !v)}
                    />
                </div>
            )}
            
            <div className="tab-bar mt-2">
                <button 
                    onClick={() => setActiveTab('stock')}
                    className={`tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
                >
                    Current Stock
                </button>
                <button 
                    onClick={() => setActiveTab('scrap')}
                    className={`tab-btn ${activeTab === 'scrap' ? 'active' : ''}`}
                >
                    Scrap / Old Batteries ({scrapInventory.filter(s => s.status === 'In Stock').length})
                </button>
                <button 
                    onClick={() => setActiveTab('suppliers')}
                    className={`tab-btn ${activeTab === 'suppliers' ? 'active' : ''}`}
                >
                    Suppliers
                </button>
            </div>

            {activeTab === 'stock' && (
                <div className="card-section">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-text-secondary">
                            <thead className="text-xs text-text-primary uppercase bg-bg-tertiary sticky top-0 z-10">
                                <tr>
                                    <th className="p-4 w-8"></th>
                                    <SortableHeader sortKey="name">Product Name</SortableHeader>
                                    <SortableHeader sortKey="category">Category</SortableHeader>
                                    <th className="p-4">Tech & Specs</th>
                                    {userRole === 'admin' && <SortableHeader sortKey="dealerPrice" className="text-right">Dealer Price</SortableHeader>}
                                    <SortableHeader sortKey="mrp" className="text-right">MRP</SortableHeader>
                                    <SortableHeader sortKey="totalStock" className="w-48">Total Stock</SortableHeader>
                                    <th className="p-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAndSortedProducts.length > 0 ? filteredAndSortedProducts.map((p) => {
                                    const stockStatus = getStockStatus(p);
                                    const isExpanded = expandedProductId === p.id || (searchQuery.length > 0 && p.inventoryItems.length > 0);
                                    
                                    return (
                                    <React.Fragment key={p.id}>
                                        <tr className="border-b border-border-color hover:bg-bg-tertiary cursor-pointer" onClick={() => setExpandedProductId(expandedProductId === p.id ? null : p.id)}>
                                            <td className="p-4"><IconChevronDown className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} /></td>
                                            <td className="p-4 font-medium text-text-primary">
                                                {p.brandName} {p.name}
                                            </td>
                                            <td className="p-4"><span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">{p.category}</span></td>
                                            <td className="p-4 text-xs text-text-muted">
                                                <div>{p.specifications.capacity} / {p.specifications.voltage}</div>
                                                {p.specifications.technology && <div>{p.specifications.technology}</div>}
                                                {p.specifications.cRating && p.specifications.cRating !== 'N/A' && <div className="font-semibold text-brand-red">{p.specifications.cRating}</div>}
                                            </td>
                                            {userRole === 'admin' && (
                                                <td className="p-4 text-right font-mono text-xs">{getPriceRange(p.inventoryItems, 'purchasePrice')}</td>
                                            )}
                                            <td className="p-4 text-right font-mono">{getPriceRange(p.inventoryItems, 'mrp')}</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <span className={`font-bold text-lg w-10 text-right ${stockStatus.textColor}`}>{p.totalStock}</span>
                                                    <div className="w-full bg-bg-tertiary rounded-full h-2"><div className={`${stockStatus.color} h-2 rounded-full`} style={{ width: `${stockStatus.level}%` }}></div></div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex justify-center items-center gap-2">
                                                    <button onClick={(e) => { e.stopPropagation(); handleOpenManageStock(p); }} className="btn-info btn-sm">Manage Stock</button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleOpenProductForm(p); }} className="btn-secondary btn-sm">Edit</button>
                                                    {userRole === 'admin' && <button onClick={(e) => { e.stopPropagation(); setProductToDelete(p); }} className="btn-icon text-red-500 hover:bg-red-500/10" aria-label={`Delete ${p.brandName} ${p.name}`}><IconTrash /></button>}
                                                </div>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="bg-bg-primary/50 shadow-inner">
                                                <td colSpan={userRole === 'admin' ? 8 : 7} className="p-0">
                                                    <div className="p-4 md:p-6">
                                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                                                            <div>
                                                                <h4 className="font-bold text-lg text-text-primary flex items-center gap-2">
                                                                    <IconBox className="h-5 w-5 text-text-muted"/>
                                                                    Batch Inventory
                                                                </h4>
                                                                <p className="text-sm text-text-muted mt-1">
                                                                    In stock: <span className="font-medium text-text-secondary">{p.inventoryItems.filter(i => i.stock > 0).length}</span>
                                                                    {p.inventoryItems.some(i => i.stock === 0 && i.serialNumber) && (
                                                                        <> · Sold: <span className="font-medium text-text-secondary">{p.inventoryItems.filter(i => i.stock === 0 && i.serialNumber).length}</span></>
                                                                    )}
                                                                </p>
                                                                <p className="text-xs text-text-muted mt-0.5">
                                                                    {p.defaultGuaranteeMonths ? `${p.defaultGuaranteeMonths} mo guarantee` : 'No guarantee'}
                                                                    {p.defaultWarrantyMonths ? ` + ${p.defaultWarrantyMonths} mo warranty` : ''}
                                                                </p>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                 <button onClick={(e) => { e.stopPropagation(); handleOpenManageStock(p); }} className="btn-info">
                                                                    <IconPlus className="h-4 w-4" /> Add Stock
                                                                 </button>
                                                            </div>
                                                        </div>

                                                        {p.inventoryItems.filter(i => i.stock > 0).length > 0 ? (
                                                            <div className="bg-bg-secondary rounded-lg border border-border-color overflow-hidden">
                                                                <table className="w-full text-sm">
                                                                    <thead className="bg-bg-tertiary border-b border-border-color text-xs uppercase text-text-muted font-semibold tracking-wider">
                                                                        <tr>
                                                                            <th className="p-4 text-left">Serial / Batch</th>
                                                                            <th className="p-4 text-left">Dates & Age</th>
                                                                            {userRole === 'admin' && <th className="p-4 text-right">Cost Price</th>}
                                                                            <th className="p-4 text-right">MRP</th>
                                                                            <th className="p-4 text-center">Stock Level</th>
                                                                            <th className="p-4 text-center">Actions</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-border-color">
                                                                        {p.inventoryItems.filter(item => item.stock > 0).map(item => {
                                                                            const ageInDays = Math.floor((Date.now() - new Date(item.purchaseDate).getTime()) / (1000 * 60 * 60 * 24));
                                                                            return (
                                                                            <tr key={item.id} className="hover:bg-bg-tertiary/40 transition-colors group">
                                                                                <td className="p-4">
                                                                                    <div className="flex flex-col gap-1">
                                                                                        <div className="font-mono font-medium text-text-primary">
                                                                                            {item.serialNumber || <span className="text-text-muted italic">No serial</span>}
                                                                                        </div>
                                                                                        {item.batchNumber && (
                                                                                            <div className="text-xs text-text-secondary">
                                                                                                Batch: {item.batchNumber}
                                                                                            </div>
                                                                                        )}
                                                                                        <span className={`self-start text-[10px] px-1.5 py-0.5 rounded border ${item.type === 'New' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                                                            {item.type}
                                                                                        </span>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="p-4">
                                                                                    <div className="text-text-primary font-medium">{new Date(item.purchaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                                                                                    <div className={`text-xs mt-0.5 font-medium ${ageInDays > 180 ? 'text-red-500' : ageInDays > 90 ? 'text-yellow-600' : 'text-green-600'}`}>
                                                                                        {ageInDays} days old
                                                                                    </div>
                                                                                </td>
                                                                                {userRole === 'admin' && (
                                                                                    <td className="p-4 text-right font-mono text-text-secondary text-xs">
                                                                                        {currencySymbol}{item.purchasePrice.toLocaleString('en-IN')}
                                                                                    </td>
                                                                                )}
                                                                                <td className="p-4 text-right font-mono font-medium text-text-primary">
                                                                                    {currencySymbol}{item.mrp.toLocaleString('en-IN')}
                                                                                </td>
                                                                                <td className="p-4 text-center">
                                                                                     <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-sm font-bold ${item.stock > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                                                                        {item.stock}
                                                                                     </span>
                                                                                </td>
                                                                                <td className="p-4">
                                                                                    <div className="flex justify-center items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                                                         <button onClick={(e) => {e.stopPropagation(); setItemToPrintBarcode(item)}} title="Print Barcodes" className="btn-icon" aria-label="Print barcodes">
                                                                                             <IconPrint className="h-4 w-4"/>
                                                                                         </button>
                                                                                        <button onClick={(e) => {e.stopPropagation(); handleOpenAdjustModal(item)}} title="Adjust Stock" className="btn-icon text-yellow-600 hover:bg-yellow-500/10" aria-label="Adjust stock"><IconAdjustments className="h-4 w-4" /></button>
                                                                                        <button onClick={(e) => {e.stopPropagation(); handleOpenHistoryModal(item)}} title="View History" className="btn-icon text-purple-600 hover:bg-purple-500/10" aria-label="View history"><IconHistory className="h-4 w-4" /></button>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        )})}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center py-8 bg-bg-secondary rounded-lg border border-border-color border-dashed">
                                                                <IconBox className="h-10 w-10 text-text-muted mx-auto mb-2 opacity-50" />
                                                                <p className="text-text-muted font-medium">No stock available for this product.</p>
                                                                <button onClick={(e) => { e.stopPropagation(); handleOpenManageStock(p); }} className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-bold">
                                                                    + Add Initial Stock
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                )}) : (
                                    <tr><td colSpan={userRole === 'admin' ? 8 : 7}><EmptyState icon={<IconBox/>} title="No Products Found" message="Add your first product to get started." action={{label: 'Add New Product', onClick: () => handleOpenProductForm()}} /></td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {activeTab === 'scrap' && (
                <div className="card-section-padded">
                     <h3 className="text-lg font-bold text-text-primary mb-4">Old / Scrap Batteries</h3>
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-text-secondary">
                            <thead className="text-xs text-text-primary uppercase bg-bg-tertiary">
                                <tr>
                                    <th className="p-3">Date Received</th>
                                    <th className="p-3">Product Name</th>
                                    <th className="p-3">Category</th>
                                    {userRole === 'admin' && <th className="p-3 text-right">Cost (Purchase Price)</th>}
                                    <th className="p-3 text-center">Status</th>
                                    <th className="p-3">Notes</th>
                                    <th className="p-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {scrapInventory.length > 0 ? scrapInventory.map(item => (
                                    <tr key={item.id} className="border-b border-border-color hover:bg-bg-tertiary">
                                        <td className="p-3">{new Date(item.date).toLocaleDateString()}</td>
                                        <td className="p-3 font-medium text-text-primary">{item.productName}</td>
                                        <td className="p-3">{item.category}</td>
                                        {userRole === 'admin' && <td className="p-3 text-right font-mono">{currencySymbol}{item.purchasePrice}</td>}
                                        <td className="p-3 text-center">
                                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${item.status === 'In Stock' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="p-3 text-xs text-text-muted max-w-xs truncate">{item.notes}</td>
                                        <td className="p-3 text-center">
                                            {item.status === 'In Stock' && (
                                                <button onClick={() => markScrapSold(item.id)} className="btn-link text-xs font-bold">Mark Sold</button>
                                            )}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={userRole === 'admin' ? 7 : 6}><EmptyState icon={<IconBox />} title="No Scrap Inventory" message="Old batteries received as buybacks will appear here." /></td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'suppliers' && <SuppliersView />}

            {isProductFormOpen && <ProductFormModal product={productToEdit} onSave={handleSaveProduct} onClose={() => setProductFormOpen(false)} />}
            {isManageStockModalOpen && productForStock && (
                <AddStockModal
                    productType={productForStock}
                    existingBatches={inventory.filter(i => i.productTypeId === productForStock.id)}
                    onClose={() => setManageStockModalOpen(false)}
                    onAddBatch={(newItem) => addStock({ ...newItem, firmId: sharedInventoryFirmId() })}
                    onUpdateBatchDetails={updateBatchDetails}
                    onDeleteBatch={deleteBatch}
                />
            )}
            {productToDelete && <ConfirmationModal title="Delete Product" message={`Are you sure you want to delete ${productToDelete.brandName} ${productToDelete.name}? This cannot be undone.`} confirmText="Delete" onConfirm={handleDeleteConfirm} onCancel={() => setProductToDelete(null)} />}
            
            {itemToAdjust && <StockAdjustmentModal item={itemToAdjust} productType={productTypes.find(p => p.id === itemToAdjust.productTypeId)!} onClose={() => setItemToAdjust(null)} />}
            {itemForHistory && <InventoryHistoryModal item={itemForHistory} productType={productTypes.find(p => p.id === itemForHistory.productTypeId)!} onClose={() => setItemForHistory(null)} />}
            {itemToPrintBarcode && (() => {
                const pt = productTypes.find(p => p.id === itemToPrintBarcode.productTypeId);
                const fullName = pt ? `${pt.brandName} ${pt.name}` : 'Unknown';
                return (
                    <BarcodeModal
                        batch={itemToPrintBarcode}
                        productName={fullName}
                        sku={pt?.id || itemToPrintBarcode.batchNumber}
                        onClose={() => setItemToPrintBarcode(null)}
                    />
                );
            })()}
            {isStockTakeOpen && <StockTakeModal onClose={() => setStockTakeOpen(false)} />}
        </div>
    );
};