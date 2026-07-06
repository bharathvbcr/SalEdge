import React, { useEffect, useMemo, useState } from 'react';
import { ProductType } from '../../types.ts';
import { getProductName } from '../../utils/inventoryLookup.ts';
import { IconPlus, IconX } from '../icons.tsx';

export interface NewModelDraft {
    brandName: string;
    name: string;
    category: string;
    capacity: string;
    voltage: string;
}

interface MobileModelPickerSheetProps {
    serial: string;
    productTypes: ProductType[];
    categories: string[];
    onSelect: (productId: string) => void;
    onCreateModel: (data: Omit<ProductType, 'id'>) => void;
    onClose: () => void;
}

export const MobileModelPickerSheet: React.FC<MobileModelPickerSheetProps> = ({
    serial,
    productTypes,
    categories,
    onSelect,
    onCreateModel,
    onClose,
}) => {
    const [search, setSearch] = useState('');
    const [showNewForm, setShowNewForm] = useState(productTypes.length === 0);
    const [formError, setFormError] = useState('');
    const [draft, setDraft] = useState<NewModelDraft>({
        brandName: '',
        name: '',
        category: categories[0] ?? 'Other',
        capacity: '',
        voltage: '12V',
    });

    useEffect(() => {
        if (productTypes.length === 0) setShowNewForm(true);
    }, [productTypes.length]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return productTypes;
        return productTypes.filter(pt => getProductName(pt).toLowerCase().includes(q));
    }, [productTypes, search]);

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (!draft.brandName.trim() || !draft.name.trim() || !draft.capacity.trim()) {
            setFormError('Brand, model name, and capacity are required.');
            return;
        }
        onCreateModel({
            brandName: draft.brandName.trim(),
            name: draft.name.trim(),
            category: draft.category,
            specifications: {
                capacity: draft.capacity.trim(),
                voltage: draft.voltage.trim() || '12V',
                technology: 'Tubular',
                cRating: 'C20',
            },
            lowStockThreshold: 5,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
            <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Close" />
            <div className="relative bg-bg-secondary rounded-t-2xl border-t border-border-color shadow-2xl max-h-[85vh] flex flex-col safe-bottom animate-slide-up">
                <div className="flex items-start justify-between gap-3 p-4 border-b border-border-color">
                    <div className="min-w-0">
                        <h3 className="font-bold text-text-primary">Which model?</h3>
                        <p className="text-xs text-text-muted mt-0.5">
                            Serial · {productTypes.length === 0 ? 'No models yet — create one' : `${productTypes.length} model${productTypes.length === 1 ? '' : 's'}`}
                        </p>
                        <p className="font-mono text-sm font-medium truncate">{serial}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-lg bg-bg-tertiary flex-shrink-0" aria-label="Close">
                        <IconX className="h-5 w-5" />
                    </button>
                </div>

                {!showNewForm ? (
                    <>
                        <div className="p-4 pb-2">
                            <input
                                type="search"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search models..."
                                className="form-input"
                                autoFocus
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowNewForm(true)}
                            className="mx-4 mb-2 flex items-center gap-2 w-[calc(100%-2rem)] btn-outline py-3 text-sm"
                        >
                            <IconPlus className="h-4 w-4" /> Add new model
                        </button>
                        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
                            {productTypes.length === 0 ? (
                                <p className="text-sm text-text-muted text-center py-4">No product models yet. Use the form below to create the first one.</p>
                            ) : filtered.length === 0 ? (
                                <p className="text-sm text-text-muted text-center py-6">No models match &ldquo;{search.trim()}&rdquo;. Add a new one above.</p>
                            ) : (
                                filtered.map(pt => (
                                    <button
                                        key={pt.id}
                                        type="button"
                                        onClick={() => onSelect(pt.id)}
                                        className="w-full text-left p-3 rounded-xl bg-bg-tertiary active:bg-brand-red/10 border border-transparent active:border-brand-red/20 transition-colors min-h-[52px] touch-manipulation"
                                    >
                                        <p className="font-semibold text-text-primary text-sm">{getProductName(pt)}</p>
                                        <p className="text-xs text-text-muted mt-0.5">
                                            {pt.specifications.capacity} · {pt.specifications.voltage}
                                            {pt.category ? ` · ${pt.category}` : ''}
                                        </p>
                                    </button>
                                ))
                            )}
                        </div>
                    </>
                ) : (
                    <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-4 space-y-3">
                        <button type="button" onClick={() => setShowNewForm(false)} className="text-sm text-brand-red font-medium">
                            ← Back to model list
                        </button>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-text-muted mb-1">Brand *</label>
                                <input
                                    type="text"
                                    value={draft.brandName}
                                    onChange={e => setDraft(d => ({ ...d, brandName: e.target.value }))}
                                    className="form-input"
                                    placeholder="Amaron"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-text-muted mb-1">Category</label>
                                <select
                                    value={draft.category}
                                    onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                                    className="form-input"
                                >
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-text-muted mb-1">Model name *</label>
                            <input
                                type="text"
                                value={draft.name}
                                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                                className="form-input"
                                placeholder="150Ah Tubular"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-text-muted mb-1">Capacity *</label>
                                <input
                                    type="text"
                                    value={draft.capacity}
                                    onChange={e => setDraft(d => ({ ...d, capacity: e.target.value }))}
                                    className="form-input"
                                    placeholder="150Ah"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-text-muted mb-1">Voltage</label>
                                <input
                                    type="text"
                                    value={draft.voltage}
                                    onChange={e => setDraft(d => ({ ...d, voltage: e.target.value }))}
                                    className="form-input"
                                    placeholder="12V"
                                />
                            </div>
                        </div>
                        {formError && (
                            <p className="text-sm text-status-red-text bg-status-red-bg/50 rounded-lg px-3 py-2">{formError}</p>
                        )}
                        <button
                            type="submit"
                            disabled={!draft.brandName.trim() || !draft.name.trim() || !draft.capacity.trim()}
                            className="w-full btn-primary py-3 disabled:opacity-50"
                        >
                            Save model & assign
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};
