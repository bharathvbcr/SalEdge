/**
 * Warranty date math.
 *
 * Naive `setMonth(month + n)` overflows short months: Jan 31 + 1 month lands
 * on Mar 3, Aug 31 + 1 month on Oct 1, Feb 29 (leap) + 12 months on Mar 1 —
 * every warranty silently extends past policy. addMonthsClamped anchors to
 * the last valid day of the target month instead.
 */
export function addMonthsClamped(date: Date, months: number): Date {
    const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
    const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(date.getDate(), daysInTargetMonth));
    target.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
    return target;
}

export interface WarrantyWindow {
    guaranteeEndDate: string;
    warrantyEndDate: string;
}

export function computeWarrantyEnds(
    saleDate: string | Date,
    guaranteeMonths: number,
    warrantyMonths: number
): WarrantyWindow {
    const sale = typeof saleDate === 'string' ? new Date(saleDate) : saleDate;
    const guaranteeEnd = addMonthsClamped(sale, guaranteeMonths);
    const warrantyEnd = addMonthsClamped(sale, guaranteeMonths + warrantyMonths);
    return {
        guaranteeEndDate: guaranteeEnd.toISOString(),
        warrantyEndDate: warrantyEnd.toISOString(),
    };
}

function dayKey(date: Date): number {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole calendar days from today until `end` (negative once passed). */
export function calendarDaysUntil(end: Date, now: Date = new Date()): number {
    return Math.round((dayKey(end) - dayKey(now)) / 86400000);
}

/** True when `now` is on the same local day as `end` or earlier. */
export function isOnOrBeforeDay(now: Date, end: Date): boolean {
    return dayKey(now) <= dayKey(end);
}
