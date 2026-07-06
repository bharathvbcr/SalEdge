import React from 'react';
import { IconPlus, IconTrash, IconAlertTriangle } from '../icons.tsx';
import { Payment, CustomerData, SaleTotals } from './types.ts';
import { FormField } from '../FormField.tsx';

interface LoyaltySettings {
    enabled: boolean;
    redemptionValue: number;
}

interface SalesFormPaymentSectionProps {
    overallDiscount: { type: 'percentage' | 'fixed'; value: number };
    setOverallDiscount: React.Dispatch<React.SetStateAction<{ type: 'percentage' | 'fixed'; value: number }>>;
    pointsToRedeem: number;
    setPointsToRedeem: (v: number) => void;
    selectedCustomerData: CustomerData | null;
    loyaltySettings: LoyaltySettings;
    taxRegime: 'Regular' | 'Composition';
    setTaxRegime: (v: 'Regular' | 'Composition') => void;
    notes: string;
    setNotes: (v: string) => void;
    payments: Payment[];
    onAddPayment: () => void;
    onRemovePayment: (id: number) => void;
    onUpdatePayment: (id: number, field: 'method' | 'amount', value: string | number) => void;
    onSetFullPayment: (id: number) => void;
    paymentDueDate: string;
    setPaymentDueDate: (v: string) => void;
    amountDue: number;
    totalPaid: number;
    totals: SaleTotals;
    additionalCharges: { description: string; amount: number };
    setAdditionalCharges: React.Dispatch<React.SetStateAction<{ description: string; amount: number }>>;
    currencySymbol: string;
    viewMode: boolean;
    isReturnMode: boolean;
    paymentDueDateError?: string;
}

export const SalesFormPaymentSection: React.FC<SalesFormPaymentSectionProps> = ({
    overallDiscount, setOverallDiscount, pointsToRedeem, setPointsToRedeem,
    selectedCustomerData, loyaltySettings, taxRegime, setTaxRegime, notes, setNotes,
    payments, onAddPayment, onRemovePayment, onUpdatePayment, onSetFullPayment,
    paymentDueDate, setPaymentDueDate, amountDue, totalPaid, totals, additionalCharges,
    setAdditionalCharges, currencySymbol, viewMode, isReturnMode, paymentDueDateError,
}) => {
    const { itemsTotal, buybackTotal, totalItemDiscount, subtotal, overallDiscountAmount, pointsDiscountValue, taxAmount, total, estimatedProfit } = totals;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pt-4 border-t border-border-color">
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 items-center">
                    <label className="font-medium text-text-secondary col-span-1">Overall Discount:</label>
                    <div className="col-span-2 flex gap-2">
                        <input disabled={isReturnMode} type="number" value={overallDiscount.value} min="0" onChange={e => setOverallDiscount(d => ({ ...d, value: parseFloat(e.target.value) || 0 }))} className="form-input w-2/3" />
                        <select disabled={isReturnMode} value={overallDiscount.type} onChange={e => setOverallDiscount(d => ({ ...d, type: e.target.value as 'percentage' | 'fixed' }))} className="form-input w-1/3"><option value="percentage">%</option><option value="fixed">{currencySymbol}</option></select>
                    </div>
                </div>

                {loyaltySettings.enabled && selectedCustomerData && !isReturnMode && (
                    <div className="grid grid-cols-3 gap-2 items-center">
                        <label className="font-medium text-text-secondary col-span-1">Redeem Points:</label>
                        <div className="col-span-2 flex gap-2 items-center">
                            <div className="relative w-2/3">
                                <input
                                    type="number"
                                    value={pointsToRedeem}
                                    min="0"
                                    max={selectedCustomerData.loyaltyPoints}
                                    onChange={e => setPointsToRedeem(Math.min(parseInt(e.target.value) || 0, selectedCustomerData.loyaltyPoints))}
                                    disabled={selectedCustomerData.loyaltyPoints === 0 || viewMode}
                                    className="form-input w-full pr-12"
                                />
                                <button
                                    type="button"
                                    onClick={() => setPointsToRedeem(selectedCustomerData.loyaltyPoints)}
                                    disabled={selectedCustomerData.loyaltyPoints === 0 || viewMode}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 text-xs badge badge-blue px-2 py-0.5 hover:opacity-80"
                                >
                                    Max
                                </button>
                            </div>
                            <span className="text-xs text-text-muted w-1/3">Avail: {selectedCustomerData.loyaltyPoints}</span>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-3 gap-2 items-center">
                    <label className="font-medium text-text-secondary col-span-1">Tax Regime:</label>
                    <select value={taxRegime} onChange={e => setTaxRegime(e.target.value as 'Regular' | 'Composition')} className="form-input col-span-2" disabled={isReturnMode}>
                        <option value="Regular">Regular GST</option>
                        <option value="Composition">Composition</option>
                    </select>
                </div>
                <div>
                    <label className="font-medium text-text-secondary mb-2 block">Invoice Notes</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="form-input" placeholder="e.g., Delivery required by 5 PM." />
                </div>
                <div>
                    <label className="font-medium text-text-secondary mb-2 block">{isReturnMode ? 'Refund Details' : 'Payments'}</label>
                    <div className="space-y-2">
                        {payments.map(payment => (
                            <div key={payment.id} className="grid grid-cols-12 gap-2 items-center">
                                <select value={payment.method} onChange={e => onUpdatePayment(payment.id, 'method', e.target.value as Payment['method'])} className="form-input col-span-4"><option value="Cash">Cash</option><option value="Card">Card</option><option value="UPI">UPI</option></select>
                                <input type="number" placeholder="0.00" value={payment.amount} onChange={e => onUpdatePayment(payment.id, 'amount', e.target.value ? parseFloat(e.target.value) : '')} className="form-input col-span-5 text-right" />
                                {!viewMode && (
                                    <div className="col-span-3 flex justify-end gap-1">
                                        <button type="button" onClick={() => onSetFullPayment(payment.id)} title="Set Full Amount" className="px-2 py-1 badge badge-green text-xs hover:opacity-80">Full</button>
                                        <button type="button" onClick={() => onRemovePayment(payment.id)} className="btn-icon text-negative hover:opacity-80 disabled:opacity-50" disabled={payments.length <= 1} aria-label="Remove payment"><IconTrash /></button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    {!viewMode && (
                        <button type="button" onClick={onAddPayment} className="btn-link-danger text-sm font-semibold mt-2 flex items-center gap-1"><IconPlus /> Add Payment Method</button>
                    )}
                </div>
                {amountDue > 0.01 && !isReturnMode && (
                    <FormField
                        label="Payment Due Date"
                        htmlFor="payment-due-date"
                        error={paymentDueDateError}
                        required
                    >
                        <div className="flex items-center gap-2">
                            <IconAlertTriangle className="h-4 w-4 text-negative animate-pulse flex-shrink-0" aria-hidden="true" />
                            <input
                                id="payment-due-date"
                                type="date"
                                value={paymentDueDate}
                                onChange={e => setPaymentDueDate(e.target.value)}
                                className={`form-input ${paymentDueDateError ? 'has-error' : ''}`}
                                aria-invalid={!!paymentDueDateError}
                            />
                        </div>
                    </FormField>
                )}
            </div>
            <div className="space-y-2 text-right font-medium text-text-secondary pr-2">
                <div className="flex justify-between items-center"><span className="text-text-muted">Items Total (Gross):</span><span className={isReturnMode ? 'text-negative' : ''}>{currencySymbol}{itemsTotal.toFixed(2)}</span></div>
                {buybackTotal < 0 && (
                    <div className="flex justify-between items-center"><span className="text-text-muted">Buyback Credit:</span><span className="text-positive">- {currencySymbol}{Math.abs(buybackTotal).toFixed(2)}</span></div>
                )}
                <div className="flex justify-between items-center"><span className="text-text-muted">Item Discounts:</span><span className="text-negative">- {currencySymbol}{totalItemDiscount.toFixed(2)}</span></div>
                <div className="flex justify-between items-center py-2 border-y border-border-color border-dashed">
                    <span className="text-text-muted text-sm flex items-center gap-2">Installation / Service Charge:</span>
                    <div className="flex items-center justify-end gap-2 w-1/3">
                        <span className="text-xs text-text-muted">{currencySymbol}</span>
                        <input disabled={viewMode} type="number" value={additionalCharges.amount} onChange={e => setAdditionalCharges(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))} className="form-input h-8 text-right py-1" />
                    </div>
                </div>
                <div className="flex justify-between items-center font-bold pt-1"><span className="text-text-muted">Subtotal (Net):</span><span className={isReturnMode ? 'text-negative' : ''}>{currencySymbol}{subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between items-center"><span className="text-text-muted">Overall Discount:</span><span className="text-negative">- {currencySymbol}{overallDiscountAmount.toFixed(2)}</span></div>
                {pointsDiscountValue > 0 && !isReturnMode && (
                    <div className="flex justify-between items-center text-info">
                        <span className="flex items-center gap-1 justify-end">Points Redeemed ({pointsToRedeem})</span>
                        <span>- {currencySymbol}{pointsDiscountValue.toFixed(2)}</span>
                    </div>
                )}
                <div className="flex justify-between items-center"><span className="text-text-muted">Tax (GST):</span><span>+ {currencySymbol}{taxAmount.toFixed(2)}</span></div>
                <div className={`flex justify-between items-center text-xl font-bold border-t-2 border-text-primary pt-2 mt-2 ${isReturnMode ? 'text-negative' : 'text-text-primary'}`}>
                    <span>{isReturnMode ? 'Refund Total:' : 'Invoice Total:'}</span>
                    <span>{currencySymbol}{total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center"><span className="text-text-muted">{isReturnMode ? 'Refunded:' : 'Total Paid:'}</span><span className="text-positive">{currencySymbol}{totalPaid.toFixed(2)}</span></div>
                {!isReturnMode && (
                    <div className={`flex justify-between items-center text-lg font-bold pt-1 mt-1 ${amountDue > 0.01 ? 'text-negative' : 'text-text-primary'}`}>
                        <span>{amountDue > 0.01 ? 'Balance Due:' : 'Change:'}</span>
                        <span>{currencySymbol}{Math.abs(amountDue).toFixed(2)}</span>
                    </div>
                )}
                {!isReturnMode && (
                    <div className="mt-4 pt-3 border-t border-border-color border-dashed">
                        <div className="flex justify-between items-center text-sm font-semibold">
                            <span className="text-text-muted">Estimated Profit:</span>
                            <span className={estimatedProfit >= 0 ? 'text-positive' : 'text-negative'}>
                                {currencySymbol}{estimatedProfit.toFixed(2)}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
