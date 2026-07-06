
import React, { useState, useMemo, useCallback } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { Expense } from '../types.ts';
import { IconPlus, IconTrash, IconReceipt } from './icons.tsx';
import { ExpenseForm } from './ExpenseForm.tsx';
import { EmptyState } from './EmptyState.tsx';
import { ConfirmationModal } from './ConfirmationModal.tsx';
import { PageHeader } from './PageHeader.tsx';
import { SearchInput } from './SearchInput.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useTheme } from '../context/ThemeContext.tsx';
import { consumeOpenExpenseFormRequest } from '../utils/pageActions.ts';
import type { ExpenseFormPrefill } from '../utils/pageActions.ts';
import { usePageIntent } from '../hooks/usePageIntent.ts';

export const ExpensesPage: React.FC = () => {
    const { expenses, addExpense, updateExpense, deleteExpense } = useAppData();
    const { defaultFirm } = useConfig();
    const { theme } = useTheme();
    const [isFormOpen, setFormOpen] = useState(false);
    const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
    const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [formPrefill, setFormPrefill] = useState<ExpenseFormPrefill | null>(null);

    const applyExpenseFormIntent = useCallback(() => {
        const request = consumeOpenExpenseFormRequest();
        if (request) {
            setFormPrefill(request);
            setExpenseToEdit(null);
            setFormOpen(true);
        }
    }, []);

    usePageIntent(applyExpenseFormIntent);
    
    const filteredExpenses = useMemo(() => {
        if (!searchQuery) return expenses;
        const lowerQuery = searchQuery.toLowerCase();
        return expenses.filter(e => 
            e.description.toLowerCase().includes(lowerQuery) ||
            e.category.toLowerCase().includes(lowerQuery)
        );
    }, [expenses, searchQuery]);
    
    const chartData = useMemo(() => {
        const data: Record<string, number> = {};
        filteredExpenses.forEach(e => {
            data[e.category] = (data[e.category] || 0) + e.amount;
        });
        return Object.entries(data)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [filteredExpenses]);

    const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#06b6d4', '#6366f1', '#8b5cf6', '#d946ef'];
    const legendTextColor = theme === 'dark' ? '#cbd5e1' : '#475569';

    const handleSaveExpense = (data: Omit<Expense, 'id'> | Expense) => {
        if ('id' in data) {
            updateExpense(data);
        } else {
            addExpense(data);
        }
        setFormOpen(false);
        setExpenseToEdit(null);
        setFormPrefill(null);
    };

    const handleEditClick = (expense: Expense) => {
        setExpenseToEdit(expense);
        setFormOpen(true);
    };

    const handleDeleteClick = (expense: Expense) => {
        setExpenseToDelete(expense);
    };

    const handleDeleteConfirm = () => {
        if (expenseToDelete) {
            deleteExpense(expenseToDelete.id);
            setExpenseToDelete(null);
        }
    };
    
    return (
        <div className="page-shell">
            <PageHeader title="Expense Management" subtitle="Track shop expenses by category">
                <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search expenses..." />
                <button onClick={() => { setExpenseToEdit(null); setFormOpen(true); }} className="btn-primary flex-shrink-0">
                    <IconPlus className="h-4 w-4" /> New Expense
                </button>
            </PageHeader>

            {/* Expense Analytics Chart */}
            {chartData.length > 0 && (
                <div className="card-section-padded">
                    <h3 className="text-lg font-bold text-text-primary mb-4">Expenses by Category</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                     formatter={(value: number) => `${defaultFirm?.financials.currencySymbol || '₹'}${value.toLocaleString('en-IN')}`}
                                     contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', borderRadius: '0.5rem' }}
                                />
                                <Legend 
                                    formatter={(value) => <span style={{ color: legendTextColor }}>{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className="card-section">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-text-secondary">
                        <thead className="text-xs text-text-primary uppercase bg-bg-tertiary sticky top-0 z-10">
                            <tr>
                                <th className="p-4">Date</th>
                                <th className="p-4">Category</th>
                                <th className="p-4">Description</th>
                                <th className="p-4">Method</th>
                                <th className="p-4 text-right">Amount</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredExpenses.length > 0 ? filteredExpenses.map((e) => (
                                <tr key={e.id} className="border-b border-border-color hover:bg-bg-tertiary">
                                    <td className="p-4">{new Date(e.date).toLocaleDateString()}</td>
                                    <td className="p-4"><span className="px-2 py-1 text-xs font-medium rounded-full bg-status-blue-bg text-status-blue-text">{e.category}</span></td>
                                    <td className="p-4 font-medium text-text-primary">{e.description}</td>
                                    <td className="p-4">{e.method ?? 'Cash'}</td>
                                    <td className="p-4 text-right font-bold text-red-500">{defaultFirm?.financials.currencySymbol || '₹'}{e.amount.toLocaleString('en-IN')}</td>
                                    <td className="p-4">
                                        <div className="flex justify-center items-center gap-4">
                                            <button onClick={() => handleEditClick(e)} className="btn-link text-sm">Edit</button>
                                            <button onClick={() => handleDeleteClick(e)} className="btn-icon text-red-500 hover:bg-red-500/10" aria-label="Delete expense"><IconTrash /></button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6}>
                                        <EmptyState icon={<IconReceipt />} title="No Expenses Found" message="Log your first expense to track your business costs." action={{label: 'Log New Expense', onClick: () => setFormOpen(true)}} />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isFormOpen && (
                <ExpenseForm
                    expense={expenseToEdit}
                    initialData={formPrefill ?? undefined}
                    onSave={handleSaveExpense}
                    onClose={() => { setFormOpen(false); setFormPrefill(null); }}
                />
            )}
            {expenseToDelete && <ConfirmationModal title="Delete Expense" message={`Are you sure you want to delete this expense of ${defaultFirm?.financials.currencySymbol || '₹'}${expenseToDelete.amount}? This cannot be undone.`} confirmText="Delete" onConfirm={handleDeleteConfirm} onCancel={() => setExpenseToDelete(null)} />}
        </div>
    );
};
