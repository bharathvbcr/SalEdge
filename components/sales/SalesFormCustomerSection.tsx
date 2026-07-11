import React, { useState } from 'react';
import { IconAlertTriangle, IconChevronDown } from '../icons.tsx';
import { INDIAN_STATES, getStateCodeFromGSTIN } from '../../indianGST.ts';
import { CustomerRecord } from '../../utils/customerLookup.ts';
import { CustomerData } from './types.ts';
import { useSuggestionList } from '../../hooks/useSuggestionList.ts';
import { FormField } from '../FormField.tsx';

interface SalesFormCustomerSectionProps {
    saleDate: string;
    setSaleDate: (v: string) => void;
    invoiceNumber: string;
    setInvoiceNumber: (v: string) => void;
    customerName: string;
    customerPhone: string;
    customerSearchQuery: string;
    onCustomerSearchChange: (value: string) => void;
    onSelectCustomer: (customer: CustomerRecord) => void;
    customerSuggestions: CustomerRecord[];
    showSuggestions: boolean;
    setShowSuggestions: (v: boolean) => void;
    phoneError: string;
    customerNameError?: string;
    saleCategory: string;
    setSaleCategory: (v: string) => void;
    saleCategories: string[];
    categoryLabels: { sectionTitle: string; idLabel: string; idPlaceholder: string; modelLabel: string; modelPlaceholder: string };
    vehicleNumber: string;
    setVehicleNumber: (v: string) => void;
    vehicleModel: string;
    setVehicleModel: (v: string) => void;
    customerGst: string;
    setCustomerGst: (v: string) => void;
    placeOfSupply: string;
    setPlaceOfSupply: (v: string) => void;
    billingAddress: string;
    setBillingAddress: (v: string) => void;
    selectedCustomerData: CustomerData | null;
    creditLimitWarning: string | null;
    currencySymbol: string;
    isReturnMode: boolean;
    onWalkInPreset: () => void;
    compact?: boolean;
}

export const SalesFormCustomerSection: React.FC<SalesFormCustomerSectionProps> = ({
    saleDate, setSaleDate, invoiceNumber, setInvoiceNumber,
    customerName, customerPhone, customerSearchQuery, onCustomerSearchChange,
    onSelectCustomer, customerSuggestions, showSuggestions, setShowSuggestions,
    phoneError, customerNameError, saleCategory, setSaleCategory, saleCategories, categoryLabels,
    vehicleNumber, setVehicleNumber, vehicleModel, setVehicleModel,
    customerGst, setCustomerGst, placeOfSupply, setPlaceOfSupply,
    billingAddress, setBillingAddress, selectedCustomerData, creditLimitWarning,
    currencySymbol, isReturnMode, onWalkInPreset, compact = false,
}) => {
    const [showAdvanced, setShowAdvanced] = useState(false);
    const { highlightIndex, setHighlightIndex, resetHighlight, handleKeyDown } = useSuggestionList(
        customerSuggestions,
        (c) => { onSelectCustomer(c); resetHighlight(); }
    );

    const showGstFields = showAdvanced;
    const customerError = customerNameError || phoneError || undefined;

    return (
        <div className="space-y-4">
            {!compact && (
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={onWalkInPreset} className="btn-secondary btn-sm">Walk-in Customer</button>
                </div>
            )}

            <div className={`grid grid-cols-1 ${compact ? 'gap-4' : 'md:grid-cols-3 gap-6'} p-4 bg-bg-tertiary/50 rounded-lg border border-border-color`}>
                <div className="space-y-3">
                    <h4 className="text-sm font-bold text-text-primary uppercase tracking-wide">Basic Details</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label="Date" htmlFor="sale-date">
                            <input id="sale-date" type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} className="form-input" required />
                        </FormField>
                        <FormField label="Invoice No. (Optional)" htmlFor="invoice-number">
                            <input id="invoice-number" type="text" placeholder="Auto-generated if empty" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="form-input" disabled={isReturnMode} />
                        </FormField>
                    </div>
                    <div className="relative" onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}>
                        <FormField label="Customer (name or phone)" required htmlFor="customer-search" error={customerError}>
                            <input
                                id="customer-search"
                                type="text"
                                placeholder="Search name or 10-digit phone..."
                                value={customerSearchQuery}
                                onChange={e => onCustomerSearchChange(e.target.value)}
                                onFocus={() => customerSuggestions.length > 0 && setShowSuggestions(true)}
                                onKeyDown={handleKeyDown}
                                className={`form-input ${customerError ? 'has-error' : ''}`}
                                required
                                autoComplete="off"
                                disabled={isReturnMode}
                                aria-invalid={!!customerError}
                            />
                        </FormField>
                        {showSuggestions && customerSuggestions.length > 0 && (
                            <ul className="absolute z-10 w-full bg-bg-tertiary border border-border-color rounded-md mt-1 max-h-48 overflow-y-auto shadow-lg">
                                {customerSuggestions.map((cust, i) => (
                                    <li
                                        key={cust.name + cust.phone}
                                        onMouseDown={() => onSelectCustomer(cust)}
                                        onMouseEnter={() => setHighlightIndex(i)}
                                        className={`px-4 py-2 cursor-pointer ${i === highlightIndex ? 'bg-bg-secondary' : 'hover:bg-bg-secondary'}`}
                                    >
                                        <p className="font-medium text-text-primary">{cust.name}</p>
                                        <p className="text-xs text-text-muted">{cust.phone || 'No phone'}{cust.lastSeen ? ` · Last: ${new Date(cust.lastSeen).toLocaleDateString()}` : ''}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    {(customerName || customerPhone) && (
                        <div className="text-xs text-text-muted px-1">
                            Selected: <span className="font-medium text-text-primary">{customerName}</span>
                            {customerPhone ? ` · ${customerPhone}` : ''}
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    <h4 className="text-sm font-bold text-text-primary uppercase tracking-wide">{categoryLabels.sectionTitle}</h4>
                    <FormField label="Category" htmlFor="sale-category">
                        <select id="sale-category" value={saleCategory} onChange={e => setSaleCategory(e.target.value)} className="form-input" disabled={isReturnMode}>
                            <option value="">Select Category</option>
                            {saleCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </FormField>
                    <div className="grid grid-cols-2 gap-2">
                        <FormField label={categoryLabels.idLabel} htmlFor="vehicle-number">
                            <input id="vehicle-number" type="text" placeholder={categoryLabels.idPlaceholder} value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} className="form-input" disabled={isReturnMode} />
                        </FormField>
                        <FormField label={categoryLabels.modelLabel} htmlFor="vehicle-model">
                            <input id="vehicle-model" type="text" placeholder={categoryLabels.modelPlaceholder} value={vehicleModel} onChange={e => setVehicleModel(e.target.value)} className="form-input" disabled={isReturnMode} />
                        </FormField>
                    </div>
                </div>

                {showGstFields ? (
                    <div className="space-y-3">
                        <h4 className="text-sm font-bold text-text-primary uppercase tracking-wide">B2B / GST Details</h4>
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label="GSTIN (Optional)" htmlFor="customer-gst">
                                <input id="customer-gst" type="text" placeholder="For B2B Invoice" value={customerGst} onChange={e => {
                                    const gst = e.target.value.toUpperCase();
                                    setCustomerGst(gst);
                                    if (gst.length >= 2) {
                                        const stateCode = getStateCodeFromGSTIN(gst);
                                        if (stateCode && INDIAN_STATES.find(s => s.code === stateCode)) {
                                            setPlaceOfSupply(stateCode);
                                        }
                                    }
                                }} className="form-input uppercase" disabled={isReturnMode} maxLength={15} />
                            </FormField>
                            <FormField label="Place of Supply" htmlFor="place-of-supply">
                                <select id="place-of-supply" value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)} className="form-input" disabled={isReturnMode}>
                                    <option value="">Select State</option>
                                    {INDIAN_STATES.map(state => (
                                        <option key={state.code} value={state.code}>{state.code} - {state.name}</option>
                                    ))}
                                </select>
                            </FormField>
                        </div>
                        <FormField label="Billing Address" htmlFor="billing-address">
                            <textarea id="billing-address" placeholder="Enter billing address..." value={billingAddress} onChange={e => setBillingAddress(e.target.value)} className="form-input h-24 resize-none" rows={3} disabled={isReturnMode} />
                        </FormField>
                    </div>
                ) : (
                    <div className="flex items-end">
                        <button type="button" onClick={() => setShowAdvanced(true)} className="btn-link text-sm flex items-center gap-1">
                            <IconChevronDown className="h-4 w-4" /> B2B / GST details
                        </button>
                    </div>
                )}
            </div>

            {selectedCustomerData && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 info-panel text-sm">
                    <div className="text-center"><span className="font-semibold text-text-muted">Last Visit:</span> {new Date(selectedCustomerData.lastSeen).toLocaleDateString()}</div>
                    <div className="text-center"><span className="font-semibold text-text-muted">Total Spent:</span> {currencySymbol}{selectedCustomerData.totalSpent.toLocaleString('en-IN')}</div>
                    <div className="text-center"><span className="font-semibold text-text-muted">Balance Due:</span> <span className={selectedCustomerData.totalDue > 0 ? 'text-negative font-bold' : ''}>{currencySymbol}{selectedCustomerData.totalDue.toLocaleString('en-IN')}</span></div>
                    <div className="text-center">
                        <span className="font-semibold text-text-muted">Loyalty Points:</span>
                        <span className="font-bold text-info ml-1">{selectedCustomerData.loyaltyPoints}</span>
                    </div>
                    {selectedCustomerData.tier && (
                        <div className="text-center col-span-2">
                            <span className="font-semibold text-text-muted">Tier:</span>{' '}
                            <span className="badge badge-purple">{selectedCustomerData.tier}</span>
                            {selectedCustomerData.tierDiscountPercent ? <span className="text-xs text-positive ml-1">({selectedCustomerData.tierDiscountPercent}% off)</span> : null}
                        </div>
                    )}
                    {selectedCustomerData.creditLimit ? (
                        <div className="text-center col-span-2">
                            <span className="font-semibold text-text-muted">Credit Limit:</span> {currencySymbol}{selectedCustomerData.creditLimit.toLocaleString('en-IN')}
                        </div>
                    ) : null}
                </div>
            )}
            {creditLimitWarning && (
                <div className="flex items-center gap-2 p-3 alert-panel-danger text-sm">
                    <IconAlertTriangle className="h-5 w-5 flex-shrink-0" />
                    {creditLimitWarning}
                </div>
            )}
        </div>
    );
};
