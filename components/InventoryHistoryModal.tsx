
import React, { useMemo } from 'react';
import { InventoryItem, ProductType } from '../types.ts';
import { useAppData } from '../context/AppDataContext.tsx';
import { EmptyState } from './EmptyState.tsx';
import { IconBox } from './icons.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';

interface InventoryHistoryModalProps {
    item: InventoryItem;
    productType: ProductType;
    onClose: () => void;
}

export const InventoryHistoryModal: React.FC<InventoryHistoryModalProps> = ({ item, productType, onClose }) => {
    const { inventoryLogs } = useAppData();

    const itemLogs = useMemo(() => {
        return inventoryLogs
            .filter(log => log.inventoryItemId === item.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [inventoryLogs, item.id]);

    return (
        <Modal onClose={onClose} size="lg" ariaLabel="Stock History">
            <ModalHeader title="Stock History" onClose={onClose} />
            <div className="p-6 space-y-4 flex-1 overflow-y-auto max-h-[60vh]">
                <div>
                    <p className="font-bold text-text-primary">{productType.brandName} {productType.name}</p>
                    <p className="text-sm text-text-secondary">Batch purchased on {new Date(item.purchaseDate).toLocaleDateString()}</p>
                </div>
                {itemLogs.length > 0 ? (
                    <div className="table-wrap">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-text-muted uppercase bg-bg-tertiary">
                                <tr>
                                    <th className="p-2">Date</th>
                                    <th className="p-2">Reason</th>
                                    <th className="p-2 text-center">Change</th>
                                    <th className="p-2 text-center">New Quantity</th>
                                </tr>
                            </thead>
                            <tbody>
                                {itemLogs.map(log => (
                                    <tr key={log.id} className="border-b border-border-color">
                                        <td className="p-2 text-text-secondary whitespace-nowrap">{new Date(log.date).toLocaleString()}</td>
                                        <td className="p-2 text-text-primary">{log.reason}{log.referenceId && <span className="text-xs text-text-muted ml-2">({log.referenceId})</span>}</td>
                                        <td className={`p-2 text-center font-bold ${log.change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            {log.change > 0 ? `+${log.change}` : log.change}
                                        </td>
                                        <td className="p-2 text-center font-bold text-text-primary">{log.newQuantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <EmptyState icon={<IconBox />} title="No History" message="No stock movements recorded for this batch yet." />
                )}
            </div>
            <ModalFooter>
                <button type="button" onClick={onClose} className="btn-secondary ml-auto">Close</button>
            </ModalFooter>
        </Modal>
    );
};
