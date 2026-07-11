import React, { RefObject } from 'react';
import { IconPlus, IconScan } from '../icons.tsx';
import { CartItem, InventorySuggestion } from './types.ts';
import { CartItemCard, BuybackItemCard } from './CartItemCards.tsx';
import { useSuggestionList } from '../../hooks/useSuggestionList.ts';

interface SalesFormCartSectionProps {
    cart: CartItem[];
    isReturnMode: boolean;
    viewMode: boolean;
    showValidation: boolean;
    currencySymbol: string;
    gstRate: number;
    itemSearchQuery: string;
    onItemSearchChange: (value: string) => void;
    itemSuggestions: InventorySuggestion[];
    showItemSuggestions: boolean;
    setShowItemSuggestions: (v: boolean) => void;
    onSelectItemSuggestion: (item: InventorySuggestion) => void;
    onAddItem: () => void;
    onAddBuyback: () => void;
    onScanClick: () => void;
    onUpdateCart: (itemId: string, field: string, value: unknown) => void;
    onRemoveItem: (itemId: string) => void;
    searchInputRef: RefObject<HTMLInputElement | null>;
}

export const SalesFormCartSection: React.FC<SalesFormCartSectionProps> = ({
    cart, isReturnMode, viewMode, showValidation, currencySymbol, gstRate,
    itemSearchQuery, onItemSearchChange, itemSuggestions, showItemSuggestions,
    setShowItemSuggestions, onSelectItemSuggestion, onAddItem, onAddBuyback,
    onScanClick, onUpdateCart, onRemoveItem, searchInputRef,
}) => {
    const { highlightIndex, setHighlightIndex, resetHighlight, handleKeyDown } = useSuggestionList(
        itemSuggestions,
        (item) => { onSelectItemSuggestion(item); resetHighlight(); }
    );

    return (
        <div className="space-y-4">
            {isReturnMode && (
                <div className="p-2 alert-panel-warning text-sm rounded font-semibold text-center">
                    Select items to return and specify quantity. Remove items not being returned.
                </div>
            )}
            {cart.map(item =>
                item.isBuyback ? (
                    <BuybackItemCard key={item.itemId} item={item} onUpdate={onUpdateCart} onRemove={onRemoveItem} currencySymbol={currencySymbol} readOnly={viewMode} />
                ) : (
                    <CartItemCard key={item.itemId} item={item} onUpdate={onUpdateCart} onRemove={onRemoveItem} currencySymbol={currencySymbol} gstRate={gstRate} readOnly={viewMode} showValidation={showValidation} isReturnMode={isReturnMode} />
                )
            )}

            {!viewMode && !isReturnMode && (
                <div className="flex gap-2 items-stretch pt-3 border-t border-border-color">
                    <button type="button" onClick={onScanClick} className="btn-primary p-2.5 flex-shrink-0" aria-label="Scan barcode">
                        <IconScan className="h-5 w-5" />
                    </button>
                    <div className="relative flex-1" onBlur={() => setTimeout(() => setShowItemSuggestions(false), 200)}>
                        <input
                            type="text"
                            ref={searchInputRef}
                            value={itemSearchQuery}
                            onChange={e => onItemSearchChange(e.target.value)}
                            placeholder="Search inventory, scan barcode, or type custom item..."
                            className="form-input w-full"
                            autoComplete="off"
                            onKeyDown={(e) => {
                                if (showItemSuggestions && itemSuggestions.length > 0) {
                                    handleKeyDown(e);
                                } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    onAddItem();
                                }
                            }}
                        />
                        {showItemSuggestions && itemSuggestions.length > 0 && (
                            <ul className="absolute z-10 w-full bg-bg-tertiary border border-border-color rounded-md mt-1 max-h-40 overflow-y-auto shadow-lg">
                                {itemSuggestions.map((item, i) => (
                                    <li
                                        key={item.id}
                                        onMouseDown={() => onSelectItemSuggestion(item)}
                                        onMouseEnter={() => setHighlightIndex(i)}
                                        className={`px-4 py-2 cursor-pointer ${i === highlightIndex ? 'bg-bg-secondary' : 'hover:bg-bg-secondary'}`}
                                    >
                                        <p className="font-medium text-text-primary">{item.fullName}</p>
                                        <p className="text-xs text-text-muted font-mono">
                                            {item.serialNumber ? `SN: ${item.serialNumber}` : item.batchNumber ? `Batch: ${item.batchNumber}` : `Stock: ${item.stock}`}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <button type="button" onClick={onAddItem} disabled={!itemSearchQuery} className="btn-info p-2.5 disabled:opacity-50"><IconPlus /></button>
                    <button type="button" onClick={onAddBuyback} className="btn-success btn-sm">Add Buyback</button>
                </div>
            )}
        </div>
    );
};
