import { ProductType, Supplier } from '../types.ts';

export function findSupplier(suppliers: Supplier[], name: string): Supplier | undefined {
    const needle = name.trim().toLowerCase();
    if (!needle) return undefined;
    return suppliers.find(s => s.name.toLowerCase() === needle)
        ?? suppliers.find(s => s.name.toLowerCase().includes(needle));
}

export function findProduct(productTypes: ProductType[], name: string): ProductType | undefined {
    const needle = name.trim().toLowerCase();
    if (!needle) return undefined;
    return productTypes.find(p => `${p.brandName} ${p.name}`.toLowerCase() === needle)
        ?? productTypes.find(p => p.name.toLowerCase() === needle)
        ?? productTypes.find(p => `${p.brandName} ${p.name}`.toLowerCase().includes(needle))
        ?? productTypes.find(p => p.name.toLowerCase().includes(needle));
}
