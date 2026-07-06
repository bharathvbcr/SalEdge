import { Request, Response } from 'express';
import { getData, setData, getAllData, setBulkData, clearAllData } from '../db.js';

const ALLOWED_KEYS = new Set([
    'inventory',
    'scrapInventory',
    'serviceJobs',
    'transactions',
    'warrantyLogs',
    'expenses',
    'inventoryLogs',
    'purchases',
    'purchaseInvoiceQueue',
    'paymentVouchers',
    'auditLogs',
    'productTypes',
    'suppliers',
    'customerProfiles',
    'config',
    'appNotifications',
    'notificationSyncKey',
]);

export function getAllDataHandler(_req: Request, res: Response): void {
    res.json(getAllData());
}

export function getDataHandler(req: Request, res: Response): void {
    const { key } = req.params;
    if (!ALLOWED_KEYS.has(key)) {
        res.status(400).json({ error: 'Invalid data key' });
        return;
    }
    const envelope = getData(key);
    if (!envelope) {
        res.status(404).json({ error: 'Key not found' });
        return;
    }
    res.json({ data: envelope.value, version: envelope.version });
}

export function putDataHandler(req: Request, res: Response): void {
    const { key } = req.params;
    if (!ALLOWED_KEYS.has(key)) {
        res.status(400).json({ error: 'Invalid data key' });
        return;
    }

    const body = req.body as { value?: unknown; version?: number; data?: unknown };
    const value = body.value !== undefined ? body.value : body;
    const expectedVersion = typeof body.version === 'number' ? body.version : undefined;

    const result = setData(key, value, expectedVersion);
    if (!result.ok) {
        const current = getData(key);
        res.status(409).json({
            error: 'Data was modified by another user. Please refresh.',
            version: result.version,
            data: current?.value,
        });
        return;
    }

    res.json({ ok: true, version: result.version });
}

export function bulkImportHandler(req: Request, res: Response): void {
    const data = req.body as Record<string, unknown>;
    if (!data || typeof data !== 'object') {
        res.status(400).json({ error: 'Invalid import payload' });
        return;
    }

    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        if (ALLOWED_KEYS.has(key)) {
            filtered[key] = value;
        }
    }

    if (Object.keys(filtered).length === 0) {
        res.status(400).json({ error: 'No valid data keys in import' });
        return;
    }

    setBulkData(filtered);
    res.json({ ok: true, imported: Object.keys(filtered) });
}

export function resetDataHandler(_req: Request, res: Response): void {
    clearAllData();
    res.json({ ok: true });
}
