import type {
    AiActionContext,
    Expense,
    ExpenseCategory,
    Page,
    PaymentMethod,
    Purchase,
    Supplier,
    Transaction,
    UserRole,
} from '../types.ts';
import { computeBalances } from './bankingBalances.ts';
import { QUICK_NAV_PAGES } from './quickNav.ts';
import { isPageAllowed } from './roleAccess.ts';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
    'Rent', 'Salaries', 'Utilities', 'Marketing', 'Supplies', 'Other',
];

const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Card', 'UPI', 'Bank Transfer'];

const EXAMPLE_UTTERANCES = [
    'Log ₹5000 rent expense in cash',
    'Pay supplier ₹10000 by UPI',
    'Receive ₹2000 from customer by cash',
    'Show low stock batteries',
    'Open reports for this month',
    'Start a new service job',
];

function buildCustomerParties(transactions: Transaction[]) {
    const unique = new Map<string, { type: 'Customer'; id: string; name: string }>();
    transactions.forEach(t => {
        if (t.customerName && t.customerName !== 'Walk-in') {
            const id = `${t.customerName}|${t.customerPhone || ''}`;
            if (!unique.has(id)) {
                unique.set(id, { type: 'Customer', id, name: t.customerName });
            }
        }
    });
    return Array.from(unique.values()).slice(0, 50);
}

export function buildAiActionContext(
    userRole: UserRole,
    defaultFirmId: string,
    transactions: Transaction[],
    expenses: Expense[],
    purchases: Purchase[],
    paymentVouchers: Parameters<typeof computeBalances>[3],
    suppliers: Supplier[],
): AiActionContext {
    const balances = computeBalances(transactions, expenses, purchases, paymentVouchers);
    const allowedPages: Page[] = QUICK_NAV_PAGES
        .map(p => p.page)
        .filter(page => isPageAllowed(userRole, page));

    const supplierParties = suppliers.slice(0, 50).map(s => ({
        type: 'Supplier' as const,
        id: s.id,
        name: s.name,
    }));

    return {
        allowedPages,
        expenseCategories: EXPENSE_CATEGORIES,
        paymentMethods: PAYMENT_METHODS,
        voucherMethods: PAYMENT_METHODS,
        parties: [...supplierParties, ...buildCustomerParties(transactions)],
        cashBalance: balances.cashBalance,
        bankBalance: balances.bankBalance,
        defaultFirmId,
        exampleUtterances: EXAMPLE_UTTERANCES,
    };
}
