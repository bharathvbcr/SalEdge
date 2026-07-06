import { Page } from '../types.ts';

export type QuickNavAction = {
    id: string;
    label: string;
    hint?: string;
    page?: Page;
    action?: () => void;
    keywords?: string[];
    adminOnly?: boolean;
};

export const ADMIN_QUICK_ACTIONS: Omit<QuickNavAction, 'action'>[] = [
    {
        id: 'log-expense',
        label: 'Log Expense',
        hint: 'Open expense form',
        keywords: ['expense', 'cost', 'rent', 'utilities', 'withdraw'],
        adminOnly: true,
    },
    {
        id: 'make-payment',
        label: 'Make Payment',
        hint: 'Money out to supplier',
        keywords: ['payment', 'withdraw', 'pay', 'supplier', 'bank'],
        adminOnly: true,
    },
    {
        id: 'receive-money',
        label: 'Receive Money',
        hint: 'Money in from customer',
        keywords: ['receive', 'receipt', 'collection', 'customer'],
        adminOnly: true,
    },
    {
        id: 'new-purchase',
        label: 'New Purchase',
        hint: 'Vendor purchase entry',
        keywords: ['purchase', 'vendor', 'buy'],
        adminOnly: true,
    },
    {
        id: 'reports-month',
        label: 'Reports (This Month)',
        hint: 'Monthly analytics',
        keywords: ['reports', 'analytics', 'month'],
        adminOnly: true,
    },
];

export const QUICK_NAV_PAGES: { page: Page; label: string; keywords: string[] }[] = [
    { page: 'Dashboard', label: 'Dashboard', keywords: ['home', 'overview'] },
    { page: 'Sales', label: 'Sales & Billing', keywords: ['invoice', 'bill', 'billing'] },
    { page: 'Products', label: 'Products & Inventory', keywords: ['stock', 'inventory', 'batteries'] },
    { page: 'Mobile', label: 'Mobile Scanner', keywords: ['scan', 'barcode', 'phone'] },
    { page: 'Charging Services', label: 'Charging & Services', keywords: ['service', 'repair', 'job'] },
    { page: 'Customers', label: 'Customers', keywords: ['client', 'buyer'] },
    { page: 'Warranty', label: 'Warranty Check', keywords: ['guarantee', 'serial'] },
    { page: 'Purchases', label: 'Purchases', keywords: ['vendor', 'supplier', 'bill'] },
    { page: 'Expenses', label: 'Expenses', keywords: ['cost'] },
    { page: 'Banking', label: 'Banking', keywords: ['bank', 'cash'] },
    { page: 'Reports', label: 'Reports', keywords: ['analytics'] },
    { page: 'Settings', label: 'Settings', keywords: ['config', 'preferences'] },
];

export function filterQuickNavItems(items: QuickNavAction[], query: string): QuickNavAction[] {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(item => {
        if (item.label.toLowerCase().includes(q)) return true;
        if (item.hint?.toLowerCase().includes(q)) return true;
        return item.keywords?.some(k => k.includes(q) || q.includes(k));
    });
}
