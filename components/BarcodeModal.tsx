import React, { useRef, useEffect } from 'react';
import JsBarcode from 'jsbarcode';
import { InventoryItem } from '../types.ts';
import { IconPrint } from './icons.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';

interface BarcodeModalProps {
    batch: InventoryItem;
    productName: string;
    sku?: string;
    onClose: () => void;
}

export const BarcodeModal: React.FC<BarcodeModalProps> = ({ batch, productName, sku, onClose }) => {
    const { defaultFirm } = useConfig();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const code = batch.serialNumber || batch.batchNumber || batch.id;
    const displaySku = sku || batch.batchNumber || batch.id;

    useEffect(() => {
        if (canvasRef.current && code) {
            try {
                JsBarcode(canvasRef.current, code, {
                    format: 'CODE128',
                    lineColor: '#000',
                    width: 2,
                    height: 50,
                    displayValue: true,
                    margin: 4,
                });
            } catch (e) {
                console.error('Barcode generation failed', e);
            }
        }
    }, [code]);

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow || !canvasRef.current) return;

        const dataUrl = canvasRef.current.toDataURL();
        const count = batch.stock > 0 ? batch.stock : 1;
        const sym = defaultFirm?.financials.currencySymbol || '₹';

        let labelsHtml = '';
        for (let i = 0; i < count; i++) {
            labelsHtml += `
                <div class="label">
                    <div class="product-name">${productName}</div>
                    <div class="sku">SKU: ${displaySku}</div>
                    <img src="${dataUrl}" alt="barcode" />
                    <div class="price">MRP: ${sym}${batch.mrp.toLocaleString('en-IN')}</div>
                </div>`;
        }

        printWindow.document.write(`<!DOCTYPE html><html><head><title>Print Labels</title>
            <style>
                body { font-family: sans-serif; margin: 0; }
                .label-container { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 10px; }
                .label { border: 1px dashed #ccc; padding: 10px; text-align: center; page-break-inside: avoid; }
                .product-name { font-size: 11px; font-weight: bold; margin-bottom: 2px; }
                .sku { font-size: 9px; color: #666; margin-bottom: 4px; }
                .price { font-size: 13px; font-weight: bold; margin-top: 4px; }
                img { max-width: 100%; height: auto; }
                @media print { .label { border: none; } }
            </style></head><body>
            <div class="label-container">${labelsHtml}</div>
            </body></html>`);
        printWindow.document.close();
        printWindow.onload = () => printWindow.print();
    };

    return (
        <Modal onClose={onClose} size="md" ariaLabel="Barcode Label Generator">
            <ModalHeader title="Barcode / Label Generator" onClose={onClose} />
            <div className="p-6 flex flex-col items-center justify-center space-y-4">
                <p className="font-semibold text-text-primary text-center">{productName}</p>
                <p className="text-xs text-text-muted">SKU: {displaySku}</p>
                <div className="p-4 bg-white rounded border border-gray-200">
                    <canvas ref={canvasRef} />
                </div>
                <p className="text-sm text-text-muted text-center">
                    Code: {code}<br />
                    Stock to print: <strong>{batch.stock}</strong> label(s)
                </p>
            </div>
            <ModalFooter>
                <div className="flex gap-3 ml-auto">
                    <button type="button" onClick={onClose} className="btn-secondary">Close</button>
                    <button type="button" onClick={handlePrint} className="btn-primary">
                        <IconPrint className="h-4 w-4" /> Print Labels
                    </button>
                </div>
            </ModalFooter>
        </Modal>
    );
};
