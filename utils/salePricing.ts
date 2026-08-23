import { CartItem, SaleTotals } from '../components/sales/types.ts';
import { getGstRateForHsn, roundPaise, splitTaxAmount } from '../indianGST.ts';

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
    /** Drives CGST/SGST vs IGST split of the stored totals. */
    isInterstate?: boolean;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * Group cart lines by their effective GST rate. Line rates come from the
 * item's HSN code when stamped (per-line statutory rates differ: lead-acid
 * 28%, lithium 18%, solar 12%…); anything unstamped falls back to the firm
 * rate. Additional charges form their own bucket at the charge's rate.
 */
export function buildGstRateBuckets(
    cart: CartItem[],
    additionalChargesAmount: number,
    fallbackGstRate: number,
): { rate: number; net: number }[] {
    const buckets = new Map<number, number>();

    const addToBucket = (rate: number, amount: number) => {
        const key = Number.isFinite(rate) ? rate : fallbackGstRate;
        buckets.set(key, (buckets.get(key) ?? 0) + amount);
    };

    cart.forEach(item => {
        const itemGross = item.price * item.quantity;
        const itemDiscount = item.discount.type === 'percentage'
            ? itemGross * (item.discount.value / 100)
            : item.discount.value * item.quantity;
        const itemNet = itemGross - itemDiscount;

        const rate = item.gstRate ?? getGstRateForHsn(item.hsnCode) ?? fallbackGstRate;
        addToBucket(rate, itemNet);
    });

    if (additionalChargesAmount) {
        addToBucket(fallbackGstRate, Number(additionalChargesAmount) || 0);
    }

    return [...buckets.entries()]
        .map(([rate, net]) => ({ rate, net }))
        .filter(b => b.net !== 0);
}

/**
 * Extract GST from a tax-inclusive final amount across MIXED rates.
 *
 * With a single effective rate this reduces exactly to the classic formula
 * tax = total × r / (100 + r). When the cart mixes rates (e.g. a 28%
 * lead-acid battery alongside an 18% lithium unit), the overall discount /
 * loyalty redemption is allocated pro-rata across rate buckets and each
 * bucket is taxed at its own statutory rate — instead of taxing the whole
 * invoice at one cart-level rate.
 */
export function extractGstFromFinalMulti(
    finalAmount: number,
    fallbackGstRate: number,
    taxRegime: 'Regular' | 'Composition',
    buckets: { rate: number; net: number }[],
): { taxAmount: number; taxableAmount: number; perRateTax: { rate: number; tax: number }[] } {
    if (taxRegime !== 'Regular') {
        return { taxAmount: 0, taxableAmount: finalAmount, perRateTax: [] };
    }
    const activeBuckets = buckets.filter(b => b.rate > 0 && b.net !== 0);
    const rates = new Set(activeBuckets.map(b => b.rate));

    // Uniform-rate fast path (also covers empty carts): identical to before.
    if (rates.size <= 1) {
        const rate = rates.size === 1 ? [...rates][0] : fallbackGstRate;
        if (rate <= 0) return { taxAmount: 0, taxableAmount: finalAmount, perRateTax: [] };
        const legacy = extractGstFromFinal(finalAmount, rate, taxRegime);
        return { ...legacy, perRateTax: [{ rate, tax: legacy.taxAmount }] };
    }

    const baseTotal = activeBuckets.reduce((sum, b) => sum + b.net, 0);
    const sign = finalAmount < 0 ? -1 : 1;
    const absTotal = Math.abs(finalAmount);

    let taxSum = 0;
    const perRateTax: { rate: number; tax: number }[] = [];
    if (Math.abs(baseTotal) < 1e-9) {
        // Degenerate cart (fully offset by buybacks): fall back to firm rate.
        const shareTax = roundPaise(absTotal * fallbackGstRate / (100 + fallbackGstRate));
        taxSum = shareTax;
        perRateTax.push({ rate: fallbackGstRate, tax: sign * shareTax });
    } else {
        const allocationFactor = absTotal / Math.abs(baseTotal);
        activeBuckets.forEach(bucket => {
            // Keep the bucket's sign: buyback lines (negative net) must OFFSET
            // the invoice's tax, not be taxed as a positive supply. Taking
            // |net| here overcharged mixed carts ~2x on exchange sales.
            const allocatedNet = bucket.net * allocationFactor;
            const tax = roundPaise(allocatedNet * bucket.rate / (100 + bucket.rate));
            taxSum += tax;
            perRateTax.push({ rate: bucket.rate, tax });
        });
    }

    // Bucket taxes are already signed (buybacks offset); no extra sign flip.
    const taxAmount = roundPaise(taxSum);
    const taxableAmount = round2(roundPaise(finalAmount) - taxAmount);
    return { taxAmount, taxableAmount, perRateTax };
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
        clubBuybackWithDiscount, isInterstate = false,
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

    // Mixed-rate-aware GST extraction (see buildGstRateBuckets).
    const buckets = buildGstRateBuckets(cart, additionalCharges.amount, gstRate);
    const { taxAmount, taxableAmount } = extractGstFromFinalMulti(total, gstRate, taxRegime, buckets);

    // Reconciled component split stored on the transaction so GSTR exports
    // never re-derive halves that drift from the filed total.
    const { cgst, sgst, igst } = splitTaxAmount(taxAmount, isInterstate);

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
        totalCgst: cgst,
        totalSgst: sgst,
        totalIgst: igst,
    };
}
