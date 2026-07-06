/** Keys previously stored in browser localStorage before the API backend */
const LEGACY_KEYS = [
    'inventory', 'scrapInventory', 'serviceJobs', 'transactions', 'warrantyLogs',
    'expenses', 'inventoryLogs', 'purchases', 'paymentVouchers', 'auditLogs',
    'productTypes', 'suppliers', 'customerProfiles', 'config',
    'appNotifications', 'notificationSyncKey',
] as const;

export type LegacyMigrationResult = {
    found: string[];
    imported: string[];
    errors: string[];
};

export function detectLegacyLocalStorage(): string[] {
    const found: string[] = [];
    for (const key of LEGACY_KEYS) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
            JSON.parse(raw);
            found.push(key);
        } catch { /* skip invalid */ }
    }
    return found;
}

export function readLegacyLocalStorageData(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const key of LEGACY_KEYS) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
            data[key] = JSON.parse(raw);
        } catch { /* skip */ }
    }
    return data;
}

export function clearLegacyLocalStorage(keys?: string[]): void {
    const toClear = keys ?? [...LEGACY_KEYS];
    for (const key of toClear) {
        localStorage.removeItem(key);
    }
}
