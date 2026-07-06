import { PAGE_INTENT_EVENT } from './pageActions.ts';

export interface MobileSaleQueueItem {
    inventoryItemId: string;
    firmId: string;
    scannedCode: string;
    label: string;
    serialNumber?: string;
}

const QUEUE_KEY = 'bsms_mobile_sale_queue';
const OPEN_SALE_KEY = 'bsms_mobile_open_sale';

export function getSaleQueue(): MobileSaleQueueItem[] {
    try {
        const raw = sessionStorage.getItem(QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function setSaleQueue(items: MobileSaleQueueItem[]) {
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function addToSaleQueue(item: MobileSaleQueueItem): MobileSaleQueueItem[] {
    const existing = getSaleQueue();
    if (existing.some(e => e.inventoryItemId === item.inventoryItemId)) {
        return existing;
    }
    const serialKey = item.serialNumber?.trim().toLowerCase();
    if (serialKey && existing.some(e => e.serialNumber?.trim().toLowerCase() === serialKey)) {
        return existing;
    }
    const next = [...existing, item];
    setSaleQueue(next);
    return next;
}

export function removeFromSaleQueue(inventoryItemId: string): MobileSaleQueueItem[] {
    const next = getSaleQueue().filter(i => i.inventoryItemId !== inventoryItemId);
    setSaleQueue(next);
    return next;
}

export function clearSaleQueue() {
    sessionStorage.removeItem(QUEUE_KEY);
}

export function requestOpenSale() {
    sessionStorage.setItem(OPEN_SALE_KEY, '1');
    window.dispatchEvent(new CustomEvent(PAGE_INTENT_EVENT));
}

export function consumeOpenSaleRequest(): boolean {
    const v = sessionStorage.getItem(OPEN_SALE_KEY);
    if (v) {
        sessionStorage.removeItem(OPEN_SALE_KEY);
        return true;
    }
    return false;
}
