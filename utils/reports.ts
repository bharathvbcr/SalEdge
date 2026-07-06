import { Transaction, Purchase, Expense, InventoryItem, InventoryLog, ProductType } from '../types.ts';

export type AgingBucket = {
    count: number;
    amount: number;
};

export type AgingSummary = {
    current: AgingBucket;
    days31_60: AgingBucket;
    days61_90: AgingBucket;
    over90: AgingBucket;
    total: AgingBucket;
};

export function getAgingBucket(daysPast: number): keyof Omit<AgingSummary, 'total'> {
    if (daysPast <= 30) return 'current';
    if (daysPast <= 60) return 'days31_60';
    if (daysPast <= 90) return 'days61_90';
    return 'over90';
}

export function computeReceivablesAging(transactions: Transaction[]): {
    aging: AgingSummary;
    topDebtors: { name: string; phone: string; amount: number; oldestDays: number }[];
} {
    const now = new Date();
    const aging: AgingSummary = {
        current: { count: 0, amount: 0 },
        days31_60: { count: 0, amount: 0 },
        days61_90: { count: 0, amount: 0 },
        over90: { count: 0, amount: 0 },
        total: { count: 0, amount: 0 },
    };
    const customerDue: Record<string, { name: string; phone: string; amount: number; oldestDays: number }> = {};

    transactions
        .filter(t => t.status === 'Due')
        .forEach(t => {
            const dueDate = t.paymentDueDate ? new Date(t.paymentDueDate) : new Date(t.date);
            const daysPast = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            const paidAmount = t.payments.reduce((sum, p) => sum + p.amount, 0);
            const dueAmount = t.total - paidAmount;
            if (dueAmount <= 0) return;

            const bucket = getAgingBucket(daysPast);
            aging[bucket].count++;
            aging[bucket].amount += dueAmount;
            aging.total.count++;
            aging.total.amount += dueAmount;

            const key = `${t.customerName}|${t.customerPhone}`;
            if (!customerDue[key]) {
                customerDue[key] = { name: t.customerName, phone: t.customerPhone || '', amount: 0, oldestDays: 0 };
            }
            customerDue[key].amount += dueAmount;
            customerDue[key].oldestDays = Math.max(customerDue[key].oldestDays, daysPast);
        });

    const topDebtors = Object.values(customerDue).sort((a, b) => b.amount - a.amount).slice(0, 5);
    return { aging, topDebtors };
}

export function computePayablesAging(purchases: Purchase[], suppliers: { id: string; name: string }[]): {
    aging: AgingSummary;
    topCreditors: { name: string; amount: number; oldestDays: number }[];
} {
    const now = new Date();
    const aging: AgingSummary = {
        current: { count: 0, amount: 0 },
        days31_60: { count: 0, amount: 0 },
        days61_90: { count: 0, amount: 0 },
        over90: { count: 0, amount: 0 },
        total: { count: 0, amount: 0 },
    };
    const supplierDue: Record<string, { name: string; amount: number; oldestDays: number }> = {};

    purchases
        .filter(p => p.paymentStatus === 'Due' || p.paymentStatus === 'Partial')
        .forEach(p => {
            const dueAmount = p.totalAmount - p.paidAmount;
            if (dueAmount <= 0) return;

            const dueDate = p.paymentDueDate ? new Date(p.paymentDueDate) : new Date(p.date);
            const daysPast = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            const bucket = getAgingBucket(daysPast);
            aging[bucket].count++;
            aging[bucket].amount += dueAmount;
            aging.total.count++;
            aging.total.amount += dueAmount;

            const supplier = suppliers.find(s => s.id === p.supplierId);
            const name = supplier?.name || 'Unknown Supplier';
            if (!supplierDue[p.supplierId]) {
                supplierDue[p.supplierId] = { name, amount: 0, oldestDays: 0 };
            }
            supplierDue[p.supplierId].amount += dueAmount;
            supplierDue[p.supplierId].oldestDays = Math.max(supplierDue[p.supplierId].oldestDays, daysPast);
        });

    const topCreditors = Object.values(supplierDue).sort((a, b) => b.amount - a.amount).slice(0, 5);
    return { aging, topCreditors };
}

export type HsnSummaryRow = {
    hsn: string;
    description: string;
    qty: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalValue: number;
};

export function computeHsnSummary(
    transactions: Transaction[],
    productTypes: ProductType[],
    defaultGstRate: number
): HsnSummaryRow[] {
    const hsnMap: Record<string, HsnSummaryRow> = {};

    transactions
        .filter(t => (t.status === 'Paid' || t.status === 'Due') && t.type !== 'Return')
        .forEach(t => {
            t.items.forEach(item => {
                if (item.isBuyback) return;

                const productType = productTypes.find(pt => `${pt.brandName} ${pt.name}` === item.name);
                const hsn = item.hsnCode || productType?.hsnCode || '8507';
                const gstRate = item.gstRate ?? defaultGstRate;

                if (!hsnMap[hsn]) {
                    hsnMap[hsn] = { hsn, description: item.name, qty: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalValue: 0 };
                }

                const itemGross = item.price * item.quantity;
                const itemDiscount = item.discount
                    ? (item.discount.type === 'percentage' ? itemGross * (item.discount.value / 100) : item.discount.value * item.quantity)
                    : 0;
                const itemNet = itemGross - itemDiscount;
                const cgst = item.cgstAmount ?? (t.isInterstate ? 0 : itemNet * (gstRate / 200));
                const sgst = item.sgstAmount ?? (t.isInterstate ? 0 : itemNet * (gstRate / 200));
                const igst = item.igstAmount ?? (t.isInterstate ? itemNet * (gstRate / 100) : 0);

                hsnMap[hsn].qty += item.quantity;
                hsnMap[hsn].taxableValue += itemNet;
                hsnMap[hsn].cgst += cgst;
                hsnMap[hsn].sgst += sgst;
                hsnMap[hsn].igst += igst;
                hsnMap[hsn].totalValue += itemNet + cgst + sgst + igst;
            });
        });

    return Object.values(hsnMap).sort((a, b) => b.taxableValue - a.taxableValue);
}

export type ProfitLossStatement = {
    revenue: number;
    returns: number;
    netRevenue: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    expenseByCategory: Record<string, number>;
};

export function computeProfitLoss(
    transactions: Transaction[],
    expenses: Expense[]
): ProfitLossStatement {
    let revenue = 0;
    let returns = 0;
    let cogs = 0;

    transactions.forEach(t => {
        if (t.type === 'Return') {
            returns += t.total;
            t.items.forEach(item => {
                if (!item.isBuyback && item.purchasePrice) {
                    cogs -= item.purchasePrice * item.quantity;
                }
            });
            return;
        }
        if (t.status === 'Quotation') return;

        revenue += t.total - t.taxAmount;
        t.items.forEach(item => {
            if (!item.isBuyback && item.purchasePrice) {
                cogs += item.purchasePrice * item.quantity;
            }
        });
    });

    const expenseByCategory: Record<string, number> = {};
    expenses.forEach(e => {
        expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount;
    });
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const netRevenue = revenue;
    const grossProfit = netRevenue - cogs;

    return {
        revenue,
        returns,
        netRevenue,
        cogs,
        grossProfit,
        expenses: totalExpenses,
        netProfit: grossProfit - totalExpenses,
        expenseByCategory,
    };
}

export type InventoryTurnoverRow = {
    productName: string;
    unitsSold: number;
    avgInventory: number;
    turnoverRatio: number;
    daysToSell: number;
};

export function computeInventoryTurnover(
    transactions: Transaction[],
    inventory: InventoryItem[],
    productTypes: ProductType[],
    periodDays: number
): InventoryTurnoverRow[] {
    const soldByProduct: Record<string, number> = {};
    const stockByProduct: Record<string, number> = {};

    transactions
        .filter(t => t.type !== 'Return' && t.status !== 'Quotation')
        .forEach(t => {
            t.items.forEach(item => {
                if (item.isBuyback || item.isCustom) return;
                soldByProduct[item.name] = (soldByProduct[item.name] || 0) + item.quantity;
            });
        });

    inventory.forEach(item => {
        const pt = productTypes.find(p => p.id === item.productTypeId);
        const name = pt ? `${pt.brandName} ${pt.name}` : 'Unknown';
        stockByProduct[name] = (stockByProduct[name] || 0) + item.stock;
    });

    const allProducts = new Set([...Object.keys(soldByProduct), ...Object.keys(stockByProduct)]);

    return Array.from(allProducts)
        .map(productName => {
            const unitsSold = soldByProduct[productName] || 0;
            const avgInventory = stockByProduct[productName] || 0;
            const turnoverRatio = avgInventory > 0 ? unitsSold / avgInventory : unitsSold > 0 ? Infinity : 0;
            const daysToSell = turnoverRatio > 0 && turnoverRatio !== Infinity ? Math.round(periodDays / turnoverRatio) : 999;
            return { productName, unitsSold, avgInventory, turnoverRatio: turnoverRatio === Infinity ? 0 : turnoverRatio, daysToSell };
        })
        .filter(r => r.unitsSold > 0 || r.avgInventory > 0)
        .sort((a, b) => b.turnoverRatio - a.turnoverRatio);
}

export type SlowMovingRow = {
    productName: string;
    stock: number;
    value: number;
    daysSinceLastSale: number;
    lastSaleDate: string | null;
};

export function computeSlowMovingStock(
    transactions: Transaction[],
    inventory: InventoryItem[],
    productTypes: ProductType[]
): SlowMovingRow[] {
    const now = new Date();
    const lastSaleByProduct: Record<string, string> = {};

    transactions
        .filter(t => t.type !== 'Return' && t.status !== 'Quotation')
        .forEach(t => {
            t.items.forEach(item => {
                if (item.isBuyback || item.isCustom) return;
                const existing = lastSaleByProduct[item.name];
                if (!existing || new Date(t.date) > new Date(existing)) {
                    lastSaleByProduct[item.name] = t.date;
                }
            });
        });

    const rows: SlowMovingRow[] = [];
    const seenProducts = new Set<string>();

    inventory.forEach(item => {
        if (item.stock <= 0) return;
        const pt = productTypes.find(p => p.id === item.productTypeId);
        const productName = pt ? `${pt.brandName} ${pt.name}` : 'Unknown';
        if (seenProducts.has(productName)) return;
        seenProducts.add(productName);

        const totalStock = inventory
            .filter(i => i.productTypeId === item.productTypeId)
            .reduce((sum, i) => sum + i.stock, 0);
        const totalValue = inventory
            .filter(i => i.productTypeId === item.productTypeId)
            .reduce((sum, i) => sum + i.purchasePrice * i.stock, 0);

        const lastSale = lastSaleByProduct[productName];
        const daysSinceLastSale = lastSale
            ? Math.floor((now.getTime() - new Date(lastSale).getTime()) / (1000 * 60 * 60 * 24))
            : 999;

        rows.push({ productName, stock: totalStock, value: totalValue, daysSinceLastSale, lastSaleDate: lastSale || null });
    });

    return rows.sort((a, b) => b.daysSinceLastSale - a.daysSinceLastSale);
}

export function getUpcomingDues<T extends { paymentDueDate?: string; date: string }>(
    items: T[],
    getDueAmount: (item: T) => number,
    withinDays = 7
): (T & { dueAmount: number; daysUntilDue: number })[] {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + withinDays);

    return items
        .map(item => {
            const dueAmount = getDueAmount(item);
            if (dueAmount <= 0) return null;
            const dueDate = new Date(item.paymentDueDate || item.date);
            dueDate.setHours(0, 0, 0, 0);
            const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntilDue < 0 || daysUntilDue > withinDays) return null;
            return { ...item, dueAmount, daysUntilDue };
        })
        .filter((x): x is T & { dueAmount: number; daysUntilDue: number } => x !== null)
        .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

export type SalesCategoryRow = {
    category: string;
    count: number;
    revenue: number;
    avgTicket: number;
};

export function computeSalesByCategory(transactions: Transaction[]): SalesCategoryRow[] {
    const map: Record<string, { count: number; revenue: number }> = {};

    transactions
        .filter(t => t.type !== 'Return' && t.status !== 'Quotation')
        .forEach(t => {
            const cat = t.saleCategory || 'Uncategorized';
            if (!map[cat]) map[cat] = { count: 0, revenue: 0 };
            map[cat].count++;
            map[cat].revenue += t.total;
        });

    return Object.entries(map)
        .map(([category, { count, revenue }]) => ({
            category,
            count,
            revenue,
            avgTicket: count > 0 ? revenue / count : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);
}
