import type {
    AiChatAction,
    AiChatResult,
    AiInsightsResult,
    ExpenseCategory,
    Page,
    PaymentMethod,
    PurchaseExtractionResult,
    ReportPeriodPreference,
} from '../../../types.ts';

const VALID_PAGES: Page[] = [
    'Dashboard', 'Sales', 'Purchases', 'Banking', 'Customers', 'Products',
    'Expenses', 'Charging Services', 'Warranty', 'Reports', 'Settings', 'Mobile',
];

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
    'Rent', 'Salaries', 'Utilities', 'Marketing', 'Supplies', 'Other',
];

const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Card', 'UPI', 'Bank Transfer'];

const VOUCHER_METHODS = PAYMENT_METHODS;

const REPORT_PERIODS: ReportPeriodPreference[] = [
    'today', 'last7', 'last30', 'this_week', 'prev_week',
    'month', 'prev_month', 'this_year', 'prev_year',
];

function optionalString(val: unknown): string | undefined {
    if (val === undefined || val === null) return undefined;
    const s = String(val).trim();
    return s || undefined;
}

function requireString(obj: Record<string, unknown>, key: string): string {
    const s = optionalString(obj[key]);
    if (!s) throw new Error(`Action missing ${key}.`);
    return s;
}

function optionalNumber(val: unknown): number | undefined {
    if (val === undefined || val === null) return undefined;
    const n = Number(val);
    if (!Number.isFinite(n)) return undefined;
    return n;
}

function requirePositiveAmount(val: unknown, field: string): number {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid ${field}.`);
    return n;
}

function parseExpenseCategory(val: unknown, required = true): ExpenseCategory | undefined {
    if (val === undefined || val === null || val === '') {
        if (required) throw new Error('Invalid expense category.');
        return undefined;
    }
    const cat = String(val) as ExpenseCategory;
    if (!EXPENSE_CATEGORIES.includes(cat)) throw new Error('Invalid expense category.');
    return cat;
}

function parsePaymentMethod(val: unknown): PaymentMethod | undefined {
    if (val === undefined || val === null || val === '') return undefined;
    const m = String(val) as PaymentMethod;
    if (!PAYMENT_METHODS.includes(m)) throw new Error('Invalid payment method.');
    return m;
}

function parseVoucherMethod(val: unknown): PaymentVoucherMethod | undefined {
    if (val === undefined || val === null || val === '') return undefined;
    const m = String(val) as PaymentVoucherMethod;
    if (!VOUCHER_METHODS.includes(m)) throw new Error('Invalid voucher method.');
    return m;
}

type PaymentVoucherMethod = 'Cash' | 'Card' | 'UPI' | 'Bank Transfer';

function parsePage(val: unknown): Page {
    const page = String(val) as Page;
    if (!VALID_PAGES.includes(page)) throw new Error('Invalid page.');
    return page;
}

function parseReportPeriod(val: unknown): ReportPeriodPreference | undefined {
    if (val === undefined || val === null || val === '') return undefined;
    const p = String(val) as ReportPeriodPreference;
    if (!REPORT_PERIODS.includes(p)) throw new Error('Invalid report period.');
    return p;
}

function parsePartyType(val: unknown): 'Customer' | 'Supplier' {
    const t = String(val);
    if (t !== 'Customer' && t !== 'Supplier') throw new Error('Invalid party type.');
    return t;
}

function parseVoucherType(val: unknown): 'Receipt' | 'Payment' {
    const t = String(val);
    if (t !== 'Receipt' && t !== 'Payment') throw new Error('Invalid voucher type.');
    return t;
}

function validateAction(raw: unknown): AiChatAction {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid action.');
    const obj = raw as Record<string, unknown>;
    const type = String(obj.type);

    switch (type) {
        case 'navigate':
            return { type: 'navigate', page: parsePage(obj.page) };
        case 'add_expense':
            return {
                type: 'add_expense',
                date: optionalString(obj.date),
                category: parseExpenseCategory(obj.category)!,
                description: requireString(obj, 'description'),
                amount: requirePositiveAmount(obj.amount, 'amount'),
                method: parsePaymentMethod(obj.method),
            };
        case 'add_payment_voucher':
            return {
                type: 'add_payment_voucher',
                voucherType: parseVoucherType(obj.voucherType),
                partyType: parsePartyType(obj.partyType),
                partyName: requireString(obj, 'partyName'),
                amount: requirePositiveAmount(obj.amount, 'amount'),
                method: parseVoucherMethod(obj.method),
                date: optionalString(obj.date),
                referenceNumber: optionalString(obj.referenceNumber),
                notes: optionalString(obj.notes),
            };
        case 'open_expense_form':
            return {
                type: 'open_expense_form',
                date: optionalString(obj.date),
                category: parseExpenseCategory(obj.category, false),
                description: optionalString(obj.description),
                amount: optionalNumber(obj.amount),
                method: parsePaymentMethod(obj.method),
            };
        case 'open_voucher_form':
            return {
                type: 'open_voucher_form',
                voucherType: parseVoucherType(obj.voucherType),
                partyType: obj.partyType ? parsePartyType(obj.partyType) : undefined,
                partyName: optionalString(obj.partyName),
                amount: optionalNumber(obj.amount),
                method: parseVoucherMethod(obj.method),
                date: optionalString(obj.date),
                referenceNumber: optionalString(obj.referenceNumber),
                notes: optionalString(obj.notes),
            };
        case 'open_sale':
            return {
                type: 'open_sale',
                customerName: optionalString(obj.customerName),
                customerPhone: optionalString(obj.customerPhone),
                vehicleNumber: optionalString(obj.vehicleNumber),
                vehicleModel: optionalString(obj.vehicleModel),
                saleCategory: optionalString(obj.saleCategory),
            };
        case 'open_service_job':
            return { type: 'open_service_job' };
        case 'inventory_search':
            return {
                type: 'inventory_search',
                query: optionalString(obj.query),
                lowStockOnly: obj.lowStockOnly === true || obj.lowStockOnly === 'true',
            };
        case 'warranty_search':
            return { type: 'warranty_search', query: requireString(obj, 'query') };
        case 'reports_filter':
            return {
                type: 'reports_filter',
                period: parseReportPeriod(obj.period),
                firmId: optionalString(obj.firmId),
            };
        case 'view_receipt':
            return { type: 'view_receipt', transactionId: requireString(obj, 'transactionId') };
        default:
            throw new Error(`Unknown action type: ${type}`);
    }
}

export function validateChatResponse(raw: unknown): AiChatResult {
    if (!raw || typeof raw !== 'object') {
        throw new Error('Invalid chat response.');
    }
    const obj = raw as Record<string, unknown>;
    const reply = optionalString(obj.reply);
    if (!reply) throw new Error('Chat response missing reply.');

    const actionsRaw = obj.actions;
    if (actionsRaw === undefined || actionsRaw === null) {
        return { reply };
    }
    if (!Array.isArray(actionsRaw)) {
        throw new Error('Chat actions must be an array.');
    }

    const actions: AiChatAction[] = [];
    if (Array.isArray(actionsRaw)) {
        actionsRaw.forEach((a) => {
            try {
                actions.push(validateAction(a));
            } catch {
                // Skip invalid actions; keep reply usable.
            }
        });
    }

    return actions.length > 0 ? { reply, actions } : { reply };
}

export function parseChatResponseText(text: string): AiChatResult {
    try {
        return validateChatResponse(parseJsonFromText(text));
    } catch {
        const trimmed = text.trim();
        if (!trimmed) throw new Error('Empty response from AI.');
        return { reply: trimmed };
    }
}

export function parseJsonFromText(text: string): unknown {
    const trimmed = text.trim();
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1) {
        throw new Error('AI response did not contain JSON.');
    }
    return JSON.parse(candidate.slice(start, end + 1));
}

export function validatePurchaseExtraction(raw: unknown): PurchaseExtractionResult {
    if (!raw || typeof raw !== 'object') {
        throw new Error('Invalid extraction response.');
    }
    const obj = raw as Record<string, unknown>;
    const confidence = obj.confidence;
    if (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low') {
        throw new Error('Invalid confidence level in extraction.');
    }
    const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
    const items = itemsRaw.map((item, idx) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`Invalid item at index ${idx}.`);
        }
        const row = item as Record<string, unknown>;
        const description = String(row.description ?? '').trim();
        const quantity = Number(row.quantity);
        const unitPrice = Number(row.unitPrice);
        if (!description) throw new Error(`Item ${idx + 1}: missing description.`);
        if (!Number.isFinite(quantity) || quantity < 1) throw new Error(`Item ${idx + 1}: invalid quantity.`);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`Item ${idx + 1}: invalid unit price.`);
        return {
            description,
            quantity,
            unitPrice,
            mrp: row.mrp !== undefined ? Number(row.mrp) : undefined,
            taxRate: row.taxRate !== undefined ? Number(row.taxRate) : undefined,
            hsnCode: row.hsnCode ? String(row.hsnCode) : undefined,
            batchNumber: row.batchNumber ? String(row.batchNumber) : undefined,
        };
    });

    const warnings = Array.isArray(obj.warnings) ? obj.warnings.map(w => String(w)) : [];

    return {
        supplierName: obj.supplierName ? String(obj.supplierName) : undefined,
        supplierGstin: obj.supplierGstin ? String(obj.supplierGstin) : undefined,
        supplierInvoiceNumber: obj.supplierInvoiceNumber ? String(obj.supplierInvoiceNumber) : undefined,
        date: obj.date ? String(obj.date) : undefined,
        items,
        subtotal: obj.subtotal !== undefined ? Number(obj.subtotal) : undefined,
        totalTax: obj.totalTax !== undefined ? Number(obj.totalTax) : undefined,
        totalAmount: obj.totalAmount !== undefined ? Number(obj.totalAmount) : undefined,
        confidence,
        warnings,
    };
}

export function validateInsights(raw: unknown): AiInsightsResult {
    if (!raw || typeof raw !== 'object') {
        throw new Error('Invalid insights response.');
    }
    const obj = raw as Record<string, unknown>;
    const toStrings = (key: string) => {
        const val = obj[key];
        if (!Array.isArray(val)) return [];
        return val.map(v => String(v).trim()).filter(Boolean);
    };
    return {
        highlights: toStrings('highlights'),
        risks: toStrings('risks'),
        suggestedActions: toStrings('suggestedActions'),
    };
}

export function detectMimeType(imageBase64: string): string {
    if (imageBase64.startsWith('/9j/')) return 'image/jpeg';
    if (imageBase64.startsWith('iVBOR')) return 'image/png';
    if (imageBase64.startsWith('R0lGOD')) return 'image/gif';
    if (imageBase64.startsWith('UklGR')) return 'image/webp';
    return 'image/jpeg';
}
