import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Page, UserRole } from '../types.ts';
import { Modal } from './Modal.tsx';
import { filterQuickNavItems, QUICK_NAV_PAGES, QuickNavAction } from '../utils/quickNav.ts';
import { requestOpenSale } from '../utils/mobileSaleQueue.ts';
import {
    requestInventorySearch,
    requestOpenExpenseForm,
    requestOpenServiceJob,
    requestOpenVoucherForm,
    requestReportsFilter,
} from '../utils/pageActions.ts';
import { isPageAllowed } from '../utils/roleAccess.ts';

interface QuickNavPaletteProps {
    userRole: UserRole;
    onNavigate: (page: Page) => void;
    onClose: () => void;
}

export const QuickNavPalette: React.FC<QuickNavPaletteProps> = ({ userRole, onNavigate, onClose }) => {
    const [query, setQuery] = useState('');
    const [highlightIndex, setHighlightIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const items = useMemo(() => {
        const adminActions: QuickNavAction[] = userRole === 'admin' ? [
            {
                id: 'log-expense',
                label: 'Log Expense',
                hint: 'Open expense form',
                keywords: ['expense', 'cost', 'rent', 'utilities', 'withdraw'],
                action: () => { requestOpenExpenseForm(); onNavigate('Expenses'); },
            },
            {
                id: 'make-payment',
                label: 'Make Payment',
                hint: 'Money out to supplier',
                keywords: ['payment', 'withdraw', 'pay', 'supplier', 'bank'],
                action: () => { requestOpenVoucherForm('Payment'); onNavigate('Banking'); },
            },
            {
                id: 'receive-money',
                label: 'Receive Money',
                hint: 'Money in from customer',
                keywords: ['receive', 'receipt', 'collection', 'customer'],
                action: () => { requestOpenVoucherForm('Receipt'); onNavigate('Banking'); },
            },
            {
                id: 'new-purchase',
                label: 'New Purchase',
                hint: 'Vendor purchase entry',
                keywords: ['purchase', 'vendor', 'buy'],
                action: () => onNavigate('Purchases'),
            },
            {
                id: 'reports-month',
                label: 'Reports (This Month)',
                hint: 'Monthly analytics',
                keywords: ['reports', 'analytics', 'month'],
                action: () => { requestReportsFilter({ period: 'month' }); onNavigate('Reports'); },
            },
        ] : [];

        const actions: QuickNavAction[] = [
            {
                id: 'new-sale',
                label: 'New Sale',
                hint: 'Open billing form',
                keywords: ['sale', 'bill', 'invoice', 'create'],
                action: () => { requestOpenSale(); onNavigate('Sales'); },
            },
            {
                id: 'new-job',
                label: 'New Service Job',
                hint: 'Charging & repair',
                keywords: ['service', 'job', 'repair'],
                action: () => { requestOpenServiceJob(); onNavigate('Charging Services'); },
            },
            {
                id: 'scan',
                label: 'Open Mobile Scanner',
                hint: 'Scan batteries on phone',
                keywords: ['scan', 'barcode', 'mobile'],
                action: () => onNavigate('Mobile'),
            },
            {
                id: 'low-stock',
                label: 'View Low Stock',
                hint: 'Inventory filter',
                keywords: ['stock', 'low', 'inventory'],
                action: () => { requestInventorySearch({ lowStockOnly: true }); onNavigate('Products'); },
            },
            ...adminActions,
            ...QUICK_NAV_PAGES
                .filter(p => isPageAllowed(userRole, p.page))
                .map(p => ({
                    id: `page-${p.page}`,
                    label: p.label,
                    page: p.page,
                    keywords: p.keywords,
                })),
        ];
        return filterQuickNavItems(actions, query);
    }, [query, userRole, onNavigate]);

    useEffect(() => {
        setHighlightIndex(0);
    }, [query]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const runItem = (item: QuickNavAction) => {
        onClose();
        if (item.action) {
            item.action();
        } else if (item.page) {
            onNavigate(item.page);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(i => (i + 1) % Math.max(items.length, 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex(i => (i <= 0 ? items.length - 1 : i - 1));
        } else if (e.key === 'Enter' && items[highlightIndex]) {
            e.preventDefault();
            runItem(items[highlightIndex]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    return (
        <Modal onClose={onClose} size="md" ariaLabel="Quick navigation" overlayClassName="!z-[120]">
            <div className="p-4 border-b border-border-color">
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Jump to page or action..."
                    className="form-input w-full text-base"
                    autoComplete="off"
                />
                <p className="text-xs text-text-muted mt-2">↑↓ navigate · Enter select · Esc close · ⌘K / Ctrl+K</p>
            </div>
            <ul className="max-h-80 overflow-y-auto py-2">
                {items.length === 0 ? (
                    <li className="px-4 py-6 text-center text-text-muted text-sm">No matches</li>
                ) : items.map((item, i) => (
                    <li key={item.id}>
                        <button
                            type="button"
                            onMouseEnter={() => setHighlightIndex(i)}
                            onClick={() => runItem(item)}
                            className={`w-full text-left px-4 py-2.5 flex justify-between items-center gap-3 ${
                                i === highlightIndex ? 'bg-brand-red/10 text-brand-red' : 'hover:bg-bg-tertiary text-text-primary'
                            }`}
                        >
                            <span className="font-medium">{item.label}</span>
                            {item.hint && <span className="text-xs text-text-muted truncate">{item.hint}</span>}
                        </button>
                    </li>
                ))}
            </ul>
        </Modal>
    );
};
