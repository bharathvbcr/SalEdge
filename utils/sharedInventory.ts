import { InventoryItem } from '../types.ts';

/** Inventory is one physical pool; billing firm is tracked on purchases and sales only. */
export const SHARED_INVENTORY_FIRM_ID = 'SHARED';

export function sharedInventoryFirmId(): string {
    return SHARED_INVENTORY_FIRM_ID;
}

export function normalizeInventoryFirmIds(items: InventoryItem[]): InventoryItem[] {
    return items.map(item => ({ ...item, firmId: SHARED_INVENTORY_FIRM_ID }));
}
