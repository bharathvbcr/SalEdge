import { ProductType, Purchase, Supplier } from '../types.ts';
import { purchaseCsvTemplate } from './purchaseImport.ts';

function escapeCsv(value: string | number | undefined): string {
    const str = value === undefined ? '' : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
}

export function exportPurchasesCsv(
    purchases: Purchase[],
    suppliers: Supplier[],
    productTypes: ProductType[],
): string {
    const header = purchaseCsvTemplate().split('\n')[0];
    const rows: string[] = [header];

    for (const purchase of purchases) {
        const supplier = suppliers.find(s => s.id === purchase.supplierId);
        for (const item of purchase.items) {
            const product = productTypes.find(p => p.id === item.productTypeId);
            const productName = product ? `${product.brandName} ${product.name}` : item.productTypeId;
            rows.push([
                purchase.supplierInvoiceNumber,
                supplier?.name ?? '',
                purchase.date.split('T')[0],
                productName,
                item.quantity,
                item.unitPrice,
                item.mrp,
                item.taxRate,
                item.batchNumber ?? '',
                item.type,
                purchase.status,
                purchase.paymentStatus,
                purchase.firmId,
                purchase.paidAmount,
                purchase.paymentMethod ?? '',
                purchase.notes ?? '',
                (item.serialNumbers ?? []).join('|'),
            ].map(escapeCsv).join(','));
        }
    }

    return `${rows.join('\n')}\n`;
}

export function exportPurchasesJson(
    purchases: Purchase[],
    suppliers: Supplier[],
    productTypes: ProductType[],
): string {
    const payload = purchases.map(purchase => {
        const supplier = suppliers.find(s => s.id === purchase.supplierId);
        return {
            supplierInvoiceNumber: purchase.supplierInvoiceNumber,
            supplierName: supplier?.name,
            supplierId: purchase.supplierId,
            firmId: purchase.firmId,
            date: purchase.date.split('T')[0],
            status: purchase.status,
            paymentStatus: purchase.paymentStatus,
            paidAmount: purchase.paidAmount,
            paymentMethod: purchase.paymentMethod,
            paymentDueDate: purchase.paymentDueDate?.split('T')[0],
            notes: purchase.notes,
            hasInvoiceImage: !!purchase.invoiceImage,
            items: purchase.items.map(item => {
                const product = productTypes.find(p => p.id === item.productTypeId);
                return {
                    productName: product ? `${product.brandName} ${product.name}` : undefined,
                    productTypeId: item.productTypeId,
                    type: item.type,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    mrp: item.mrp,
                    taxRate: item.taxRate,
                    batchNumber: item.batchNumber,
                    serialNumbers: item.serialNumbers,
                };
            }),
        };
    });

    return JSON.stringify({ purchases: payload }, null, 2);
}

export function downloadTextFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

export function purchaseJsonTemplate(): string {
    return JSON.stringify({
        purchases: [{
            supplierInvoiceNumber: 'INV-1001',
            supplierName: 'Exide Distributor',
            date: '2026-01-15',
            status: 'Received',
            paymentStatus: 'Due',
            items: [{
                productName: 'Exide 150Ah Tubular',
                quantity: 2,
                unitPrice: 8500,
                mrp: 12000,
                taxRate: 18,
                batchNumber: 'BATCH-2026-A',
                type: 'New',
            }],
        }],
    }, null, 2);
}
