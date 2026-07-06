import { PaymentMethod, ProductType, Purchase, PurchaseItem, Supplier } from '../types.ts';
import { findProduct, findSupplier } from './purchaseMatching.ts';
import { validateBatterySerials } from './serialNumbers.ts';

export interface PurchaseImportContext {
    suppliers: Supplier[];
    productTypes: ProductType[];
    defaultFirmId: string;
}

export interface ParsedPurchaseDraft extends Omit<Purchase, 'id'> {}

export interface PurchaseImportResult {
    purchases: ParsedPurchaseDraft[];
    errors: string[];
    warnings: string[];
}

const CSV_HEADERS = [
    'supplierInvoiceNumber',
    'supplierName',
    'date',
    'productName',
    'quantity',
    'unitPrice',
    'mrp',
    'taxRate',
    'batchNumber',
    'type',
    'status',
    'paymentStatus',
    'firmId',
    'paidAmount',
    'paymentMethod',
    'notes',
] as const;

function normalizeHeader(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '');
}

function parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === ',' && !inQuotes) {
            cells.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    cells.push(current.trim());
    return cells;
}

function buildPurchaseItem(
    productTypeId: string,
    row: Record<string, string>,
    lineLabel: string,
    errors: string[],
): PurchaseItem | null {
    const quantity = Number(row.quantity);
    const unitPrice = Number(row.unitprice ?? row.unitPrice);
    const mrp = Number(row.mrp);
    const taxRate = row.taxrate !== undefined || row.taxRate !== undefined
        ? Number(row.taxrate ?? row.taxRate)
        : 18;

    if (!Number.isFinite(quantity) || quantity < 1) {
        errors.push(`${lineLabel}: invalid quantity`);
        return null;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        errors.push(`${lineLabel}: invalid unit price`);
        return null;
    }
    if (!Number.isFinite(mrp) || mrp < 0) {
        errors.push(`${lineLabel}: invalid MRP`);
        return null;
    }

    const totalExclTax = unitPrice * quantity;
    const taxAmount = totalExclTax * (taxRate / 100);
    const typeRaw = (row.type || 'New').trim();
    const type = typeRaw.toLowerCase() === 'refurbished' ? 'Refurbished' : 'New';
    const serialRaw = row.serialnumbers || row.serialNumbers || '';
    const serialNumbers = serialRaw
        ? serialRaw.split(/[|;]/).map(s => s.trim()).filter(Boolean)
        : [];

    return {
        productTypeId,
        type,
        quantity,
        unitPrice,
        mrp,
        taxRate: Number.isFinite(taxRate) ? taxRate : 18,
        taxAmount,
        total: totalExclTax + taxAmount,
        batchNumber: row.batchnumber || row.batchNumber || undefined,
        serialNumbers: serialNumbers.length > 0 ? serialNumbers : [],
    };
}

function finalizePurchase(
    header: {
        supplierInvoiceNumber: string;
        supplierId: string;
        firmId: string;
        date: string;
        status: Purchase['status'];
        paymentStatus: Purchase['paymentStatus'];
        paidAmount: number;
        paymentMethod?: PaymentMethod;
        notes?: string;
    },
    items: PurchaseItem[],
): ParsedPurchaseDraft {
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const totalTax = items.reduce((sum, item) => sum + item.taxAmount, 0);
    return {
        ...header,
        entryDate: new Date().toISOString(),
        items,
        subtotal,
        totalTax,
        totalAmount: subtotal + totalTax,
    };
}

function normalizePurchaseRow(raw: Record<string, unknown>, ctx: PurchaseImportContext, label: string, errors: string[], warnings: string[]): ParsedPurchaseDraft | null {
    const supplierName = String(raw.supplierName ?? raw.supplier ?? '').trim();
    const supplierIdRaw = String(raw.supplierId ?? '').trim();
    const supplier = supplierIdRaw
        ? ctx.suppliers.find(s => s.id === supplierIdRaw)
        : findSupplier(ctx.suppliers, supplierName);

    if (!supplier) {
        errors.push(`${label}: supplier not found (${supplierName || supplierIdRaw || 'missing'})`);
        return null;
    }

    const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
    if (itemsRaw.length === 0) {
        errors.push(`${label}: no line items`);
        return null;
    }

    const items: PurchaseItem[] = [];
    itemsRaw.forEach((itemRaw, idx) => {
        const item = itemRaw as Record<string, unknown>;
        const productName = String(item.productName ?? item.product ?? '').trim();
        const productTypeIdRaw = String(item.productTypeId ?? '').trim();
        const product = productTypeIdRaw
            ? ctx.productTypes.find(p => p.id === productTypeIdRaw)
            : findProduct(ctx.productTypes, productName);

        if (!product) {
            errors.push(`${label} item ${idx + 1}: product not found (${productName || productTypeIdRaw || 'missing'})`);
            return;
        }

        const row: Record<string, string> = {};
        for (const [k, v] of Object.entries(item)) {
            row[k.toLowerCase()] = String(v ?? '');
        }
        const built = buildPurchaseItem(product.id, row, `${label} item ${idx + 1}`, errors);
        if (built) items.push(built);
    });

    if (items.length === 0) return null;

    const statusRaw = String(raw.status ?? 'Received');
    const paymentStatusRaw = String(raw.paymentStatus ?? 'Due');
    const status: Purchase['status'] = statusRaw.toLowerCase() === 'ordered' ? 'Ordered' : 'Received';
    const paymentStatus: Purchase['paymentStatus'] =
        paymentStatusRaw.toLowerCase() === 'paid' ? 'Paid'
        : paymentStatusRaw.toLowerCase() === 'partial' ? 'Partial'
        : 'Due';

    const paidAmount = raw.paidAmount !== undefined ? Number(raw.paidAmount) : paymentStatus === 'Paid' ? items.reduce((s, i) => s + i.total, 0) : 0;
    const paymentMethodRaw = String(raw.paymentMethod ?? 'Bank Transfer') as PaymentMethod;

    if (supplierName && supplier.name.toLowerCase() !== supplierName.toLowerCase()) {
        warnings.push(`${label}: matched supplier "${supplier.name}"`);
    }

    const firmId = String(raw.firmId ?? ctx.defaultFirmId);
    if (status === 'Received') {
        items.forEach((item, idx) => {
            const serialError = validateBatterySerials(item.serialNumbers ?? [], item.quantity, [], firmId, { requireAll: true });
            if (serialError) {
                errors.push(`${label} item ${idx + 1}: ${serialError}`);
            }
        });
        if (errors.some(e => e.startsWith(`${label} item`))) return null;
    }

    return finalizePurchase({
        supplierInvoiceNumber: String(raw.supplierInvoiceNumber ?? raw.invoiceNumber ?? '').trim() || `IMPORT-${Date.now()}`,
        supplierId: supplier.id,
        firmId,
        date: String(raw.date ?? new Date().toISOString().split('T')[0]),
        status,
        paymentStatus,
        paidAmount: Number.isFinite(paidAmount) ? paidAmount : 0,
        paymentMethod: paymentMethodRaw,
        notes: raw.notes ? String(raw.notes) : undefined,
    }, items);
}

export function parsePurchaseJson(text: string, ctx: PurchaseImportContext): PurchaseImportResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let payload: unknown;

    try {
        payload = JSON.parse(text);
    } catch {
        return { purchases: [], errors: ['Invalid JSON file.'], warnings };
    }

    const list = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { purchases?: unknown }).purchases)
            ? (payload as { purchases: unknown[] }).purchases
            : null;

    if (!list) {
        return { purchases: [], errors: ['JSON must be an array of purchases or { "purchases": [...] }.'], warnings };
    }

    const purchases: ParsedPurchaseDraft[] = [];
    list.forEach((entry, idx) => {
        if (!entry || typeof entry !== 'object') {
            errors.push(`Purchase ${idx + 1}: invalid object`);
            return;
        }
        const parsed = normalizePurchaseRow(entry as Record<string, unknown>, ctx, `Purchase ${idx + 1}`, errors, warnings);
        if (parsed) purchases.push(parsed);
    });

    return { purchases, errors, warnings };
}

export function parsePurchaseCsv(text: string, ctx: PurchaseImportContext): PurchaseImportResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());

    if (lines.length < 2) {
        return { purchases: [], errors: ['CSV must include a header row and at least one data row.'], warnings };
    }

    const headers = parseCsvLine(lines[0]).map(normalizeHeader);
    const groups = new Map<string, { meta: Record<string, string>; items: PurchaseItem[] }>();

    for (let i = 1; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i]);
        if (cells.every(c => !c.trim())) continue;

        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
            row[header] = cells[idx]?.trim() ?? '';
        });

        const invoiceNo = row.supplierinvoicenumber || row.invoicenumber || row.invoice || `ROW-${i}`;
        const supplierName = row.suppliername || row.supplier || '';
        const productName = row.productname || row.product || '';
        const supplier = findSupplier(ctx.suppliers, supplierName);
        const product = findProduct(ctx.productTypes, productName);

        if (!supplier) {
            errors.push(`Row ${i + 1}: supplier not found (${supplierName || 'missing'})`);
            continue;
        }
        if (!product) {
            errors.push(`Row ${i + 1}: product not found (${productName || 'missing'})`);
            continue;
        }

        const item = buildPurchaseItem(product.id, row, `Row ${i + 1}`, errors);
        if (!item) continue;

        const key = `${invoiceNo}::${supplier.id}::${row.firmid || row.firmId || ctx.defaultFirmId}`;
        const existing = groups.get(key) ?? { meta: { ...row, supplierId: supplier.id, supplierInvoiceNumber: invoiceNo }, items: [] };
        existing.items.push(item);
        groups.set(key, existing);
    }

    const purchases: ParsedPurchaseDraft[] = [];
    for (const { meta, items } of groups.values()) {
        const statusRaw = meta.status || 'Received';
        const status: Purchase['status'] = statusRaw.toLowerCase() === 'ordered' ? 'Ordered' : 'Received';
        const paymentStatusRaw = meta.paymentstatus || meta.paymentStatus || 'Due';
        const paymentStatus: Purchase['paymentStatus'] =
            paymentStatusRaw.toLowerCase() === 'paid' ? 'Paid'
            : paymentStatusRaw.toLowerCase() === 'partial' ? 'Partial'
            : 'Due';
        const paidAmount = meta.paidamount || meta.paidAmount
            ? Number(meta.paidamount || meta.paidAmount)
            : paymentStatus === 'Paid'
                ? items.reduce((s, item) => s + item.total, 0)
                : 0;
        const firmId = meta.firmid || meta.firmId || ctx.defaultFirmId;
        const invoiceNo = meta.supplierinvoicenumber || meta.invoicenumber || meta.invoice || 'unknown';

        if (status === 'Received') {
            items.forEach((item, idx) => {
                const serialError = validateBatterySerials(item.serialNumbers ?? [], item.quantity, [], firmId, { requireAll: true });
                if (serialError) {
                    errors.push(`Invoice ${invoiceNo} item ${idx + 1}: ${serialError}`);
                }
            });
            if (errors.some(e => e.startsWith(`Invoice ${invoiceNo} item`))) continue;
        }

        purchases.push(finalizePurchase({
            supplierInvoiceNumber: invoiceNo,
            supplierId: meta.supplierId,
            firmId,
            date: meta.date || new Date().toISOString().split('T')[0],
            status,
            paymentStatus,
            paidAmount: Number.isFinite(paidAmount) ? paidAmount : 0,
            paymentMethod: (meta.paymentmethod || meta.paymentMethod || 'Bank Transfer') as PaymentMethod,
            notes: meta.notes || undefined,
        }, items));
    }

    if (purchases.length === 0 && errors.length === 0) {
        errors.push('No valid purchase rows found in CSV.');
    }

    return { purchases, errors, warnings };
}

export function findDuplicatePurchases(
    drafts: ParsedPurchaseDraft[],
    existing: Purchase[],
): { draft: ParsedPurchaseDraft; existingId: string }[] {
    const duplicates: { draft: ParsedPurchaseDraft; existingId: string }[] = [];
    for (const draft of drafts) {
        const match = existing.find(p =>
            p.firmId === draft.firmId &&
            p.supplierId === draft.supplierId &&
            p.supplierInvoiceNumber.toLowerCase() === draft.supplierInvoiceNumber.toLowerCase()
        );
        if (match) duplicates.push({ draft, existingId: match.id });
    }
    return duplicates;
}

export function purchaseCsvTemplate(): string {
    const header = [...CSV_HEADERS, 'serialNumbers'].join(',');
    const sample = [
        'INV-1001',
        'Exide Distributor',
        '2026-01-15',
        'Exide 150Ah Tubular',
        '2',
        '8500',
        '12000',
        '18',
        'BATCH-2026-A',
        'New',
        'Received',
        'Due',
        '',
        '',
        'Bank Transfer',
        'Imported bill',
        'SN001|SN002',
    ].map(v => v.includes(',') ? `"${v}"` : v).join(',');
    return `${header}\n${sample}\n`;
}
