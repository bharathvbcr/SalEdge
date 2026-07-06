import { Transaction, Expense, Purchase, PaymentVoucher } from '../types.ts';

export function computeBalances(
    transactions: Transaction[],
    expenses: Expense[],
    purchases: Purchase[],
    paymentVouchers: PaymentVoucher[]
) {
    let cashBalance = 0;
    let bankBalance = 0;

    transactions.forEach(t => {
        t.payments.forEach(p => {
            if (p.method === 'Cash') cashBalance += p.amount;
            else bankBalance += p.amount;
        });
    });

    expenses.forEach(e => {
        const method = e.method ?? 'Cash';
        if (method === 'Cash') cashBalance -= e.amount;
        else bankBalance -= e.amount;
    });

    purchases.forEach(p => {
        if (p.paidAmount > 0) {
            const method = p.paymentMethod ?? 'Bank Transfer';
            if (method === 'Cash') cashBalance -= p.paidAmount;
            else bankBalance -= p.paidAmount;
        }
    });

    paymentVouchers.forEach(v => {
        const isCash = v.method === 'Cash';
        if (v.type === 'Receipt') {
            if (isCash) cashBalance += v.amount;
            else bankBalance += v.amount;
        } else if (v.type === 'Payment') {
            if (isCash) cashBalance -= v.amount;
            else bankBalance -= v.amount;
        } else if (v.type === 'Contra' && isCash) {
            cashBalance -= v.amount;
            bankBalance += v.amount;
        }
    });

    return { cashBalance, bankBalance };
}
