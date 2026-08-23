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

// Hallucinated figures must never reach the books in one tap: amounts above
// this ceiling are rejected outright (the UI offers forms for large entries).
const MAX_ACTION_AMOUNT = Number(process.env.AI_MAX_ACTION_AMOUNT) || 1_000_000;

function requirePositiveAmount(val: unknown, field: string): number {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid ${field}.`);
    if (n > MAX_ACTION_AMOUNT) {
        throw new Error(`${field} exceeds the one-click action limit (${MAX_ACTION_AMOUNT}) — use the form instead.`);
    }
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

    // Closed fences; also tolerate a TRUNCATED response that opened but never
    // closed its fence.
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    let candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
    if (!fenceMatch && candidate.startsWith('```')) {
        candidate = candidate.replace(/^```(?:json)?\s*/i, '');
    }

    if (candidate.includes('{')) {
        try {
            const start = candidate.indexOf('{');
            const end = candidate.lastIndexOf('}');
            if (start !== -1 && end > start) {
                return JSON.parse(candidate.slice(start, end + 1));
            }
        } catch { /* fall through to balanced-brace repair */ }

        // Last resort: parse the largest balanced {...} span, ignoring
        // trailing prose after truncated JSON. Repair output can still be
        // unparseable — surface a CLEAN error, never a raw SyntaxError.
        const repaired = extractBalancedJson(candidate);
        if (repaired !== null) {
            try {
                return JSON.parse(repaired);
            } catch {
                throw new Error('AI response did not contain valid JSON.');
            }
        }
    }

    throw new Error('AI response did not contain valid JSON.');
}

function extractBalancedJson(text: string): string | null {
    const start = text.indexOf('{');
    if (start === -1) return null;
    const openStack: string[] = [];
    let inString = false;
    let escaped = false;
    let closedAtIndex: number | null = null;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') openStack.push('}');
        else if (ch === '[') openStack.push(']');
        else if (ch === '}' || ch === ']') {
            // Tolerate mismatched closers from sloppy model output.
            if (openStack[openStack.length - 1] === ch) openStack.pop();
            if (openStack.length === 0 && closedAtIndex === null) closedAtIndex = i;
        }
    }

    // A fully-closed object exists — return exactly it, ignoring trailing prose.
    if (closedAtIndex !== null) {
        return text.slice(start, closedAtIndex + 1);
    }

    // Unterminated structure (truncated generation): close every open
    // container in reverse order so the caller gets partial data instead of a
    // hard failure. Braces AND brackets are tracked — closing only braces
    // leaves `[{...` syntactically invalid.
    let repaired = text.slice(start);
    if (inString) repaired += '"';
    repaired = repaired.replace(/[:,\s]*$/, '');
    repaired += openStack.reverse().join('');
    return repaired;
}

// Bounds for LLM-supplied purchase figures: hallucinated or injected values
// must be rejected before they reach the books.
const MAX_QUANTITY = 10_000;
const MAX_PRICE = 10_000_000;
const MAX_TAX_RATE = 28.5; // highest Indian GST slab + margin
const MAX_ITEMS = 500;

function finiteNumber(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

export function validatePurchaseExtraction(raw: unknown): PurchaseExtractionResult {
    if (!raw || typeof raw !== 'object') {
        throw new Error('Invalid extraction response.');
    }
    const obj = raw as Record<string, unknown>;
    // The LLM's self-reported confidence is not a quality signal — it is
    // derived below from field completeness instead of trusted.
    let confidence: 'high' | 'medium' | 'low';
    if (obj.confidence === 'high' || obj.confidence === 'medium' || obj.confidence === 'low') {
        confidence = obj.confidence;
    } else {
        throw new Error('Invalid confidence level in extraction.');
    }
    const itemsRaw = Array.isArray(obj.items) ? obj.items.slice(0, MAX_ITEMS) : [];
    const items = itemsRaw.map((item, idx) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`Invalid item at index ${idx}.`);
        }
        const row = item as Record<string, unknown>;
        const description = String(row.description ?? '').trim();
        const quantity = finiteNumber(row.quantity);
        // Empty-string prices coerce to 0 — a "free" line item from the LLM.
        const unitPrice = row.unitPrice === '' || row.unitPrice === null || row.unitPrice === undefined
            ? undefined
            : finiteNumber(row.unitPrice);
        if (!description) throw new Error(`Item ${idx + 1}: missing description.`);
        if (quantity === undefined || quantity < 1 || quantity > MAX_QUANTITY) {
            throw new Error(`Item ${idx + 1}: invalid quantity.`);
        }
        if (unitPrice === undefined || unitPrice <= 0 || unitPrice > MAX_PRICE) {
            throw new Error(`Item ${idx + 1}: invalid unit price.`);
        }
        const mrp = finiteNumber(row.mrp);
        const taxRateRaw = finiteNumber(row.taxRate);
        return {
            description,
            quantity,
            unitPrice,
            mrp: mrp !== undefined ? Math.max(0, mrp) : undefined,
            taxRate: taxRateRaw !== undefined ? Math.min(Math.max(0, taxRateRaw), MAX_TAX_RATE) : undefined,
            hsnCode: row.hsnCode ? String(row.hsnCode) : undefined,
            batchNumber: row.batchNumber ? String(row.batchNumber) : undefined,
        };
    });

    const warnings = Array.isArray(obj.warnings) ? obj.warnings.map(w => String(w)).slice(0, 20) : [];

    // Derive confidence from completeness rather than trusting the model:
    // missing supplier/date/lines downgrade whatever the LLM claimed.
    const hasIdentity = !!(obj.supplierInvoiceNumber && obj.date);
    const hasSupplier = !!obj.supplierName;
    if (items.length === 0 || !hasSupplier) confidence = 'low';
    else if (!hasIdentity && confidence === 'high') confidence = 'medium';

    return {
        supplierName: obj.supplierName ? String(obj.supplierName) : undefined,
        supplierGstin: obj.supplierGstin ? String(obj.supplierGstin).toUpperCase() : undefined,
        supplierInvoiceNumber: obj.supplierInvoiceNumber ? String(obj.supplierInvoiceNumber) : undefined,
        date: obj.date ? String(obj.date) : undefined,
        items,
        subtotal: finiteOrUndefined(obj.subtotal),
        totalTax: finiteOrUndefined(obj.totalTax),
        totalAmount: finiteOrUndefined(obj.totalAmount),
        confidence,
        warnings,
    };
}

function finiteOrUndefined(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
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
