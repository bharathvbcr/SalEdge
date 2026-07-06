import { Transaction } from '../types.ts';

export type MonthlySalesRow = {
    month: string; // YYYY-MM
    label: string;
    revenue: number;
    count: number;
};

export type SeasonalComparison = {
    month: number; // 1-12
    label: string;
    currentYear: number;
    previousYear: number;
    yoyChange: number | null;
};

export type ForecastPoint = {
    date: string;
    predicted: number;
    isForecast: boolean;
};

export function computeMonthlySales(transactions: Transaction[]): MonthlySalesRow[] {
    const map: Record<string, MonthlySalesRow> = {};

    transactions
        .filter(t => t.type !== 'Return' && t.status !== 'Quotation')
        .forEach(t => {
            const d = new Date(t.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!map[key]) {
                map[key] = {
                    month: key,
                    label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
                    revenue: 0,
                    count: 0,
                };
            }
            map[key].revenue += t.total;
            map[key].count++;
        });

    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

export function computeSeasonalYoY(transactions: Transaction[]): SeasonalComparison[] {
    const now = new Date();
    const currentYear = now.getFullYear();
    const prevYear = currentYear - 1;

    const byMonthYear: Record<string, number> = {};
    transactions
        .filter(t => t.type !== 'Return' && t.status !== 'Quotation')
        .forEach(t => {
            const d = new Date(t.date);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            byMonthYear[key] = (byMonthYear[key] || 0) + t.total;
        });

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map((label, idx) => {
        const current = byMonthYear[`${currentYear}-${idx}`] || 0;
        const previous = byMonthYear[`${prevYear}-${idx}`] || 0;
        const yoyChange = previous > 0 ? ((current - previous) / previous) * 100 : null;
        return { month: idx + 1, label, currentYear: current, previousYear: previous, yoyChange };
    });
}

export function computeMovingAverageForecast(
    transactions: Transaction[],
    windowDays = 30,
    forecastDays = 30
): ForecastPoint[] {
    const dailyRevenue: Record<string, number> = {};
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    transactions
        .filter(t => t.type !== 'Return' && t.status !== 'Quotation')
        .forEach(t => {
            const d = new Date(t.date);
            d.setHours(0, 0, 0, 0);
            const key = d.toISOString().split('T')[0];
            dailyRevenue[key] = (dailyRevenue[key] || 0) + t.total;
        });

    const points: ForecastPoint[] = [];
    const historyStart = new Date(now);
    historyStart.setDate(historyStart.getDate() - windowDays);

    for (let i = 0; i < windowDays; i++) {
        const d = new Date(historyStart);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().split('T')[0];
        points.push({ date: key, predicted: dailyRevenue[key] || 0, isForecast: false });
    }

    const recentValues = points.map(p => p.predicted);
    const avg = recentValues.reduce((s, v) => s + v, 0) / Math.max(1, recentValues.length);

    for (let i = 1; i <= forecastDays; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        points.push({
            date: d.toISOString().split('T')[0],
            predicted: Math.round(avg * 100) / 100,
            isForecast: true,
        });
    }

    return points;
}

export function computeMomGrowth(monthlySales: MonthlySalesRow[]): { month: string; growth: number | null }[] {
    return monthlySales.map((row, idx) => {
        if (idx === 0) return { month: row.month, growth: null };
        const prev = monthlySales[idx - 1].revenue;
        const growth = prev > 0 ? ((row.revenue - prev) / prev) * 100 : null;
        return { month: row.month, growth };
    });
}
