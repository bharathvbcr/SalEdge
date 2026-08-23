const DRAFT_KEY = 'bsms_sale_draft';

export interface SaleDraft {
    savedAt: string;
    selectedFirmId: string;
    saleDate: string;
    customerName: string;
    customerPhone: string;
    customerGst: string;
    billingAddress: string;
    vehicleNumber: string;
    vehicleModel: string;
    saleCategory: string;
    placeOfSupply: string;
    cart: unknown[];
    payments: unknown[];
    notes: string;
    wizardStep: number;
    overallDiscount?: { type: 'percentage' | 'fixed'; value: number };
    finalPriceOverride?: number | null;
    finalPriceLocked?: boolean;
    pricingMode?: 'final-drives' | 'discount-drives';
    clubBuybackWithDiscount?: boolean;
}

export function saveSaleDraft(draft: SaleDraft) {
    try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
        /* ignore quota errors */
    }
}

export function loadSaleDraft(): SaleDraft | null {
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        return raw ? JSON.parse(raw) as SaleDraft : null;
    } catch {
        return null;
    }
}

export function clearSaleDraft() {
    sessionStorage.removeItem(DRAFT_KEY);
}

export function hasSaleDraft(): boolean {
    const draft = loadSaleDraft();
    return !!draft && isValidSaleDraft(draft);
}

/**
 * Drafts are restored straight into form state; a stale-schema or corrupted
 * draft previously crashed the whole sales form (e.g. serialNumbers missing →
 * `.some()` on undefined). Validate shape before adopting anything.
 */
export function isValidSaleDraft(draft: SaleDraft): boolean {
    if (!draft || typeof draft !== 'object') return false;
    if (!Array.isArray(draft.cart) || !Array.isArray(draft.payments)) return false;

    const isRecord = (v: unknown): v is Record<string, unknown> =>
        v !== null && typeof v === 'object' && !Array.isArray(v);
    const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

    const cartOk = draft.cart.every(rawItem => {
        if (!isRecord(rawItem)) return false;
        const { price, quantity, serialNumbers, discount } = rawItem;
        if (!isFiniteNumber(price)) return false;
        if (!isFiniteNumber(quantity) || quantity <= 0) return false;
        if (!Array.isArray(serialNumbers) || !serialNumbers.every(s => typeof s === 'string')) return false;
        if (!isRecord(discount)) return false;
        if (discount.type !== 'percentage' && discount.type !== 'fixed') return false;
        return isFiniteNumber(discount.value);
    });
    if (!cartOk) return false;

    return draft.payments.every(rawPayment => {
        if (!isRecord(rawPayment)) return false;
        const { method, amount } = rawPayment;
        if (typeof method !== 'string') return false;
        return isFiniteNumber(amount) && amount >= 0;
    });
}

/** Returns the draft when it is safe to restore, null otherwise. */
export function loadValidatedSaleDraft(): SaleDraft | null {
    const draft = loadSaleDraft();
    if (!draft) return null;
    if (!isValidSaleDraft(draft)) {
        clearSaleDraft();
        return null;
    }
    return draft;
}
