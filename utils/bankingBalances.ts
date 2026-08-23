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
        // Return (credit note) payments are refunds: money leaves the drawer /
        // bank. Payment amounts are stored positive for returns, so flip the
        // direction instead of adding the payout as income.
        const direction = t.type === 'Return' ? -1 : 1;
        t.payments.forEach(p => {
            if (p.method === 'Cash') cashBalance += direction * p.amount;
            else bankBalance += direction * p.amount;
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
        } else if (v.type === 'Contra') {
            // Contra = transfer between own accounts. Method Cash means the
            // drawer was deposited into the bank; any other method means a
            // withdrawal from the bank into the drawer. Previously non-cash
            // contras were silently ignored and balances didn't move.
            if (isCash) {
                cashBalance -= v.amount;
                bankBalance += v.amount;
            } else {
                cashBalance += v.amount;
                bankBalance -= v.amount;
            }
        }
    });

    return { cashBalance, bankBalance };
}
