import React, { useState } from 'react';
import { InventoryItem, ProductType } from '../types.ts';
import { useAppData } from '../context/AppDataContext.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { isSerialTrackedItem } from '../utils/serialNumbers.ts';

interface StockAdjustmentModalProps {
    item: InventoryItem;
    productType: ProductType;
    onClose: () => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({ item, productType, onClose }) => {
    const { adjustStock } = useAppData();
    const { addToast } = useToast();
    const serialTracked = isSerialTrackedItem(item);
    const [newQuantity, setNewQuantity] = useState(item.stock.toString());
    const [reason, setReason] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!reason.trim()) {
            addToast('A reason for the adjustment is required.', 'warning');
            return;
        }
        const qty = parseInt(newQuantity, 10);
        if (serialTracked && qty > 1) {
            addToast('Serial-tracked batteries can only be in stock (1) or sold (0).', 'warning');
            return;
        }
        adjustStock(item.id, qty, reason);
        onClose();
    };

    return (
        <Modal onClose={onClose} size="md" ariaLabel="Adjust Stock">
            <ModalHeader title="Adjust Stock" onClose={onClose} />
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                    <p className="font-bold text-text-primary">{productType.brandName} {productType.name}</p>
                    {item.serialNumber && (
                        <p className="text-sm font-mono text-text-muted mt-1">Serial: {item.serialNumber}</p>
                    )}
                    <p className="text-sm text-text-secondary">Current Stock: {item.stock}</p>
                </div>
                <div className="form-group">
                    <label htmlFor="newQuantity">New Stock Quantity</label>
                    {serialTracked ? (
                        <select
                            id="newQuantity"
                            value={newQuantity}
                            onChange={(e) => setNewQuantity(e.target.value)}
                            className="form-input"
                            required
                        >
                            <option value="1">1 — In stock</option>
                            <option value="0">0 — Sold / missing</option>
                        </select>
                    ) : (
                        <input
                            id="newQuantity"
                            type="number"
                            value={newQuantity}
                            onChange={(e) => setNewQuantity(e.target.value)}
                            className="form-input"
                            required
                            min="0"
                        />
                    )}
                </div>
                <div className="form-group">
                    <label htmlFor="reason">Reason for Adjustment</label>
                    <input
                        id="reason"
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="form-input"
                        placeholder="e.g., Stock count correction, Damaged item"
                        required
                    />
                </div>
                <ModalFooter>
                    <div className="flex gap-3 ml-auto">
                        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                        <button type="submit" className="btn-primary">Save Adjustment</button>
                    </div>
                </ModalFooter>
            </form>
        </Modal>
    );
};
