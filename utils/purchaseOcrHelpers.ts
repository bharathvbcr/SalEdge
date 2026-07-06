import type { ProductType, PurchaseExtractionResult } from '../types.ts';

export function parseProductFromDescription(description: string): {
    brandName: string;
    name: string;
    hsnCode?: string;
} {
    const trimmed = description.trim();
    if (!trimmed) {
        return { brandName: 'Unknown', name: 'Unnamed Product' };
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
        return { brandName: parts[0], name: parts[0] };
    }

    return {
        brandName: parts[0],
        name: parts.slice(1).join(' '),
    };
}

export function productDraftFromExtractionRow(
    row: PurchaseExtractionResult['items'][0],
    defaultCategory = 'Other',
): Omit<ProductType, 'id'> {
    const parsed = parseProductFromDescription(row.description);
    return {
        brandName: parsed.brandName,
        name: parsed.name,
        category: defaultCategory,
        hsnCode: row.hsnCode,
        specifications: {
            capacity: '',
            voltage: '12V',
            technology: 'Tubular',
            cRating: 'C20',
        },
        lowStockThreshold: 5,
    };
}

export const CONFIDENCE_LABELS: Record<PurchaseExtractionResult['confidence'], string> = {
    high: 'High confidence',
    medium: 'Medium confidence — verify fields',
    low: 'Low confidence — review carefully',
};

export const CONFIDENCE_STYLES: Record<PurchaseExtractionResult['confidence'], string> = {
    high: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    low: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};
