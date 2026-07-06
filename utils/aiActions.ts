import type {
    AiChatAction,
    Expense,
    Page,
    PaymentVoucher,
    Supplier,
    Transaction,
} from '../types.ts';
import {
    requestInventorySearch,
    requestOpenExpenseForm,
    requestOpenServiceJob,
    requestOpenVoucherForm,
    requestReportsFilter,
    requestSaleCustomerPrefill,
    requestViewReceipt,
    requestWarrantySearch,
    type ExpenseFormPrefill,
    type ReportsFilterPrefill,
    type VoucherFormPrefill,
} from './pageActions.ts';
import { requestOpenSale } from './mobileSaleQueue.ts';
import { REPORT_PERIOD_LABELS, type ReportPeriod } from './reportPeriods.ts';

export interface ResolvedParty {
    partyId: string;
    partyName: string;
}

export interface AiActionDeps {
    onNavigate: (page: Page) => void;
    defaultFirmId: string;
    suppliers: Supplier[];
    transactions: Transaction[];
    addExpense: (expense: Omit<Expense, 'id'>) => void;
    addPaymentVoucher: (voucher: Omit<PaymentVoucher, 'id'>) => void;
}

function normalizeName(name: string): string {
    return name.trim().toLowerCase();
}

export function resolveParty(
    partyType: 'Customer' | 'Supplier',
    partyName: string,
    suppliers: Supplier[],
    transactions: Transaction[],
): ResolvedParty | null {
    const query = normalizeName(partyName);
    if (!query) return null;

    if (partyType === 'Supplier') {
        const exact = suppliers.find(s => normalizeName(s.name) === query);
        if (exact) return { partyId: exact.id, partyName: exact.name };
        const partial = suppliers.find(s =>
            normalizeName(s.name).includes(query) || query.includes(normalizeName(s.name)),
        );
        if (partial) return { partyId: partial.id, partyName: partial.name };
        return null;
    }

    const customers = new Map<string, { name: string; phone: string }>();
    transactions.forEach(t => {
        if (t.customerName && t.customerName !== 'Walk-in') {
            const id = `${t.customerName}|${t.customerPhone || ''}`;
            if (!customers.has(id)) {
                customers.set(id, { name: t.customerName, phone: t.customerPhone || '' });
            }
        }
    });

    for (const [id, customer] of customers) {
        const name = normalizeName(customer.name);
        if (name === query || name.includes(query) || query.includes(name)) {
            return { partyId: id, partyName: customer.name };
        }
    }
    return null;
}

function toIsoDate(date?: string): string {
    if (date) {
        const parsed = new Date(date);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
}

function expensePrefillFromAction(action: Extract<AiChatAction, { type: 'add_expense' | 'open_expense_form' }>): ExpenseFormPrefill {
    return {
        date: action.date,
        category: action.category,
        description: action.description,
        amount: action.amount,
        method: action.method,
    };
}

function voucherPrefillFromAction(
    action: Extract<AiChatAction, { type: 'add_payment_voucher' | 'open_voucher_form' }>,
): VoucherFormPrefill {
    return {
        voucherType: action.voucherType,
        partyType: action.partyType,
        partyName: action.partyName,
        amount: action.amount,
        method: action.method,
        date: action.date,
        referenceNumber: action.referenceNumber,
        notes: action.notes,
    };
}

export function isWriteAction(action: AiChatAction): boolean {
    return action.type === 'add_expense' || action.type === 'add_payment_voucher';
}

export function formatActionSummary(action: AiChatAction, currencySymbol = '₹'): string {
    switch (action.type) {
        case 'navigate':
            return `Go to ${action.page}`;
        case 'add_expense':
            return `Log expense: ${action.category} — ${action.description} (${currencySymbol}${action.amount.toLocaleString('en-IN')})`;
        case 'add_payment_voucher':
            return `${action.voucherType === 'Payment' ? 'Pay' : 'Receive from'} ${action.partyName} (${currencySymbol}${action.amount.toLocaleString('en-IN')})`;
        case 'open_expense_form':
            return action.description
                ? `Open expense form: ${action.description}`
                : 'Open expense form';
        case 'open_voucher_form':
            return `Open ${action.voucherType === 'Payment' ? 'payment' : 'receipt'} form${action.partyName ? `: ${action.partyName}` : ''}`;
        case 'open_sale':
            return action.customerName ? `New sale for ${action.customerName}` : 'Open new sale';
        case 'open_service_job':
            return 'Open new service job';
        case 'inventory_search':
            return action.lowStockOnly ? 'Show low stock items' : `Search inventory${action.query ? `: ${action.query}` : ''}`;
        case 'warranty_search':
            return `Search warranty: ${action.query}`;
        case 'reports_filter':
            return action.period
                ? `Open reports: ${REPORT_PERIOD_LABELS[action.period as ReportPeriod] ?? action.period}`
                : 'Open reports';
        case 'view_receipt':
            return `View receipt ${action.transactionId}`;
        default:
            return 'Run action';
    }
}

export interface ExecuteAiActionResult {
    ok: boolean;
    message?: string;
    needsPartyResolution?: boolean;
}

export function executeAiAction(action: AiChatAction, deps: AiActionDeps): ExecuteAiActionResult {
    const { onNavigate, defaultFirmId, suppliers, transactions, addExpense, addPaymentVoucher } = deps;

    switch (action.type) {
        case 'navigate':
            onNavigate(action.page);
            return { ok: true };

        case 'add_expense':
            addExpense({
                date: toIsoDate(action.date),
                category: action.category,
                description: action.description,
                amount: action.amount,
                method: action.method || 'Cash',
            });
            return { ok: true };

        case 'add_payment_voucher': {
            const party = resolveParty(action.partyType, action.partyName, suppliers, transactions);
            if (!party) {
                return { ok: false, needsPartyResolution: true, message: `Could not find ${action.partyType.toLowerCase()} "${action.partyName}".` };
            }
            addPaymentVoucher({
                date: toIsoDate(action.date),
                type: action.voucherType,
                firmId: defaultFirmId,
                partyType: action.partyType,
                partyId: party.partyId,
                partyName: party.partyName,
                amount: action.amount,
                method: action.method || 'Cash',
                referenceNumber: action.referenceNumber,
                notes: action.notes,
            });
            return { ok: true };
        }

        case 'open_expense_form':
            requestOpenExpenseForm(expensePrefillFromAction(action));
            onNavigate('Expenses');
            return { ok: true };

        case 'open_voucher_form':
            requestOpenVoucherForm(action.voucherType, voucherPrefillFromAction(action));
            onNavigate('Banking');
            return { ok: true };

        case 'open_sale':
            if (action.customerName) {
                requestSaleCustomerPrefill({
                    customerName: action.customerName,
                    customerPhone: action.customerPhone || '',
                    vehicleNumber: action.vehicleNumber,
                    vehicleModel: action.vehicleModel,
                    saleCategory: action.saleCategory,
                });
            }
            requestOpenSale();
            onNavigate('Sales');
            return { ok: true };

        case 'open_service_job':
            requestOpenServiceJob();
            onNavigate('Charging Services');
            return { ok: true };

        case 'inventory_search':
            requestInventorySearch({ query: action.query, lowStockOnly: action.lowStockOnly });
            onNavigate('Products');
            return { ok: true };

        case 'warranty_search':
            requestWarrantySearch(action.query);
            onNavigate('Warranty');
            return { ok: true };

        case 'reports_filter': {
            const prefill: ReportsFilterPrefill = {};
            if (action.period) prefill.period = action.period as ReportPeriod;
            if (action.firmId) prefill.firmId = action.firmId;
            requestReportsFilter(prefill);
            onNavigate('Reports');
            return { ok: true };
        }

        case 'view_receipt':
            requestViewReceipt(action.transactionId);
            onNavigate('Sales');
            return { ok: true };

        default:
            return { ok: false, message: 'Unsupported action.' };
    }
}

export function getActionEditLabel(action: AiChatAction): string | null {
    switch (action.type) {
        case 'add_expense':
        case 'open_expense_form':
            return 'Edit in Expenses';
        case 'add_payment_voucher':
        case 'open_voucher_form':
            return 'Edit in Banking';
        default:
            return actionToEditForm(action) ? 'Edit' : null;
    }
}

export function actionToEditForm(action: AiChatAction): AiChatAction | null {
    if (action.type === 'add_expense') {
        return { type: 'open_expense_form', ...expensePrefillFromAction(action) };
    }
    if (action.type === 'add_payment_voucher') {
        return { type: 'open_voucher_form', ...voucherPrefillFromAction(action) };
    }
    if (action.type === 'open_expense_form' || action.type === 'open_voucher_form') {
        return action;
    }
    return null;
}
