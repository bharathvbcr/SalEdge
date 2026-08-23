import { ProductType } from '../../types.ts';

export interface CartItem {
    itemId: string;
    name: string;
    quantity: number;
    price: number;
    purchasePrice?: number;
    maxStock?: number;
    serialNumbers: string[];
    isSerialUnit?: boolean;
    isBuyback?: boolean;
    buybackBrand?: string;
    buybackCapacity?: string;
    buybackSerialNumber?: string;
    isCustom?: boolean;
    guaranteePeriodMonths?: number;
    warrantyPeriodMonths?: number;
    discount: {
        type: 'percentage' | 'fixed';
        value: number;
    };
    specifications?: {
        capacity?: string;
        voltage?: string;
        technology?: string;
        cRating?: string;
    };
    notes?: string;
    hsnCode?: string;
    gstRate?: number;
}

export type Payment = {
    id: number;
    method: 'Cash' | 'Card' | 'UPI';
    amount: number;
};

export interface CustomerData {
    lastSeen: string;
    totalSpent: number;
    totalDue: number;
    loyaltyPoints: number;
    tier?: string;
    creditLimit?: number;
    tierDiscountPercent?: number;
}

export type PricingMode = 'final-drives' | 'discount-drives';

export type SaleTotals = {
    itemsTotal: number;
    totalItemDiscount: number;
    subtotal: number;
    overallDiscountAmount: number;
    pointsDiscountValue: number;
    taxAmount: number;
    total: number;
    estimatedProfit: number;
    buybackTotal: number;
    taxableAmount: number;
    computedFinalBeforeRound: number;
    combinedConcession: number;
    isFinalPriceOverridden: boolean;
    pricingMode: PricingMode;
    clubBuybackWithDiscount: boolean;
    /** Reconciled component splits (paise-exact; CGST+SGST+IGST === taxAmount). */
    totalCgst?: number;
    totalSgst?: number;
    totalIgst?: number;
};

export type InventorySuggestion = {
    id: string;
    fullName: string;
    serialNumber?: string;
    batchNumber?: string;
    stock: number;
    productType?: ProductType;
};

export type WizardStep = 0 | 1 | 2;
