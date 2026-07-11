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
    return !!draft && Array.isArray(draft.cart) && draft.cart.length > 0;
}
