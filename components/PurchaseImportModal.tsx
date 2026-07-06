import React, { useRef, useState, useMemo } from 'react';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { useAppData } from '../context/AppDataContext.tsx';
import {
    parsePurchaseCsv,
    parsePurchaseJson,
    purchaseCsvTemplate,
    findDuplicatePurchases,
    ParsedPurchaseDraft,
} from '../utils/purchaseImport.ts';
import { purchaseJsonTemplate } from '../utils/purchaseExport.ts';
import { IconDownload } from './icons.tsx';

interface PurchaseImportModalProps {
    format: 'csv' | 'json';
    onClose: () => void;
}

export const PurchaseImportModal: React.FC<PurchaseImportModalProps> = ({ format, onClose }) => {
    const { suppliers, productTypes } = useMasterData();
    const { config } = useConfig();
    const { importPurchases, purchases } = useAppData();
    const { addToast } = useToast();
    const fileRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<ParsedPurchaseDraft[]>([]);
    const [errors, setErrors] = useState<string[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [fileName, setFileName] = useState('');
    const [skipDuplicates, setSkipDuplicates] = useState(true);

    const ctx = {
        suppliers,
        productTypes,
        defaultFirmId: config.preferences.defaultFirmId || config.firms[0]?.id || '',
    };

    const duplicates = useMemo(
        () => findDuplicatePurchases(preview, purchases),
        [preview, purchases],
    );

    const importable = useMemo(() => {
        if (!skipDuplicates || duplicates.length === 0) return preview;
        const dupKeys = new Set(duplicates.map(d =>
            `${d.draft.firmId}::${d.draft.supplierId}::${d.draft.supplierInvoiceNumber.toLowerCase()}`
        ));
        return preview.filter(p =>
            !dupKeys.has(`${p.firmId}::${p.supplierId}::${p.supplierInvoiceNumber.toLowerCase()}`)
        );
    }, [preview, duplicates, skipDuplicates]);

    const handleFile = (file: File) => {
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = () => {
            const text = reader.result;
            if (typeof text !== 'string') {
                addToast('Could not read file.', 'error');
                return;
            }
            const result = format === 'csv' ? parsePurchaseCsv(text, ctx) : parsePurchaseJson(text, ctx);
            setPreview(result.purchases);
            setErrors(result.errors);
            setWarnings(result.warnings);
        };
        reader.readAsText(file);
    };

    const handleImport = () => {
        if (importable.length === 0) {
            addToast(skipDuplicates && duplicates.length > 0
                ? 'All bills are duplicates of existing purchases.'
                : 'No valid purchases to import.', 'warning');
            return;
        }
        importPurchases(importable);
        onClose();
    };

    const downloadTemplate = () => {
        const content = format === 'csv' ? purchaseCsvTemplate() : purchaseJsonTemplate();
        const mime = format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json';
        const filename = format === 'csv' ? 'purchase-import-template.csv' : 'purchase-import-template.json';
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Modal onClose={onClose} size="lg" ariaLabel={`Import purchases from ${format.toUpperCase()}`}>
            <ModalHeader title={`Import ${format.toUpperCase()}`} onClose={onClose} />
            <main className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <p className="text-sm text-text-muted">
                    {format === 'csv'
                        ? 'Upload a CSV with one row per line item. Rows sharing the same invoice number are grouped into one bill.'
                        : 'Upload a JSON file containing an array of purchases or { "purchases": [...] }.'}
                </p>

                <button type="button" onClick={downloadTemplate} className="btn-secondary btn-sm inline-flex items-center gap-2">
                    <IconDownload className="h-4 w-4" /> Download {format.toUpperCase()} template
                </button>

                <div className="border border-dashed border-border-color rounded-xl p-6 text-center">
                    <input
                        ref={fileRef}
                        type="file"
                        accept={format === 'csv' ? '.csv,text/csv' : '.json,application/json'}
                        className="hidden"
                        onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleFile(file);
                            e.target.value = '';
                        }}
                    />
                    <button type="button" onClick={() => fileRef.current?.click()} className="btn-primary">
                        Choose {format.toUpperCase()} file
                    </button>
                    {fileName && <p className="text-sm text-text-muted mt-2">{fileName}</p>}
                </div>

                {warnings.length > 0 && (
                    <div className="rounded-lg bg-status-yellow-bg text-status-yellow-text p-3 text-sm space-y-1">
                        {warnings.map(w => <p key={w}>{w}</p>)}
                    </div>
                )}

                {errors.length > 0 && (
                    <div className="rounded-lg bg-status-red-bg text-status-red-text p-3 text-sm space-y-1 max-h-32 overflow-y-auto">
                        {errors.map(err => <p key={err}>{err}</p>)}
                    </div>
                )}

                {duplicates.length > 0 && (
                    <div className="rounded-lg bg-status-yellow-bg text-status-yellow-text p-3 text-sm space-y-2">
                        <p className="font-semibold">{duplicates.length} bill{duplicates.length === 1 ? '' : 's'} already exist (same firm, supplier, invoice #).</p>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} />
                            Skip duplicate bills on import
                        </label>
                        <ul className="space-y-1 max-h-24 overflow-y-auto">
                            {duplicates.map(d => (
                                <li key={d.existingId}>{d.draft.supplierInvoiceNumber}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {preview.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="font-semibold text-text-primary">
                            Ready to import ({importable.length}{skipDuplicates && duplicates.length > 0 ? ` of ${preview.length}` : ''})
                        </h4>
                        <ul className="text-sm text-text-secondary space-y-1 max-h-40 overflow-y-auto">
                            {importable.map((p, idx) => {
                                const supplier = suppliers.find(s => s.id === p.supplierId);
                                return (
                                    <li key={`${p.supplierInvoiceNumber}-${idx}`} className="bg-bg-tertiary rounded-lg px-3 py-2">
                                        <span className="font-medium text-text-primary">{p.supplierInvoiceNumber}</span>
                                        {' · '}{supplier?.name || 'Unknown supplier'}
                                        {' · '}{p.items.length} item{p.items.length === 1 ? '' : 's'}
                                        {' · '}{p.totalAmount.toFixed(2)}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </main>
            <ModalFooter>
                <div className="flex gap-3 ml-auto">
                    <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                    <button type="button" onClick={handleImport} disabled={importable.length === 0} className="btn-primary">
                        Import {importable.length > 0 ? importable.length : ''} Bill{importable.length === 1 ? '' : 's'}
                    </button>
                </div>
            </ModalFooter>
        </Modal>
    );
};
