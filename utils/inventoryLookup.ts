import { InventoryItem, ProductType } from '../types.ts';

export type LookupMatchType = 'serial' | 'batch' | 'inventory_id' | 'product_barcode' | 'product_id';

export interface InventoryLookupResult {
    matchType: LookupMatchType;
    inventoryItem?: InventoryItem;
    productType?: ProductType;
    /** All inventory batches for product-level matches */
    batches: InventoryItem[];
    totalStock: number;
}

const norm = (s: string) => s.trim().toLowerCase();

export function getProductName(productType: ProductType | undefined): string {
    if (!productType) return 'Unknown Product';
    return `${productType.brandName} ${productType.name}`;
}

export function lookupByBarcode(
    code: string,
    inventory: InventoryItem[],
    productTypes: ProductType[],
    firmId?: string
): InventoryLookupResult | null {
    const q = norm(code);
    if (!q) return null;

    const firmInventory = firmId ? inventory.filter(i => i.firmId === firmId) : inventory;

    const serialMatch = firmInventory.find(i => i.serialNumber && norm(i.serialNumber) === q);
    if (serialMatch) {
        const productType = productTypes.find(pt => pt.id === serialMatch.productTypeId);
        return {
            matchType: 'serial',
            inventoryItem: serialMatch,
            productType,
            batches: [serialMatch],
            totalStock: serialMatch.stock,
        };
    }

    const batchMatch = firmInventory.find(i => i.batchNumber && norm(i.batchNumber) === q);
    if (batchMatch) {
        const productType = productTypes.find(pt => pt.id === batchMatch.productTypeId);
        return {
            matchType: 'batch',
            inventoryItem: batchMatch,
            productType,
            batches: [batchMatch],
            totalStock: batchMatch.stock,
        };
    }

    const idMatch = firmInventory.find(i => norm(i.id) === q);
    if (idMatch) {
        const productType = productTypes.find(pt => pt.id === idMatch.productTypeId);
        return {
            matchType: 'inventory_id',
            inventoryItem: idMatch,
            productType,
            batches: [idMatch],
            totalStock: idMatch.stock,
        };
    }

    const productByBarcode = productTypes.find(pt => pt.barcode && norm(pt.barcode) === q);
    if (productByBarcode) {
        const batches = firmInventory.filter(i => i.productTypeId === productByBarcode.id);
        const totalStock = batches.reduce((sum, b) => sum + b.stock, 0);
        return {
            matchType: 'product_barcode',
            productType: productByBarcode,
            batches,
            totalStock,
        };
    }

    const productById = productTypes.find(pt => norm(pt.id) === q);
    if (productById) {
        const batches = firmInventory.filter(i => i.productTypeId === productById.id);
        const totalStock = batches.reduce((sum, b) => sum + b.stock, 0);
        return {
            matchType: 'product_id',
            productType: productById,
            batches,
            totalStock,
        };
    }

    return null;
}

export function searchInventory(
    query: string,
    inventory: InventoryItem[],
    productTypes: ProductType[],
    firmId?: string,
    limit = 20
): InventoryLookupResult[] {
    const q = norm(query);
    if (!q) return [];

    const firmInventory = firmId ? inventory.filter(i => i.firmId === firmId) : inventory;
    const results: InventoryLookupResult[] = [];
    const seen = new Set<string>();

    for (const item of firmInventory) {
        const productType = productTypes.find(pt => pt.id === item.productTypeId);
        const name = getProductName(productType).toLowerCase();
        const matches =
            item.serialNumber?.toLowerCase().includes(q) ||
            item.batchNumber?.toLowerCase().includes(q) ||
            item.id.toLowerCase().includes(q) ||
            name.includes(q) ||
            productType?.barcode?.toLowerCase().includes(q);

        if (matches && !seen.has(item.id)) {
            seen.add(item.id);
            results.push({
                matchType: item.serialNumber?.toLowerCase().includes(q) ? 'serial' : 'batch',
                inventoryItem: item,
                productType,
                batches: [item],
                totalStock: item.stock,
            });
            if (results.length >= limit) break;
        }
    }

    if (results.length < limit) {
        for (const pt of productTypes) {
            const name = getProductName(pt).toLowerCase();
            if (name.includes(q) || pt.barcode?.toLowerCase().includes(q) || pt.id.toLowerCase().includes(q)) {
                const batches = firmInventory.filter(i => i.productTypeId === pt.id);
                const key = `pt:${pt.id}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push({
                        matchType: pt.barcode?.toLowerCase().includes(q) ? 'product_barcode' : 'product_id',
                        productType: pt,
                        batches,
                        totalStock: batches.reduce((sum, b) => sum + b.stock, 0),
                    });
                    if (results.length >= limit) break;
                }
            }
        }
    }

    return results;
}
