export type ReportPeriod =
    | 'today'
    | 'last7'
    | 'last30'
    | 'this_week'
    | 'prev_week'
    | 'month'
    | 'prev_month'
    | 'this_year'
    | 'prev_year';

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
    today: 'Today',
    last7: '7 Days',
    last30: '30 Days',
    this_week: 'This Week',
    prev_week: 'Last Week',
    month: 'This Month',
    prev_month: 'Last Month',
    this_year: 'This Year',
    prev_year: 'Last Year',
};

export type DateRange = {
    startDate: Date;
    endDate: Date;
    periodDays: number;
};

/** Calendar week starting Monday (ISO-style). */
export function getMondayStart(date: Date): Date {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function toDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
}

export function endOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

export function startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function daysInclusive(start: Date, end: Date): number {
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

export function getReportDateRange(period: ReportPeriod, referenceDate = new Date()): DateRange {
    const now = referenceDate;
    const today = startOfDay(now);
    let startDate: Date;
    let endDate: Date = endOfDay(now);

    switch (period) {
        case 'today':
            startDate = today;
            break;
        case 'last7':
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 6);
            break;
        case 'last30':
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 29);
            break;
        case 'this_week':
            startDate = getMondayStart(today);
            break;
        case 'prev_week': {
            const thisMonday = getMondayStart(today);
            endDate = endOfDay(new Date(thisMonday));
            endDate.setDate(endDate.getDate() - 1);
            startDate = getMondayStart(endDate);
            break;
        }
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'prev_month':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
            break;
        case 'this_year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
        case 'prev_year':
            startDate = new Date(now.getFullYear() - 1, 0, 1);
            endDate = endOfDay(new Date(now.getFullYear() - 1, 11, 31));
            break;
        default:
            startDate = today;
    }

    startDate = startOfDay(startDate);
    return { startDate, endDate, periodDays: daysInclusive(startDate, endDate) };
}

export function getPreviousPeriodDateRange(period: ReportPeriod, referenceDate = new Date()): DateRange {
    const now = referenceDate;
    const today = startOfDay(now);
    let startDate: Date;
    let endDate: Date;

    switch (period) {
        case 'today':
            endDate = endOfDay(new Date(today));
            endDate.setDate(endDate.getDate() - 1);
            startDate = startOfDay(endDate);
            break;
        case 'last7':
            endDate = endOfDay(new Date(today));
            endDate.setDate(endDate.getDate() - 7);
            startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 6);
            startDate = startOfDay(startDate);
            break;
        case 'last30':
            endDate = endOfDay(new Date(today));
            endDate.setDate(endDate.getDate() - 30);
            startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 29);
            startDate = startOfDay(startDate);
            break;
        case 'this_week': {
            const thisMonday = getMondayStart(today);
            endDate = endOfDay(new Date(thisMonday));
            endDate.setDate(endDate.getDate() - 1);
            startDate = getMondayStart(endDate);
            break;
        }
        case 'prev_week': {
            const prevWeekMonday = getMondayStart(today);
            prevWeekMonday.setDate(prevWeekMonday.getDate() - 7);
            startDate = prevWeekMonday;
            endDate = endOfDay(new Date(startDate));
            endDate.setDate(endDate.getDate() + 6);
            break;
        }
        case 'month':
            endDate = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
            startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
            break;
        case 'prev_month':
            startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            endDate = endOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 0));
            break;
        case 'this_year':
            startDate = new Date(now.getFullYear() - 1, 0, 1);
            endDate = endOfDay(new Date(now.getFullYear() - 1, 11, 31));
            break;
        case 'prev_year':
            startDate = new Date(now.getFullYear() - 2, 0, 1);
            endDate = endOfDay(new Date(now.getFullYear() - 2, 11, 31));
            break;
        default:
            startDate = today;
            endDate = endOfDay(today);
    }

    startDate = startOfDay(startDate);
    return { startDate, endDate, periodDays: daysInclusive(startDate, endDate) };
}

export function filterByDateRange<T extends { date: string }>(items: T[], range: DateRange): T[] {
    return items.filter(item => {
        const d = new Date(item.date);
        return d >= range.startDate && d <= range.endDate;
    });
}

export function isWeeklyPeriod(period: ReportPeriod): boolean {
    return period === 'this_week' || period === 'prev_week';
}

export function isYearlyPeriod(period: ReportPeriod): boolean {
    return period === 'this_year' || period === 'prev_year';
}

export function isMonthlyPeriod(period: ReportPeriod): boolean {
    return period === 'month' || period === 'prev_month';
}
