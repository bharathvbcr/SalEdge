import { WarrantyLog } from '../types.ts';
import { calendarDaysUntil, isOnOrBeforeDay } from './warrantyDates.ts';

export interface WarrantyStatus {
    text: 'In Guarantee' | 'In Warranty' | 'Expired' | 'Not Sold';
    className: string;
    daysRemaining: number | null;
    phase: 'guarantee' | 'warranty' | 'expired' | 'none';
}

export function getWarrantyStatus(log: WarrantyLog): WarrantyStatus {
    // Compare on LOCAL CALENDAR DAYS so coverage doesn't lapse mid-morning of
    // the expiry day for IST users (ends were stored as UTC instants).
    const now = new Date();
    const guaranteeEnd = new Date(log.guaranteeEndDate);
    const warrantyEnd = new Date(log.warrantyEndDate);

    if (isOnOrBeforeDay(now, guaranteeEnd)) {
        return {
            text: 'In Guarantee',
            className: 'bg-status-green-bg text-status-green-text',
            daysRemaining: Math.max(0, calendarDaysUntil(guaranteeEnd, now)),
            phase: 'guarantee',
        };
    }
    if (isOnOrBeforeDay(now, warrantyEnd)) {
        return {
            text: 'In Warranty',
            className: 'bg-status-yellow-bg text-status-yellow-text',
            daysRemaining: Math.max(0, calendarDaysUntil(warrantyEnd, now)),
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

export function searchWarrantyLogs(query: string, logs: WarrantyLog[], limit?: number): WarrantyLog[] {
    const q = query.trim().toLowerCase();
    const sorted = [...logs].sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
    if (!q) {
        return limit == null ? sorted : sorted.slice(0, limit);
    }
    const matched = sorted.filter(l =>
        l.serialNumber.toLowerCase().includes(q) ||
        l.customerName.toLowerCase().includes(q) ||
        l.customerPhone.includes(q) ||
        l.productName.toLowerCase().includes(q) ||
        (l.saleCategory?.toLowerCase().includes(q) ?? false) ||
        (l.vehicleNumber?.toLowerCase().includes(q) ?? false) ||
        (l.vehicleModel?.toLowerCase().includes(q) ?? false)
    );
    return limit == null ? matched : matched.slice(0, limit);
}
