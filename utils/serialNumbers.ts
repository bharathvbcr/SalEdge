import { InventoryItem } from '../types.ts';

export function normalizeSerial(serial: string): string {
    return serial.trim();
}

export function parseSerialList(raw: string): string[] {
    return raw
        .split(/[\n|;]+/)
        .map(s => normalizeSerial(s))
        .filter(Boolean);
}

export function findDuplicateSerials(serials: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const serial of serials) {
        const key = serial.toLowerCase();
        if (seen.has(key)) duplicates.add(serial);
        else seen.add(key);
    }
    return [...duplicates];
}

export function findSerialInventoryRecord(
    serial: string,
    inventory: InventoryItem[],
    firmId?: string,
): InventoryItem | undefined {
    const key = normalizeSerial(serial).toLowerCase();
    if (!key) return undefined;
    return inventory.find(item =>
        (!firmId || item.firmId === firmId) &&
        item.serialNumber &&
        item.serialNumber.toLowerCase() === key
    );
}
export function isSerialInInventory(
    serial: string,
    inventory: InventoryItem[],
    firmId?: string,
    excludeId?: string,
): boolean {
    const existing = findSerialInventoryRecord(serial, inventory, firmId);
    if (!existing || existing.id === excludeId) return false;
    return existing.stock > 0;
}

export function validateBatterySerials(
    serials: string[],
    quantity: number,
    inventory: InventoryItem[],
    firmId: string,
    options?: { requireAll?: boolean },
): string | null {
    const requireAll = options?.requireAll ?? true;
    const cleaned = serials.map(normalizeSerial);

    if (requireAll && cleaned.length < quantity) {
        return `Enter a serial number for each battery (${cleaned.length}/${quantity} provided).`;
    }

    const provided = cleaned.filter(Boolean);
    if (requireAll && provided.length !== quantity) {
        return `Enter exactly ${quantity} serial number${quantity === 1 ? '' : 's'} (one per battery).`;
    }

    const dupesInList = findDuplicateSerials(provided);
    if (dupesInList.length > 0) {
        return `Duplicate serial number${dupesInList.length === 1 ? '' : 's'} in this entry: ${dupesInList.join(', ')}`;
    }

    for (const serial of provided) {
        if (isSerialInInventory(serial, inventory, firmId)) {
            return `Serial "${serial}" is already in stock.`;
        }
    }

    return null;
}

export function serialsForQuantity(quantity: number, existing: string[] = []): string[] {
    const qty = Math.max(1, quantity);
    return Array.from({ length: qty }, (_, i) => existing[i] ?? '');
}

/** Parse comma-separated serials stored on sale/return line items */
export function parseTransactionSerials(serialNumbers?: string): string[] {
    if (!serialNumbers?.trim()) return [];
    return serialNumbers.split(',').map(s => normalizeSerial(s)).filter(Boolean);
}

export function clampSerialStock(stock: number): number {
    return Math.max(0, Math.min(1, stock));
}

export function isSerialTrackedItem(item: Pick<InventoryItem, 'serialNumber'>): boolean {
    return !!normalizeSerial(item.serialNumber);
}

export function takeSerialsFromPool(pool: string[], count: number): { assigned: string[]; remaining: string[] } {
    const assigned = pool.slice(0, count);
    return { assigned, remaining: pool.slice(count) };
}

export function fillSerialsFromPool(
    slots: string[],
    pool: string[],
): { filled: string[]; consumed: string[]; remaining: string[] } {
    const filled = [...slots];
    const consumed: string[] = [];
    let poolIndex = 0;
    for (let i = 0; i < filled.length; i++) {
        if (filled[i]?.trim() || poolIndex >= pool.length) continue;
        filled[i] = pool[poolIndex];
        consumed.push(pool[poolIndex]);
        poolIndex++;
    }
    return { filled, consumed, remaining: pool.slice(poolIndex) };
}

export function validateUniqueCartSerials(
    serials: string[],
    options?: { excludeIndex?: number; existing?: string[] },
): string | null {
    const cleaned = serials.map(normalizeSerial).filter(Boolean);
    const dupes = findDuplicateSerials(cleaned);
    if (dupes.length > 0) {
        return `Duplicate serial in cart: ${dupes.join(', ')}`;
    }
    if (options?.existing) {
        const existingLower = new Set(options.existing.map(s => s.toLowerCase()));
        for (const serial of cleaned) {
            if (existingLower.has(serial.toLowerCase())) {
                return `Serial "${serial}" is already in this sale.`;
            }
        }
    }
    return null;
}
