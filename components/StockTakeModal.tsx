import React, { useState, useMemo } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';
import { ConfirmationModal } from './ConfirmationModal.tsx';

import { isSerialTrackedItem } from '../utils/serialNumbers.ts';

interface StockTakeModalProps {
    firmId: string;
    onClose: () => void;
}

export const StockTakeModal: React.FC<StockTakeModalProps> = ({ firmId, onClose }) => {
    const { inventory, performStockTake } = useAppData();
    const { productTypes } = useMasterData();
    const { config } = useConfig();

    const firmInventory = useMemo(
        () => inventory.filter(i => i.firmId === firmId && i.stock >= 0),
        [inventory, firmId]
    );

    const [counts, setCounts] = useState<Record<string, string>>(() =>
        Object.fromEntries(firmInventory.map(i => [i.id, i.stock.toString()]))
    );
    const [search, setSearch] = useState('');
    const [confirmState, setConfirmState] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
    } | null>(null);

    const firmName = config.firms.find(f => f.id === firmId)?.shopDetails.name || 'Firm';

    const rows = useMemo(() => {
        return firmInventory
            .map(item => {
                const pt = productTypes.find(p => p.id === item.productTypeId);
                const name = pt ? `${pt.brandName} ${pt.name}` : 'Unknown';
                const counted = parseInt(counts[item.id] ?? item.stock.toString(), 10);
                const variance = (isNaN(counted) ? item.stock : counted) - item.stock;
                return { item, name, counted: isNaN(counted) ? item.stock : counted, variance };
            })
            .filter(row => {
                if (!search) return true;
                const q = search.toLowerCase();
                return (
                    row.name.toLowerCase().includes(q) ||
                    row.item.serialNumber?.toLowerCase().includes(q) ||
                    row.item.batchNumber?.toLowerCase().includes(q)
                );
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [firmInventory, productTypes, counts, search]);

    const varianceCount = rows.filter(r => r.variance !== 0).length;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const adjustments = rows
            .filter(r => r.variance !== 0)
            .map(r => ({ inventoryItemId: r.item.id, countedQty: r.counted }));

        if (adjustments.length === 0) {
            setConfirmState({
                title: 'No Variances',
                message: 'No variances found. Close stock take?',
                onConfirm: onClose,
            });
            return;
        }

        setConfirmState({
            title: 'Apply Adjustments',
            message: `Apply ${adjustments.length} stock adjustment(s)?`,
            onConfirm: () => {
                performStockTake(firmId, adjustments);
                onClose();
            },
        });
    };

    return (
        <>
        <Modal onClose={onClose} size="xl" ariaLabel="Stock Take">
            <ModalHeader
                title="Stock Take / Cycle Count"
                subtitle={`${firmName} — enter physical counts`}
                onClose={onClose}
            />

                <div className="p-4 border-b border-border-color">
                    <input
                        type="text"
                        placeholder="Filter by product, serial, batch..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="form-input"
                    />
                    {varianceCount > 0 && (
                        <p className="text-sm text-orange-600 mt-2 font-medium">{varianceCount} variance(s) detected</p>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="sticky top-0 bg-bg-tertiary text-text-muted font-semibold">
                                <tr>
                                    <th className="p-3">Product</th>
                                    <th className="p-3">Serial / Batch</th>
                                    <th className="p-3 text-center">System Qty</th>
                                    <th className="p-3 text-center">Counted Qty</th>
                                    <th className="p-3 text-center">Variance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-text-muted">No inventory batches for this firm.</td>
                                    </tr>
                                ) : rows.map(({ item, name, counted, variance }) => (
                                    <tr key={item.id} className={`border-b border-border-color ${variance !== 0 ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}>
                                        <td className="p-3 font-medium text-text-primary">{name}</td>
                                        <td className="p-3 text-text-muted text-xs">
                                            {item.serialNumber || item.batchNumber || '—'}
                                        </td>
                                        <td className="p-3 text-center font-mono">{item.stock}</td>
                                        <td className="p-3 text-center">
                                            <input
                                                type="number"
                                                min="0"
                                                max={isSerialTrackedItem(item) ? 1 : undefined}
                                                value={counts[item.id] ?? item.stock.toString()}
                                                onChange={e => setCounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                className="form-input w-20 text-center mx-auto"
                                            />
                                        </td>
                                        <td className={`p-3 text-center font-bold ${variance > 0 ? 'text-green-600' : variance < 0 ? 'text-red-600' : 'text-text-muted'}`}>
                                            {variance > 0 ? `+${variance}` : variance}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <ModalFooter>
                        <p className="text-sm text-text-muted">{rows.length} batch(es) • {varianceCount} variance(s)</p>
                        <div className="flex gap-3 ml-auto">
                            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                            <button type="submit" className="btn-primary">Complete Stock Take</button>
                        </div>
                    </ModalFooter>
                </form>
        </Modal>

        {confirmState && (
            <ConfirmationModal
                title={confirmState.title}
                message={confirmState.message}
                confirmText="Confirm"
                variant="default"
                onConfirm={() => { confirmState.onConfirm(); setConfirmState(null); }}
                onCancel={() => setConfirmState(null)}
            />
        )}
        </>
    );
};
