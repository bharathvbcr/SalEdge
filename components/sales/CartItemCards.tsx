import React, { useMemo } from 'react';
import { IconTrash, IconChevronDown, IconAlertTriangle } from '../icons.tsx';
import { CartItem } from './types.ts';

export const CartItemCard: React.FC<{
    item: CartItem;
    onUpdate: (itemId: string, field: string, value: unknown) => void;
    onRemove: (itemId: string) => void;
    currencySymbol: string;
    readOnly: boolean;
    showValidation: boolean;
    isReturnMode: boolean;
}> = ({ item, onUpdate, onRemove, currencySymbol, readOnly, showValidation, isReturnMode }) => {
    const serialsEntered = useMemo(() => item.serialNumbers.filter(s => s.trim() !== '').length, [item.serialNumbers]);
    const hasSerialError = showValidation && !item.isCustom && item.serialNumbers.some(s => !s.trim());

    const handleSerialNumberChange = (index: number, value: string) => {
        const newSerials = [...item.serialNumbers];
        newSerials[index] = value;
        onUpdate(item.itemId, 'serialNumbers', newSerials);
    };

    const handleSpecChange = (field: string, value: string) => {
        onUpdate(item.itemId, `specifications.${field}`, value);
    };

    const profit = useMemo(() => {
        if (item.isBuyback || item.isCustom || item.purchasePrice === undefined) return null;
        const totalSell = item.price * item.quantity;
        let totalDiscount = 0;
        if (item.discount.type === 'percentage') {
            totalDiscount = totalSell * (item.discount.value / 100);
        } else {
            totalDiscount = item.discount.value * item.quantity;
        }
        const totalCost = item.purchasePrice * item.quantity;
        return totalSell - totalDiscount - totalCost;
    }, [item]);

    return (
        <div className={`p-4 rounded-lg border bg-bg-primary/50 ${hasSerialError ? 'border-status-red-text bg-status-red-bg/10' : 'border-border-color'}`}>
            <div className="flex justify-between items-start">
                <div className="flex-1">
                    {item.isCustom ?
                        <div className="space-y-2 mb-2">
                            <input disabled={readOnly || isReturnMode} type="text" placeholder="Item Name" value={item.name} onChange={e => onUpdate(item.itemId, 'name', e.target.value)} className="form-input text-sm font-bold text-text-primary w-full md:w-3/4" />
                        </div>
                        : <p className="font-bold text-text-primary">{item.name}</p>
                    }

                    {!item.isBuyback && (
                        <div className="flex flex-wrap gap-2 text-xs mt-1 mb-2">
                            {item.isCustom && !readOnly && !isReturnMode ? (
                                <>
                                    <input type="text" placeholder="Capacity (e.g. 150Ah)" value={item.specifications?.capacity || ''} onChange={e => handleSpecChange('capacity', e.target.value)} className="form-input py-0.5 px-2 w-32 text-xs" />
                                    <select value={item.specifications?.technology || ''} onChange={e => handleSpecChange('technology', e.target.value)} className="form-input py-0.5 px-2 w-auto text-xs">
                                        <option value="">Tech</option><option value="Tubular">Tubular</option><option value="Flat Plate">Flat Plate</option><option value="SMF">SMF</option><option value="Gel">Gel</option><option value="Lithium">Lithium</option>
                                    </select>
                                    <select value={item.specifications?.cRating || ''} onChange={e => handleSpecChange('cRating', e.target.value)} className="form-input py-0.5 px-2 w-auto text-xs">
                                        <option value="">Rating</option><option value="C10">C10 (Solar)</option><option value="C20">C20 (Inv)</option><option value="C5">C5</option>
                                    </select>
                                </>
                            ) : (
                                <>
                                    {item.specifications?.capacity && <span className="badge badge-blue">{item.specifications.capacity}</span>}
                                    {item.specifications?.technology && <span className="badge bg-bg-tertiary text-text-secondary">{item.specifications.technology}</span>}
                                    {item.specifications?.cRating && item.specifications.cRating !== 'N/A' && <span className="badge badge-yellow font-semibold">{item.specifications.cRating}</span>}
                                </>
                            )}
                        </div>
                    )}
                </div>
                {!readOnly && (
                    <button type="button" onClick={() => onRemove(item.itemId)} className="text-negative hover:opacity-80 p-1 ml-2">
                        <IconTrash />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-2">
                <div className="flex flex-col">
                    <label className="text-xs font-semibold text-text-muted mb-1">{isReturnMode ? 'Return Qty' : 'Qty'}</label>
                    <input
                        disabled={readOnly || item.isSerialUnit}
                        type="number"
                        value={item.quantity}
                        min="1"
                        max={isReturnMode ? item.maxStock : (item.maxStock || 1000)}
                        onChange={e => onUpdate(item.itemId, 'quantity', parseInt(e.target.value, 10) || 1)}
                        className="form-input text-center"
                        title={item.isSerialUnit ? 'One cart line per battery serial' : undefined}
                    />
                </div>
                <div className="flex flex-col">
                    <label className="text-xs font-semibold text-text-muted mb-1">Price</label>
                    <input disabled={readOnly || isReturnMode} type="number" value={Math.abs(item.price)} min="0" onChange={e => onUpdate(item.itemId, 'price', parseFloat(e.target.value) || 0)} className="form-input text-right" />
                </div>
                <div className="flex flex-col">
                    <label className="text-xs font-semibold text-text-muted mb-1">Discount</label>
                    <div className="flex">
                        <input disabled={readOnly || isReturnMode} type="number" value={item.discount.value} onChange={e => onUpdate(item.itemId, 'discount.value', parseFloat(e.target.value) || 0)} className="form-input text-center w-2/3" />
                        <select disabled={readOnly || isReturnMode} value={item.discount.type} onChange={e => onUpdate(item.itemId, 'discount.type', e.target.value)} className="form-input w-1/3 p-1"><option value="fixed">{currencySymbol}</option><option value="percentage">%</option></select>
                    </div>
                </div>
                <div className="flex flex-col">
                    <label className="text-xs font-semibold text-text-muted mb-1">G / W (Months)</label>
                    <div className="flex gap-1">
                        <input disabled={readOnly || isReturnMode} type="number" title="Guarantee (months)" value={item.guaranteePeriodMonths || ''} onChange={e => onUpdate(item.itemId, 'guaranteePeriodMonths', parseInt(e.target.value, 10))} className="form-input text-center" />
                        <input disabled={readOnly || isReturnMode} type="number" title="Warranty (months)" value={item.warrantyPeriodMonths || ''} onChange={e => onUpdate(item.itemId, 'warrantyPeriodMonths', parseInt(e.target.value, 10))} className="form-input text-center" />
                    </div>
                </div>
                <div className="flex flex-col items-end justify-center">
                    <label className="text-xs font-semibold text-text-muted mb-1">Total</label>
                    <p className={`font-bold text-lg ${isReturnMode ? 'text-negative' : 'text-text-primary'}`}>{currencySymbol}{(item.quantity * item.price).toFixed(2)}</p>
                    {!isReturnMode && profit !== null && (
                        <div className={`text-xs font-bold mt-1 px-1.5 py-0.5 rounded badge ${profit >= 0 ? 'badge-green' : 'badge-red'}`}>
                            Profit: {currencySymbol}{profit.toFixed(2)}
                        </div>
                    )}
                </div>
            </div>

            {!item.isCustom && (
                <details open className="mt-3 group">
                    <summary className={`text-xs font-semibold cursor-pointer flex items-center justify-between list-none ${hasSerialError ? 'text-negative' : 'text-text-muted'}`}>
                        <span className="flex items-center gap-2">
                            Serial Numbers ({serialsEntered}/{item.quantity})
                            {hasSerialError && <IconAlertTriangle className="h-4 w-4" />}
                        </span>
                        <IconChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {item.serialNumbers.map((serial, index) => (
                            <input
                                key={index}
                                type="text"
                                disabled={readOnly}
                                placeholder={`Serial #${index + 1} ${showValidation ? '(Required)' : ''}`}
                                value={serial}
                                onChange={e => handleSerialNumberChange(index, e.target.value)}
                                className={`form-input text-sm ${showValidation && !serial.trim() ? 'has-error' : ''}`}
                            />
                        ))}
                    </div>
                </details>
            )}
            {!item.isBuyback && (
                <div className="mt-3">
                    <input
                        type="text"
                        disabled={readOnly}
                        placeholder="Add item specific notes (e.g., for warranty card)..."
                        value={item.notes || ''}
                        onChange={e => onUpdate(item.itemId, 'notes', e.target.value)}
                        className="form-input text-sm w-full"
                        maxLength={100}
                    />
                </div>
            )}
        </div>
    );
};

export const BuybackItemCard: React.FC<{
    item: CartItem;
    onUpdate: (itemId: string, field: keyof CartItem | 'discount.type' | 'discount.value', value: unknown) => void;
    onRemove: (itemId: string) => void;
    currencySymbol: string;
    readOnly: boolean;
}> = ({ item, onUpdate, onRemove, currencySymbol, readOnly }) => (
    <div className="p-4 rounded-lg border info-panel">
        <div className="flex justify-between items-start mb-3">
            <h4 className="font-medium text-text-primary">{item.name}</h4>
            {!readOnly && (
                <button type="button" onClick={() => onRemove(item.itemId)} className="text-negative hover:opacity-80">
                    <IconTrash />
                </button>
            )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <label className="text-xs font-semibold text-text-muted">Old Battery Brand</label>
                <input disabled={readOnly} type="text" placeholder="Brand" value={item.buybackBrand || ''} onChange={e => onUpdate(item.itemId, 'buybackBrand', e.target.value)} className="form-input text-sm mt-1" />
            </div>
            <div>
                <label className="text-xs font-semibold text-text-muted">Capacity</label>
                <input disabled={readOnly} type="text" placeholder="e.g., 150Ah" value={item.buybackCapacity || ''} onChange={e => onUpdate(item.itemId, 'buybackCapacity', e.target.value)} className="form-input text-sm mt-1" />
            </div>
            <div>
                <label className="text-xs font-semibold text-text-muted">Serial No.</label>
                <input disabled={readOnly} type="text" placeholder="Serial No." value={item.buybackSerialNumber || ''} onChange={e => onUpdate(item.itemId, 'buybackSerialNumber', e.target.value)} className="form-input text-sm mt-1" />
            </div>
        </div>
        <div className="mt-4 flex justify-end items-center gap-4">
            <label className="font-semibold text-text-muted">Buyback Price:</label>
            <div className="w-40 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">{currencySymbol}</span>
                <input disabled={readOnly} type="number" value={item.price} onChange={e => onUpdate(item.itemId, 'price', parseFloat(e.target.value) || 0)} className="form-input text-right text-positive font-bold pl-7" />
            </div>
        </div>
    </div>
);
