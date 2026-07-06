import { ProductType } from '../types.ts';

export const VEHICLE_SALE_CATEGORIES = new Set([
    '2-Wheeler',
    '3-Wheeler',
    '4-Wheeler',
    'Truck',
    'E-Rickshaw',
]);

export function isVehicleCategory(category: string): boolean {
    return VEHICLE_SALE_CATEGORIES.has(category);
}

export function getCategorySectionLabels(category: string) {
    if (!category) {
        return {
            sectionTitle: 'Vehicle / Equipment & Tax',
            idLabel: 'Reg. / ID No.',
            idPlaceholder: 'Vehicle no. or equipment ID',
            modelLabel: 'Model / Description',
            modelPlaceholder: 'e.g. Swift, 150Ah inverter',
        };
    }
    if (isVehicleCategory(category)) {
        return {
            sectionTitle: 'Vehicle & Tax',
            idLabel: 'Vehicle No.',
            idPlaceholder: 'e.g. MH-12-AB-1234',
            modelLabel: 'Vehicle Model',
            modelPlaceholder: 'e.g. Swift, Activa',
        };
    }
    return {
        sectionTitle: 'Equipment & Tax',
        idLabel: 'Equipment ID (Optional)',
        idPlaceholder: 'Serial / asset tag',
        modelLabel: 'Model / Description',
        modelPlaceholder: 'e.g. 150Ah tubular, 5KVA genset',
    };
}

export function inferSaleCategoryFromProduct(
    productType: ProductType,
    availableCategories: string[]
): string | undefined {
    const exact = availableCategories.find(
        c => c.toLowerCase() === productType.category.toLowerCase()
    );
    if (exact) return exact;

    if (productType.category === 'Other' && availableCategories.includes('Other')) {
        return 'Other';
    }

    return undefined;
}
