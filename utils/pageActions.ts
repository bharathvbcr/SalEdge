import type { Expense, PaymentMethod, ReportPeriodPreference } from '../types.ts';
import type { ReportPeriod } from './reportPeriods.ts';

const OPEN_SERVICE_JOB_KEY = 'bsms_open_service_job';
const WARRANTY_SEARCH_KEY = 'bsms_warranty_search';
const SALE_CUSTOMER_PREFILL_KEY = 'bsms_sale_customer_prefill';
const INVENTORY_SEARCH_KEY = 'bsms_inventory_search';
const VIEW_RECEIPT_KEY = 'bsms_view_receipt';
const OPEN_EXPENSE_FORM_KEY = 'bsms_open_expense_form';
const OPEN_VOUCHER_FORM_KEY = 'bsms_open_voucher_form';
const REPORTS_FILTER_KEY = 'bsms_reports_filter';

export const PAGE_INTENT_EVENT = 'bsms-page-intent';

function notifyPageIntent() {
    window.dispatchEvent(new CustomEvent(PAGE_INTENT_EVENT));
}

export function subscribePageIntents(listener: () => void): () => void {
    window.addEventListener(PAGE_INTENT_EVENT, listener);
    return () => window.removeEventListener(PAGE_INTENT_EVENT, listener);
}

export interface SaleCustomerPrefill {
    customerName: string;
    customerPhone: string;
    vehicleNumber?: string;
    vehicleModel?: string;
    saleCategory?: string;
}

export interface InventorySearchPrefill {
    query?: string;
    lowStockOnly?: boolean;
}

export interface ExpenseFormPrefill {
    date?: string;
    category?: Expense['category'];
    description?: string;
    amount?: number;
    method?: PaymentMethod;
}

export interface VoucherFormPrefill {
    voucherType?: 'Receipt' | 'Payment';
    partyType?: 'Customer' | 'Supplier';
    partyName?: string;
    amount?: number;
    method?: 'Cash' | 'Card' | 'UPI' | 'Bank Transfer';
    date?: string;
    referenceNumber?: string;
    notes?: string;
}

export interface ReportsFilterPrefill {
    period?: ReportPeriod | ReportPeriodPreference;
    firmId?: string;
}

export function requestOpenServiceJob() {
    sessionStorage.setItem(OPEN_SERVICE_JOB_KEY, '1');
    notifyPageIntent();
}

export function consumeOpenServiceJobRequest(): boolean {
    const v = sessionStorage.getItem(OPEN_SERVICE_JOB_KEY);
    if (v) {
        sessionStorage.removeItem(OPEN_SERVICE_JOB_KEY);
        return true;
    }
    return false;
}

export function requestWarrantySearch(query: string) {
    sessionStorage.setItem(WARRANTY_SEARCH_KEY, query);
    notifyPageIntent();
}

export function consumeWarrantySearchRequest(): string | null {
    const v = sessionStorage.getItem(WARRANTY_SEARCH_KEY);
    if (v) {
        sessionStorage.removeItem(WARRANTY_SEARCH_KEY);
        return v;
    }
    return null;
}

export function requestSaleCustomerPrefill(prefill: SaleCustomerPrefill) {
    sessionStorage.setItem(SALE_CUSTOMER_PREFILL_KEY, JSON.stringify(prefill));
    notifyPageIntent();
}

export function consumeSaleCustomerPrefill(): SaleCustomerPrefill | null {
    try {
        const raw = sessionStorage.getItem(SALE_CUSTOMER_PREFILL_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(SALE_CUSTOMER_PREFILL_KEY);
        return JSON.parse(raw) as SaleCustomerPrefill;
    } catch {
        return null;
    }
}

export function requestInventorySearch(prefill: InventorySearchPrefill) {
    sessionStorage.setItem(INVENTORY_SEARCH_KEY, JSON.stringify(prefill));
    notifyPageIntent();
}

export function consumeInventorySearchRequest(): InventorySearchPrefill | null {
    try {
        const raw = sessionStorage.getItem(INVENTORY_SEARCH_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(INVENTORY_SEARCH_KEY);
        return JSON.parse(raw) as InventorySearchPrefill;
    } catch {
        return null;
    }
}

export function requestViewReceipt(transactionId: string) {
    sessionStorage.setItem(VIEW_RECEIPT_KEY, transactionId);
    notifyPageIntent();
}

export function consumeViewReceiptRequest(): string | null {
    try {
        const id = sessionStorage.getItem(VIEW_RECEIPT_KEY);
        if (!id) return null;
        sessionStorage.removeItem(VIEW_RECEIPT_KEY);
        return id;
    } catch {
        return null;
    }
}

export function requestOpenExpenseForm(prefill?: ExpenseFormPrefill) {
    sessionStorage.setItem(OPEN_EXPENSE_FORM_KEY, JSON.stringify(prefill ?? {}));
    notifyPageIntent();
}

export function consumeOpenExpenseFormRequest(): ExpenseFormPrefill | null {
    try {
        const raw = sessionStorage.getItem(OPEN_EXPENSE_FORM_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(OPEN_EXPENSE_FORM_KEY);
        return JSON.parse(raw) as ExpenseFormPrefill;
    } catch {
        return null;
    }
}

export function requestOpenVoucherForm(voucherType: 'Receipt' | 'Payment', prefill?: VoucherFormPrefill) {
    sessionStorage.setItem(OPEN_VOUCHER_FORM_KEY, JSON.stringify({ voucherType, ...prefill }));
    notifyPageIntent();
}

export function consumeOpenVoucherFormRequest(): (VoucherFormPrefill & { voucherType: 'Receipt' | 'Payment' }) | null {
    try {
        const raw = sessionStorage.getItem(OPEN_VOUCHER_FORM_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(OPEN_VOUCHER_FORM_KEY);
        return JSON.parse(raw) as VoucherFormPrefill & { voucherType: 'Receipt' | 'Payment' };
    } catch {
        return null;
    }
}

export function requestReportsFilter(prefill: ReportsFilterPrefill) {
    sessionStorage.setItem(REPORTS_FILTER_KEY, JSON.stringify(prefill));
    notifyPageIntent();
}

export function consumeReportsFilterRequest(): ReportsFilterPrefill | null {
    try {
        const raw = sessionStorage.getItem(REPORTS_FILTER_KEY);
        if (!raw) return null;
        sessionStorage.removeItem(REPORTS_FILTER_KEY);
        return JSON.parse(raw) as ReportsFilterPrefill;
    } catch {
        return null;
    }
}
