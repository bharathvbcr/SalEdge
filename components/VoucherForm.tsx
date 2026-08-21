import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { PaymentVoucher } from '../types.ts';
import { IconChevronDown } from './icons.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { resolveParty } from '../utils/aiActions.ts';
import type { VoucherFormPrefill } from '../utils/pageActions.ts';

export const VoucherForm: React.FC<{
    type: 'Receipt' | 'Payment';
    initialData?: VoucherFormPrefill;
    onSave: (voucher: Omit<PaymentVoucher, 'id'>) => void;
    onClose: () => void;
}> = ({ type, initialData, onSave, onClose }) => {
    const { suppliers } = useMasterData();
    const { config } = useConfig();
    const { addToast } = useToast();
    const { transactions } = useAppData();

    const partyType = initialData?.partyType ?? (type === 'Receipt' ? 'Customer' : 'Supplier');
    const resolvedParty = useMemo(() => {
        if (!initialData?.partyName) return null;
        return resolveParty(partyType, initialData.partyName, suppliers, transactions);
    }, [initialData?.partyName, partyType, suppliers, transactions]);

    const [searchTerm, setSearchTerm] = useState(() => {
        if (resolvedParty) return resolvedParty.partyName;
        return initialData?.partyName ?? '';
    });
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchWrapperRef = useRef<HTMLDivElement>(null);

    const customerList = useMemo(() => {
        const unique = new Map<string, { name: string; phone: string }>();
        transactions.forEach(t => {
            if (t.customerName && t.customerName !== 'Walk-in') {
                const key = `${t.customerName}|${t.customerPhone}`;
                if (!unique.has(key)) unique.set(key, { name: t.customerName, phone: t.customerPhone });
            }
        });
        return Array.from(unique.values());
    }, [transactions]);

    const [formData, setFormData] = useState({
        date: initialData?.date ?? new Date().toISOString().split('T')[0],
        firmId: config.preferences.defaultFirmId,
        partyType,
        partyId: resolvedParty?.partyId ?? '',
        partyName: resolvedParty?.partyName ?? initialData?.partyName ?? '',
        amount: initialData?.amount != null ? String(initialData.amount) : '',
        method: initialData?.method ?? 'Cash',
        referenceNumber: initialData?.referenceNumber ?? '',
        notes: initialData?.notes ?? '',
    });

    const filteredParties = useMemo(() => {
        const query = searchTerm.toLowerCase();
        if (formData.partyType === 'Supplier') {
            return suppliers.filter(s => s.name.toLowerCase().includes(query));
        }
        return customerList.filter(c =>
            c.name.toLowerCase().includes(query) ||
            (c.phone && c.phone.includes(query)),
        );
    }, [searchTerm, formData.partyType, suppliers, customerList]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
                if (!formData.partyId) {
                    setSearchTerm('');
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [formData.partyId]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.partyId) {
            addToast(`Please select a valid ${formData.partyType}.`, 'warning');
            return;
        }
        onSave({
            ...formData,
            type,
            amount: Number(formData.amount),
            method: formData.method as PaymentVoucher['method'],
            partyType: formData.partyType as NonNullable<PaymentVoucher['partyType']>,
        });
        onClose();
    };

    const handleSelectParty = (party: { id?: string; name: string; phone?: string }) => {
        if (formData.partyType === 'Supplier') {
            setFormData({ ...formData, partyId: party.id!, partyName: party.name });
            setSearchTerm(party.name);
        } else {
            setFormData({ ...formData, partyId: `${party.name}|${party.phone}`, partyName: party.name });
            setSearchTerm(`${party.name} ${party.phone ? `(${party.phone})` : ''}`);
        }
        setShowSuggestions(false);
    };

    return (
        <Modal onClose={onClose} size="md" ariaLabel={type === 'Receipt' ? 'Receive Payment' : 'Make Payment'}>
            <ModalHeader title={type === 'Receipt' ? 'Receive Payment (Money In)' : 'Make Payment (Money Out)'} onClose={onClose} />
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-1">Date</label>
                        <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="form-input" required />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-1">Firm</label>
                        <select value={formData.firmId} onChange={e => setFormData({ ...formData, firmId: e.target.value })} className="form-input">
                            {config.firms.map(f => <option key={f.id} value={f.id}>{f.shopDetails.name}</option>)}
                        </select>
                    </div>
                </div>

                <div ref={searchWrapperRef} className="relative">
                    <label className="block text-xs font-medium text-text-muted mb-1">
                        {formData.partyType} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder={`Search ${formData.partyType}...`}
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setShowSuggestions(true);
                                if (formData.partyId) setFormData(prev => ({ ...prev, partyId: '', partyName: '' }));
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            className={`form-input pr-8 ${!formData.partyId && searchTerm ? 'border-yellow-500' : ''}`}
                            required
                        />
                        <IconChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
                    </div>

                    {showSuggestions && (
                        <ul className="absolute z-10 w-full bg-bg-secondary border border-border-color rounded-md mt-1 max-h-48 overflow-y-auto shadow-xl">
                            {filteredParties.length > 0 ? (
                                filteredParties.map((party) => {
                                    const supplierId = 'id' in party ? (party as { id: string }).id : undefined;
                                    const partyPhone = 'phone' in party ? (party as { phone?: string }).phone : undefined;
                                    const key = formData.partyType === 'Supplier'
                                        ? (supplierId ?? party.name)
                                        : `${party.name}|${partyPhone ?? ''}`;
                                    const display = formData.partyType === 'Supplier'
                                        ? party.name
                                        : `${party.name} (${partyPhone ?? ''})`;
                                    return (
                                        <li
                                            key={key}
                                            onClick={() => handleSelectParty(party as { id?: string; name: string; phone?: string })}
                                            className="px-4 py-2 hover:bg-bg-tertiary cursor-pointer text-sm text-text-primary"
                                        >
                                            {display}
                                        </li>
                                    );
                                })
                            ) : (
                                <li className="px-4 py-2 text-sm text-text-muted italic">
                                    No {formData.partyType.toLowerCase()}s found.
                                </li>
                            )}
                        </ul>
                    )}
                    {!formData.partyId && searchTerm && !showSuggestions && (
                        <p className="text-xs text-red-500 mt-1">Please select a valid {formData.partyType.toLowerCase()} from the list.</p>
                    )}
                </div>

                <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Amount <span className="text-red-500">*</span></label>
                    <input type="number" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} className="form-input text-lg font-bold" placeholder="0.00" required min="1" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-1">Method</label>
                        <select value={formData.method} onChange={e => setFormData({ ...formData, method: e.target.value as PaymentVoucher['method'] })} className="form-input">
                            <option value="Cash">Cash</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="UPI">UPI</option>
                            <option value="Card">Cheque</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-1">Ref No. (Optional)</label>
                        <input type="text" value={formData.referenceNumber} onChange={e => setFormData({ ...formData, referenceNumber: e.target.value })} className="form-input" placeholder="Cheque/Txn ID" />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Notes</label>
                    <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="form-input" rows={2} placeholder="e.g. Advance payment, Settling Oct bill" />
                </div>

                <ModalFooter>
                    <div className="flex gap-3 ml-auto">
                        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                        <button type="submit" className={type === 'Receipt' ? 'btn-success' : 'btn-danger'}>
                            Save {type}
                        </button>
                    </div>
                </ModalFooter>
            </form>
        </Modal>
    );
};
