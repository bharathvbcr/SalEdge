import { CustomerProfile, CustomerTier, LoyaltySettings } from '../types.ts';

export function getCustomerTier(totalSpent: number, tiers: LoyaltySettings['tiers']): CustomerTier {
    if (totalSpent >= tiers.platinum) return 'Platinum';
    if (totalSpent >= tiers.gold) return 'Gold';
    return 'Silver';
}

export function getTierDiscountPercent(tier: CustomerTier, loyalty: LoyaltySettings): number {
    const discounts = loyalty.tierDiscounts || { silver: 0, gold: 2, platinum: 5 };
    switch (tier) {
        case 'Platinum': return discounts.platinum;
        case 'Gold': return discounts.gold;
        default: return discounts.silver;
    }
}

export function getCustomPriceForProduct(
    profile: CustomerProfile | undefined,
    productTypeId: string
): number | undefined {
    return profile?.customPrices?.find(cp => cp.productTypeId === productTypeId)?.price;
}

export function wouldExceedCreditLimit(
    currentDue: number,
    newSaleDue: number,
    creditLimit: number | undefined
): boolean {
    if (!creditLimit || creditLimit <= 0) return false;
    return (currentDue + newSaleDue) > creditLimit;
}

export function makeCustomerId(name: string, phone: string): string {
    return `${name.toLowerCase().trim()}|${phone.trim()}`;
}
