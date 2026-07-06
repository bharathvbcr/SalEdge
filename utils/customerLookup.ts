import { Transaction } from '../types.ts';

export interface CustomerRecord {
    name: string;
    phone: string;
    gst?: string;
    address?: string;
    vehicleNo?: string;
    vehicleModel?: string;
    saleCategory?: string;
    lastSeen?: string;
}

export function buildCustomerIndex(transactions: Transaction[]): CustomerRecord[] {
    const customerMap = new Map<string, CustomerRecord & { lastSeenDate: number }>();

    transactions.forEach(t => {
        if (t.customerName === 'Walk-in' || t.status === 'Quotation') return;
        const key = `${t.customerName.toLowerCase()}|${t.customerPhone || ''}`;
        const dateMs = new Date(t.date).getTime();
        const existing = customerMap.get(key);
        if (!existing || dateMs > existing.lastSeenDate) {
            customerMap.set(key, {
                name: t.customerName,
                phone: t.customerPhone || '',
                gst: t.customerGst,
                address: t.billingAddress,
                vehicleNo: t.vehicleNumber,
                vehicleModel: t.vehicleModel,
                saleCategory: t.saleCategory,
                lastSeen: t.date,
                lastSeenDate: dateMs,
            });
        }
    });

    return Array.from(customerMap.values())
        .sort((a, b) => (b.lastSeenDate ?? 0) - (a.lastSeenDate ?? 0))
        .map(({ lastSeenDate: _, ...rest }) => rest);
}

export function searchCustomers(customers: CustomerRecord[], query: string): CustomerRecord[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const lower = trimmed.toLowerCase();
    const digits = trimmed.replace(/\D/g, '');

    return customers.filter(c => {
        if (c.name.toLowerCase().includes(lower)) return true;
        if (digits.length >= 3 && c.phone.includes(digits)) return true;
        if (digits.length === 10 && c.phone === digits) return true;
        return false;
    }).slice(0, 8);
}

export function findCustomerByPhone(customers: CustomerRecord[], phone: string): CustomerRecord | undefined {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) return undefined;
    return customers.find(c => c.phone === digits);
}
