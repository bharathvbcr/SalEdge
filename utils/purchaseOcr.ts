import {
    AiSettings,
    ProductType,
    PurchaseExtractionResult,
    PurchaseItem,
    Supplier,
} from '../types.ts';
import { aiExtractPurchaseInvoice } from './api.ts';
import { findProduct, findSupplier } from './purchaseMatching.ts';

export function stripDataUrlPrefix(image: string): string {
    const comma = image.indexOf(',');
    return comma >= 0 ? image.slice(comma + 1) : image;
}

export interface PurchaseOcrCatalog {
    suppliers: Supplier[];
    productTypes: ProductType[];
}

export interface UnmatchedOcrItem {
    index: number;
    description: string;
    row: PurchaseExtractionResult['items'][0];
}

export interface PurchaseOcrPrefill {
    extraction: PurchaseExtractionResult;
    supplierId?: string;
    supplierInvoiceNumber?: string;
    date?: string;
    items: PurchaseItem[];
    warnings: string[];
    itemWarnings: Record<number, string>;
    confidence: PurchaseExtractionResult['confidence'];
    unmatchedSupplier?: { name: string; gstin?: string };
    unmatchedItems: UnmatchedOcrItem[];
}

function buildPurchaseItemFromExtraction(
    productTypeId: string,
    row: PurchaseExtractionResult['items'][0],
): PurchaseItem {
    const quantity = row.quantity;
    const unitPrice = row.unitPrice;
    const taxRate = Number.isFinite(row.taxRate) ? (row.taxRate as number) : 18;
    const mrp = Number.isFinite(row.mrp) ? (row.mrp as number) : Math.round(unitPrice * 1.3);
    const totalExclTax = unitPrice * quantity;
    const taxAmount = totalExclTax * (taxRate / 100);

    return {
        productTypeId,
        type: 'New',
        quantity,
        unitPrice,
        mrp,
        taxRate,
        taxAmount,
        total: totalExclTax + taxAmount,
        batchNumber: row.batchNumber,
        serialNumbers: [],
    };
}

export function mapExtractionToPrefill(
    extraction: PurchaseExtractionResult,
    catalog: PurchaseOcrCatalog,
): PurchaseOcrPrefill {
    const warnings = [...extraction.warnings];
    const itemWarnings: Record<number, string> = {};
    const items: PurchaseItem[] = [];
    const unmatchedItems: UnmatchedOcrItem[] = [];

    let supplierId: string | undefined;
    let unmatchedSupplier: PurchaseOcrPrefill['unmatchedSupplier'];

    if (extraction.supplierName) {
        const supplier = findSupplier(catalog.suppliers, extraction.supplierName);
        if (supplier) {
            supplierId = supplier.id;
            if (supplier.name.toLowerCase() !== extraction.supplierName.trim().toLowerCase()) {
                warnings.push(`Matched supplier "${supplier.name}" for "${extraction.supplierName}".`);
            }
        } else {
            unmatchedSupplier = {
                name: extraction.supplierName.trim(),
                gstin: extraction.supplierGstin,
            };
            warnings.push(`Supplier not found: "${extraction.supplierName}". Create it or select manually.`);
        }
    }

    extraction.items.forEach((row, idx) => {
        const product = findProduct(catalog.productTypes, row.description);
        if (!product) {
            unmatchedItems.push({ index: idx, description: row.description, row });
            warnings.push(`Product not matched: "${row.description}". Create product or add line manually.`);
            return;
        }
        items.push(buildPurchaseItemFromExtraction(product.id, row));
        const itemIdx = items.length - 1;
        if (!`${product.brandName} ${product.name}`.toLowerCase().includes(row.description.toLowerCase().slice(0, 8))) {
            itemWarnings[itemIdx] = `Matched "${product.brandName} ${product.name}"`;
        }
    });

    if (extraction.confidence === 'low') {
        warnings.push('Low OCR confidence — review all fields before saving.');
    } else if (extraction.confidence === 'medium') {
        warnings.push('Medium OCR confidence — verify amounts and product matches.');
    }

    return {
        extraction,
        supplierId,
        supplierInvoiceNumber: extraction.supplierInvoiceNumber,
        date: extraction.date,
        items,
        warnings,
        itemWarnings,
        confidence: extraction.confidence,
        unmatchedSupplier,
        unmatchedItems,
    };
}

export async function extractPurchaseFromImage(
    image: string,
    aiSettings: AiSettings,
    catalog: PurchaseOcrCatalog,
): Promise<PurchaseOcrPrefill> {
    const extraction = await aiExtractPurchaseInvoice({
        image: stripDataUrlPrefix(image),
        aiSettings,
        catalog: {
            suppliers: catalog.suppliers.map(s => ({ name: s.name })),
            productTypes: catalog.productTypes.map(p => ({ brandName: p.brandName, name: p.name })),
        },
    });
    return mapExtractionToPrefill(extraction, catalog);
}

export function rematchExtractionPrefill(
    extraction: PurchaseExtractionResult,
    catalog: PurchaseOcrCatalog,
): PurchaseOcrPrefill {
    return mapExtractionToPrefill(extraction, catalog);
}
