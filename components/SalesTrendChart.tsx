
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTheme } from '../context/ThemeContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';

const CustomTooltip = ({ active, payload, label }: any) => {
    const { defaultFirm } = useConfig();
    if (active && payload && payload.length) {
        return (
            <div className="bg-bg-secondary/80 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-border-color">
                <p className="label font-bold text-text-primary">{`${label}`}</p>
                {payload.map((p: any) => (
                    <p key={p.name} className="intro text-text-secondary" style={{ color: p.color }}>
                        {p.name}: {defaultFirm?.financials.currencySymbol || '₹'}{p.value.toLocaleString('en-IN')}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

interface ChartDataPoint {
    date: string;
    sales: number;
    expenses: number;
}
interface SalesTrendChartProps {
    data: ChartDataPoint[];
}

export const SalesTrendChart: React.FC<SalesTrendChartProps> = ({ data }) => {
    const { theme } = useTheme();
    const { defaultFirm } = useConfig();

    const colors = {
        light: { text: '#475569', lineSales: '#16a34a', lineExpenses: '#dc2626', grid: '#e2e8f0' },
        dark: { text: '#94a3b8', lineSales: '#4ade80', lineExpenses: '#f87171', grid: '#334155' }
    };

    const themeColors = colors[theme];

    return (
        <div className="card-section-padded h-96">
            <h3 className="text-lg font-bold text-text-primary mb-4">Financial Trend (Sales vs Expenses)</h3>
            <ResponsiveContainer width="100%" height="90%">
                <LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={themeColors.grid} />
                    <XAxis dataKey="date" tick={{ fill: themeColors.text, fontSize: 12 }} tickLine={{ stroke: themeColors.text }} />
                    <YAxis tickFormatter={(value) => `${defaultFirm?.financials.currencySymbol || '₹'}${Number(value) / 1000}k`} tick={{ fill: themeColors.text, fontSize: 12 }} tickLine={{ stroke: themeColors.text }} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(211, 47, 47, 0.1)' }} />
                    <Legend wrapperStyle={{ fontSize: '14px' }} />
                    <Line type="monotone" dataKey="sales" name="Sales" stroke={themeColors.lineSales} strokeWidth={3} dot={{ r: 3, fill: themeColors.lineSales }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="expenses" name="Expenses" stroke={themeColors.lineExpenses} strokeWidth={2} dot={{ r: 3, fill: themeColors.lineExpenses }} activeDot={{ r: 6 }} strokeDasharray="5 5" />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};
