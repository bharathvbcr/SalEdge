
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryItem, ProductType } from '../types.ts';
import { IconPlus, IconTrash, IconChevronDown } from './icons.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { sharedInventoryFirmId } from '../utils/sharedInventory.ts';

interface ManageStockModalProps {
    productType: ProductType;
    existingBatches: InventoryItem[];
    onClose: () => void;
    onAddBatch: (newItem: Omit<InventoryItem, 'id'>) => boolean;
    onUpdateBatchDetails: (inventoryItemId: string, updatedDetails: Partial<Omit<InventoryItem, 'id' | 'stock' | 'productTypeId'>>) => void;
    onDeleteBatch: (inventoryItemId: string) => void;
}

const ExistingBatchRow: React.FC<{
    batch: InventoryItem;
    onUpdateDetails: ManageStockModalProps['onUpdateBatchDetails'];
    onDelete: ManageStockModalProps['onDeleteBatch'];
}> = ({ batch, onUpdateDetails, onDelete }) => {
    const [details, setDetails] = useState({
        batchNumber: batch.batchNumber || '',
        purchasePrice: batch.purchasePrice.toString(),
        mrp: batch.mrp.toString(),
    });

    const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDetails(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSaveDetails = () => {
        onUpdateDetails(batch.id, {
            batchNumber: details.batchNumber,
            purchasePrice: parseFloat(details.purchasePrice),
            mrp: parseFloat(details.mrp)
        });
    };

    const isChanged = details.batchNumber !== (batch.batchNumber || '') ||
                      details.purchasePrice !== batch.purchasePrice.toString() ||
                      details.mrp !== batch.mrp.toString();

    return (
        <tr className="border-b border-border-color last:border-b-0">
            <td className="p-2 align-middle font-mono text-xs">{batch.serialNumber || '—'}</td>
            <td className="p-2 align-middle">{new Date(batch.purchaseDate).toLocaleDateString()}</td>
            <td className="p-2 align-middle"><input type="text" name="batchNumber" value={details.batchNumber} onChange={handleDetailChange} className="form-input text-xs p-1"/></td>
            <td className="p-2 align-middle"><input type="number" name="purchasePrice" value={details.purchasePrice} onChange={handleDetailChange} className="form-input text-xs p-1 w-24 text-right" /></td>
            <td className="p-2 align-middle"><input type="number" name="mrp" value={details.mrp} onChange={handleDetailChange} className="form-input text-xs p-1 w-24 text-right" /></td>
            <td className="p-2 align-middle text-center font-bold">{batch.stock}</td>
             <td className="p-2 align-middle">
                <div className="flex items-center justify-center gap-1">
                    <button onClick={handleSaveDetails} className="btn-success btn-sm disabled:opacity-50" disabled={!isChanged}>Save</button>
                    <button onClick={() => onDelete(batch.id)} className="btn-icon text-red-500 hover:bg-red-500/10 disabled:opacity-50" disabled={batch.stock > 0} title={batch.stock > 0 ? "Cannot delete while in stock" : "Delete empty record"} aria-label="Delete record"><IconTrash /></button>
                </div>
            </td>
        </tr>
    );
};

export const AddStockModal: React.FC<ManageStockModalProps> = ({ productType, existingBatches, onClose, onAddBatch, onUpdateBatchDetails, onDeleteBatch }) => {
    const { suppliers } = useMasterData();
    const { addToast } = useToast();
    const mostRecentBatch = useMemo(() => {
        return [...existingBatches].sort((a,b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];
    }, [existingBatches]);

    const firmId = sharedInventoryFirmId();

    const [newBatchData, setNewBatchData] = useState({
        productTypeId: productType.id,
        type: 'New' as 'New' | 'Refurbished',
        serialNumber: '',
        batchNumber: '',
        purchaseDate: new Date().toISOString().split('T')[0],
        purchasePrice: mostRecentBatch?.purchasePrice.toString() || '',
        mrp: mostRecentBatch?.mrp.toString() || '',
        supplierId: '',
    });
    const [addedCount, setAddedCount] = useState(0);
    
    const [supplierSearch, setSupplierSearch] = useState('');
    const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

    useEffect(() => {
        if (mostRecentBatch) {
            setNewBatchData(prev => ({
                ...prev,
                purchasePrice: mostRecentBatch.purchasePrice.toString(),
                mrp: mostRecentBatch.mrp.toString(),
            }));
        }
    }, [mostRecentBatch]);

    const filteredSuppliers = useMemo(() => {
        if (!supplierSearch) return suppliers;
        return suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()));
    }, [suppliers, supplierSearch]);

    const handleSelectSupplier = (supplier: any) => {
        setNewBatchData(prev => ({ ...prev, supplierId: supplier.id }));
        setSupplierSearch(supplier.name);
        setShowSupplierDropdown(false);
    };

    const handleNewBatchInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setNewBatchData(prev => ({ ...prev, [name]: value }));
    };

    const handleNewBatchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const serial = newBatchData.serialNumber.trim();
        if (!serial) {
            addToast('Enter the battery serial number.', 'warning');
            return;
        }
        const added = onAddBatch({
            ...newBatchData,
            firmId,
            purchasePrice: parseFloat(newBatchData.purchasePrice),
            mrp: parseFloat(newBatchData.mrp),
            stock: 1,
        });
        if (!added) return;
        setAddedCount(c => c + 1);
        setNewBatchData(prev => ({
            ...prev,
            serialNumber: '',
            batchNumber: '',
        }));
    };

    const inStockSerials = useMemo(
        () => existingBatches.filter(b => b.stock > 0 && b.serialNumber).length,
        [existingBatches]
    );

    return (
        <Modal onClose={onClose} size="xl" ariaLabel="Manage Stock">
            <ModalHeader title={`Manage Stock: ${productType.brandName} ${productType.name}`} onClose={onClose} />

                <main className="p-6 space-y-6 flex-1 overflow-y-auto max-h-[70vh]">
                    {existingBatches.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-text-primary">In Stock ({inStockSerials})</h3>
                                {addedCount > 0 && (
                                    <span className="text-sm text-green-600 font-medium">{addedCount} added this session</span>
                                )}
                            </div>
                            <div className="max-h-64 overflow-y-auto border border-border-color rounded-lg">
                                <table className="w-full text-sm">
                                    <thead className="text-xs text-text-muted uppercase bg-bg-tertiary sticky top-0">
                                        <tr>
                                            <th className="p-2 text-left">Serial No.</th>
                                            <th className="p-2 text-left">Purchased</th>
                                            <th className="p-2 text-left">Batch No.</th>
                                            <th className="p-2 text-right">Dealer Price</th>
                                            <th className="p-2 text-right">MRP</th>
                                            <th className="p-2 text-center">Stock</th>
                                            <th className="p-2 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {existingBatches.map(batch => (
                                            <ExistingBatchRow
                                                key={batch.id}
                                                batch={batch}
                                                onUpdateDetails={onUpdateBatchDetails}
                                                onDelete={onDeleteBatch}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div>
                        <h3 className="font-bold text-text-primary mb-1">Add Battery by Serial</h3>
                        <p className="text-sm text-text-muted mb-3">Each battery is tracked individually by its serial number.</p>
                        <form onSubmit={handleNewBatchSubmit} className="space-y-4 p-4 border border-border-color rounded-lg bg-bg-primary/50">
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-text-muted mb-1">Purchase Date</label>
                                    <input type="date" name="purchaseDate" value={newBatchData.purchaseDate} onChange={handleNewBatchInputChange} className="form-input" required />
                                </div>
                                <div className="relative">
                                    <label className="block text-xs font-medium text-text-muted mb-1">Supplier (Optional)</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Search Supplier..."
                                            value={supplierSearch}
                                            onChange={(e) => {
                                                setSupplierSearch(e.target.value);
                                                setShowSupplierDropdown(true);
                                                if(newBatchData.supplierId) setNewBatchData(prev => ({...prev, supplierId: ''}));
                                            }}
                                            onFocus={() => setShowSupplierDropdown(true)}
                                            onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                                            className="form-input pr-8"
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
                                    <label className="block text-xs font-medium text-text-muted mb-1">Batch Number</label>
                                    <input type="text" name="batchNumber" placeholder="Optional" value={newBatchData.batchNumber} onChange={handleNewBatchInputChange} className="form-input" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-text-muted mb-1">Type</label>
                                    <select name="type" value={newBatchData.type} onChange={handleNewBatchInputChange} className="form-input">
                                        <option value="New">New</option>
                                        <option value="Refurbished">Refurbished</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-text-muted mb-1">Serial Number *</label>
                                    <input type="text" name="serialNumber" placeholder="Scan or enter serial" value={newBatchData.serialNumber} onChange={handleNewBatchInputChange} className="form-input font-mono" required autoFocus />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-text-muted mb-1">Dealer Price (Cost)</label>
                                    <input type="number" name="purchasePrice" placeholder="e.g., 11500" value={newBatchData.purchasePrice} onChange={handleNewBatchInputChange} className="form-input" required />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-text-muted mb-1">MRP</label>
                                    <input type="number" name="mrp" placeholder="e.g., 14500" value={newBatchData.mrp} onChange={handleNewBatchInputChange} className="form-input" required />
                                </div>
                            </div>
                             <div className="flex justify-end pt-2">
                                <button type="submit" className="btn-primary"><IconPlus className="h-4 w-4"/> Add Battery</button>
                            </div>
                        </form>
                    </div>
                </main>
                <ModalFooter>
                    <button type="button" onClick={onClose} className="btn-primary ml-auto">Done</button>
                </ModalFooter>
        </Modal>
    );
};
