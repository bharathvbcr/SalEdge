import React, { useState } from 'react';
import { Expense, PaymentMethod } from '../types.ts';
import { useConfig } from '../context/ConfigContext.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';
import { FormField } from './FormField.tsx';
import type { ExpenseFormPrefill } from '../utils/pageActions.ts';

interface ExpenseFormProps {
    expense?: Expense | null;
    initialData?: ExpenseFormPrefill;
    onSave: (data: Omit<Expense, 'id'> | Expense) => void;
    onClose: () => void;
}

function toDateInputValue(date?: string): string {
    if (date) {
        const parsed = new Date(date);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    }
    return new Date().toISOString().split('T')[0];
}

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ expense, initialData, onSave, onClose }) => {
    const { defaultFirm } = useConfig();
    const [formData, setFormData] = useState({
        date: toDateInputValue(expense?.date ?? initialData?.date),
        category: expense?.category || initialData?.category || 'Other',
        description: expense?.description || initialData?.description || '',
        amount: expense?.amount ?? initialData?.amount ?? '',
        method: (expense?.method || initialData?.method || 'Cash') as PaymentMethod,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const saveData = {
            date: new Date(formData.date).toISOString(),
            category: formData.category as Expense['category'],
            description: formData.description,
            amount: Number(formData.amount),
            method: formData.method,
        };
        onSave(expense ? { ...saveData, id: expense.id } : saveData);
    };

    const categories: Expense['category'][] = ['Rent', 'Salaries', 'Utilities', 'Marketing', 'Supplies', 'Other'];

    const paymentMethods: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

    return (
        <Modal onClose={onClose} size="md" ariaLabel={expense ? 'Edit Expense' : 'Log New Expense'}>
            <ModalHeader title={expense ? 'Edit Expense' : 'Log New Expense'} onClose={onClose} />
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField label="Date">
                        <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="form-input" required />
                    </FormField>
                    <FormField label="Category">
                        <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as Expense['category'] })} className="form-input" required>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </FormField>
                </div>
                <FormField label="Description">
                    <input type="text" placeholder="e.g., Monthly Shop Rent" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="form-input" required />
                </FormField>
                <FormField label={`Amount (${defaultFirm?.financials.currencySymbol || '₹'})`}>
                    <input type="number" placeholder="0.00" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} className="form-input" required min="0" step="0.01" />
                </FormField>
                <FormField label="Payment Method">
                    <select value={formData.method} onChange={e => setFormData({ ...formData, method: e.target.value as PaymentMethod })} className="form-input" required>
                        {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </FormField>
                <ModalFooter>
                    <div className="flex gap-3 ml-auto">
                        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                        <button type="submit" className="btn-primary">Save Expense</button>
                    </div>
                </ModalFooter>
            </form>
        </Modal>
    );
};
