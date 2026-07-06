import React, { useMemo } from 'react';
import { Transaction } from '../types.ts';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useTheme } from '../context/ThemeContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';

const CATEGORY_COLORS = [
    '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#84cc16', '#64748b',
];

interface SaleCategoryPieChartProps {
    transactions: Transaction[];
}

export const SaleCategoryPieChart: React.FC<SaleCategoryPieChartProps> = ({ transactions }) => {
    const { theme } = useTheme();
    const { defaultFirm } = useConfig();

    const data = useMemo(() => {
        const categorySales: Record<string, number> = {};

        transactions
            .filter(t => t.type === 'Sale' && t.status !== 'Quotation')
            .forEach(t => {
                const label = t.saleCategory || 'Uncategorized';
                categorySales[label] = (categorySales[label] || 0) + Math.abs(t.total);
            });

        return Object.entries(categorySales)
            .filter(([, value]) => value > 0)
            .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
            .sort((a, b) => b.value - a.value);
    }, [transactions]);

    const RADIAN = Math.PI / 180;
    const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
        if (percent < 0.05) return null;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);
        return (
            <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="font-bold text-xs">
                {`${(percent * 100).toFixed(0)}%`}
            </text>
        );
    };

    const legendTextColor = theme === 'dark' ? '#cbd5e1' : '#475569';

    return (
        <div className="card-section-padded h-96">
            <h3 className="text-lg font-bold text-text-primary mb-4">Sales by Vehicle Category</h3>
            {data.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                    <p className="text-text-muted">No categorized sales yet.</p>
                </div>
            ) : (
                <ResponsiveContainer width="100%" height="90%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={renderLabel}
                            outerRadius="80%"
                            dataKey="value"
                            nameKey="name"
                        >
                            {data.map((entry, index) => (
                                <Cell key={entry.name} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip
                            formatter={(value: number) => `${defaultFirm?.financials.currencySymbol || '₹'}${value.toLocaleString('en-IN')}`}
                            contentStyle={{
                                backgroundColor: 'var(--bg-secondary)',
                                borderColor: 'var(--border-color)',
                                color: 'var(--text-primary)',
                                borderRadius: '0.5rem',
                            }}
                        />
                        <Legend
                            iconType="circle"
                            formatter={(value) => <span style={{ color: legendTextColor }}>{value}</span>}
                        />
                    </PieChart>
                </ResponsiveContainer>
            )}
        </div>
    );
};
