import { WarrantyLog } from '../types.ts';

export interface WarrantyStatus {
    text: 'In Guarantee' | 'In Warranty' | 'Expired' | 'Not Sold';
    className: string;
    daysRemaining: number | null;
    phase: 'guarantee' | 'warranty' | 'expired' | 'none';
}

export function getWarrantyStatus(log: WarrantyLog): WarrantyStatus {
    const now = new Date();
    const guaranteeEnd = new Date(log.guaranteeEndDate);
    const warrantyEnd = new Date(log.warrantyEndDate);

    if (now <= guaranteeEnd) {
        const days = Math.ceil((guaranteeEnd.getTime() - now.getTime()) / 86400000);
        return {
            text: 'In Guarantee',
            className: 'bg-status-green-bg text-status-green-text',
            daysRemaining: days,
            phase: 'guarantee',
        };
    }
    if (now <= warrantyEnd) {
        const days = Math.ceil((warrantyEnd.getTime() - now.getTime()) / 86400000);
        return {
            text: 'In Warranty',
            className: 'bg-status-yellow-bg text-status-yellow-text',
            daysRemaining: days,
            phase: 'warranty',
        };
    }
    return {
        text: 'Expired',
        className: 'bg-status-red-bg text-status-red-text',
        daysRemaining: 0,
        phase: 'expired',
    };
}

export function lookupWarrantyBySerial(serial: string, logs: WarrantyLog[]): WarrantyLog | null {
    const q = serial.trim().toLowerCase();
    if (!q) return null;
    return logs.find(l => l.serialNumber.toLowerCase() === q) ?? null;
}

export function searchWarrantyLogs(query: string, logs: WarrantyLog[], limit = 10): WarrantyLog[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return logs
        .filter(l =>
            l.serialNumber.toLowerCase().includes(q) ||
            l.customerName.toLowerCase().includes(q) ||
            l.customerPhone.includes(q) ||
            l.productName.toLowerCase().includes(q)
        )
        .sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime())
        .slice(0, limit);
}
