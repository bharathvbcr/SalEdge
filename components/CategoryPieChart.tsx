import React, { useMemo } from 'react';
import { Transaction } from '../types.ts';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useAppData } from '../context/AppDataContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';

// Fix: Defined the props interface for the component.
interface CategoryPieChartProps {
    transactions: Transaction[];
}

export const CategoryPieChart: React.FC<CategoryPieChartProps> = ({ transactions }) => {
    const { inventory } = useAppData();
    const { theme } = useTheme();
    // Fix: Get defaultFirm to display currency symbol.
    const { defaultFirm } = useConfig();

    const COLORS = {
        'New': '#22c55e',       // green-500
        'Refurbished': '#f59e0b', // amber-500
        'Buyback': '#3b82f6',     // blue-500
        'Custom': '#8b5cf6',      // violet-500
    };

    const data = useMemo(() => {
        const categorySales: { [key: string]: number } = {
            'New': 0,
            'Refurbished': 0,
            'Buyback': 0,
            'Custom': 0,
        };

        transactions.forEach(t => {
            t.items.forEach(item => {
                const saleValue = Math.abs(item.price * item.quantity);
                if (item.isBuyback) {
                    categorySales['Buyback'] += saleValue;
                } else if (item.isCustom) {
                    categorySales['Custom'] += saleValue;
                } else {
                    const inventoryItem = inventory.find(inv => inv.id === item.id);
                    if (inventoryItem && (inventoryItem.type === 'New' || inventoryItem.type === 'Refurbished')) {
                        categorySales[inventoryItem.type] += saleValue;
                    } else {
                        if(item.name.toLowerCase().includes('refurbished')) {
                            categorySales['Refurbished'] += saleValue;
                        } else {
                            categorySales['New'] += saleValue; // Default to New if not specified
                        }
                    }
                }
            });
        });
        
        return Object.entries(categorySales)
            .filter(([, value]) => value > 0)
            .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));

    }, [transactions, inventory]);
    
    const RADIAN = Math.PI / 180;
    const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
      const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
      const x = cx + radius * Math.cos(-midAngle * RADIAN);
      const y = cy + radius * Math.sin(-midAngle * RADIAN);

      if (percent < 0.05) return null; // Don't render label for small slices

      return (
        <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="font-bold text-xs">
          {`${(percent * 100).toFixed(0)}%`}
        </text>
      );
    };
    
    const legendTextColor = theme === 'dark' ? '#cbd5e1' : '#475569';

    return (
        <div className="card-section-padded h-96">
            <h3 className="text-lg font-bold text-text-primary mb-4">Sales by Category</h3>
             {data.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                    <p className="text-text-muted">No sales data available.</p>
                </div>
             ) : (
                <ResponsiveContainer width="100%" height="90%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={renderCustomizedLabel}
                            outerRadius="80%"
                            fill="#8884d8"
                            dataKey="value"
                            nameKey="name"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} />
                            ))}
                        </Pie>
                        <Tooltip
                            // Fix: Use defaultFirm for currency symbol.
                            formatter={(value: number) => `${defaultFirm?.financials.currencySymbol || '₹'}${value.toLocaleString('en-IN')}`}
                            contentStyle={{
                                backgroundColor: 'var(--bg-secondary)',
                                borderColor: 'var(--border-color)',
                                color: 'var(--text-primary)',
                                borderRadius: '0.5rem'
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