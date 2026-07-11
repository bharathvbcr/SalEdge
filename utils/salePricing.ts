import { CartItem, SaleTotals } from '../components/sales/types.ts';

export type PricingMode = 'final-drives' | 'discount-drives';

export interface ComputeSaleTotalsParams {
    cart: CartItem[];
    overallDiscount: { type: 'percentage' | 'fixed'; value: number };
    additionalCharges: { description: string; amount: number };
    pointsToRedeem: number;
    pointsRedemptionValue: number;
    taxRegime: 'Regular' | 'Composition';
    gstRate: number;
    finalPriceOverride: number | null;
    finalPriceLocked: boolean;
    pricingMode: PricingMode;
    isReturnMode: boolean;
    clubBuybackWithDiscount: boolean;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

export function computeBaseBeforeOverallDiscount(
    cart: CartItem[],
    additionalCharges: { amount: number },
    pointsToRedeem: number,
    pointsRedemptionValue: number,
): { baseBeforeDisc: number; itemsTotal: number; buybackTotal: number; totalItemDiscount: number; subtotal: number; totalCost: number; pointsDiscountValue: number } {
    let runningRegularItemsGross = 0;
    let runningBuybackTotal = 0;
    let runningItemDiscount = 0;
    let runningTotalCost = 0;

    cart.forEach(item => {
        const itemGross = item.price * item.quantity;
        if (item.isBuyback) {
            runningBuybackTotal += itemGross;
        } else {
            runningRegularItemsGross += itemGross;
            let itemDiscountAmount = 0;
            if (item.discount.type === 'percentage') {
                itemDiscountAmount = itemGross * (item.discount.value / 100);
            } else {
                itemDiscountAmount = item.discount.value * item.quantity;
            }
            runningItemDiscount += itemDiscountAmount;
            if (item.purchasePrice !== undefined) runningTotalCost += item.purchasePrice * item.quantity;
        }
    });

    const totalGrossAmount = runningRegularItemsGross + runningBuybackTotal;
    const subtotalWithCharges = totalGrossAmount - runningItemDiscount + (Number(additionalCharges.amount) || 0);
    const pointsDiscountValue = pointsToRedeem * pointsRedemptionValue;
    const baseBeforeDisc = subtotalWithCharges - pointsDiscountValue;

    return {
        baseBeforeDisc,
        itemsTotal: totalGrossAmount,
        buybackTotal: runningBuybackTotal,
        totalItemDiscount: runningItemDiscount,
        subtotal: subtotalWithCharges,
        totalCost: runningTotalCost,
        pointsDiscountValue,
    };
}

export function deriveOverallDiscountFromFinal(
    baseBeforeDisc: number,
    targetFinal: number,
    isReturnMode: boolean,
): { type: 'fixed'; value: number } {
    const value = round2(baseBeforeDisc - targetFinal);
    if (isReturnMode) {
        return { type: 'fixed', value };
    }
    return { type: 'fixed', value };
}

export function extractGstFromFinal(
    finalAmount: number,
    gstRate: number,
    taxRegime: 'Regular' | 'Composition',
): { taxAmount: number; taxableAmount: number } {
    if (taxRegime !== 'Regular' || gstRate === 0) {
        return { taxAmount: 0, taxableAmount: finalAmount };
    }
    const sign = finalAmount < 0 ? -1 : 1;
    const absFinal = Math.abs(finalAmount);
    const taxAmount = sign * round2(absFinal * gstRate / (100 + gstRate));
    const taxableAmount = round2(finalAmount - taxAmount);
    return { taxAmount, taxableAmount };
}

function computeOverallDiscountAmount(
    overallDiscount: { type: 'percentage' | 'fixed'; value: number },
    baseForDiscount: number,
    isReturnMode: boolean,
): number {
    if (overallDiscount.type === 'percentage') {
        return baseForDiscount * (overallDiscount.value / 100);
    }
    return isReturnMode ? -Math.abs(overallDiscount.value) : overallDiscount.value;
}

export function computeSaleTotals(params: ComputeSaleTotalsParams): SaleTotals {
    const {
        cart, overallDiscount, additionalCharges, pointsToRedeem, pointsRedemptionValue,
        taxRegime, gstRate, finalPriceOverride, finalPriceLocked, pricingMode, isReturnMode,
        clubBuybackWithDiscount,
    } = params;

    const base = computeBaseBeforeOverallDiscount(cart, additionalCharges, pointsToRedeem, pointsRedemptionValue);
    const { baseBeforeDisc, itemsTotal, buybackTotal, totalItemDiscount, subtotal, totalCost, pointsDiscountValue } = base;

    let overallDiscountAmount: number;
    let computedFinalBeforeRound: number;
    let total: number;
    let isFinalPriceOverridden = false;

    if (pricingMode === 'final-drives' && finalPriceLocked && finalPriceOverride !== null) {
        total = finalPriceOverride;
        overallDiscountAmount = round2(baseBeforeDisc - total);
        computedFinalBeforeRound = baseBeforeDisc - overallDiscountAmount;
        isFinalPriceOverridden = true;
    } else {
        overallDiscountAmount = computeOverallDiscountAmount(overallDiscount, subtotal, isReturnMode);
        computedFinalBeforeRound = baseBeforeDisc - overallDiscountAmount;
        total = Math.round(computedFinalBeforeRound);
        if (finalPriceOverride !== null && !finalPriceLocked) {
            total = finalPriceOverride;
        }
    }

    const { taxAmount, taxableAmount } = extractGstFromFinal(total, gstRate, taxRegime);
    const combinedConcession = Math.abs(buybackTotal) + Math.abs(overallDiscountAmount);
    const estimatedProfit = taxableAmount - totalCost;

    return {
        itemsTotal,
        buybackTotal,
        totalItemDiscount,
        subtotal,
        overallDiscountAmount,
        pointsDiscountValue,
        taxAmount,
        total,
        estimatedProfit,
        taxableAmount,
        computedFinalBeforeRound,
        combinedConcession,
        isFinalPriceOverridden,
        pricingMode,
        clubBuybackWithDiscount,
    };
}
