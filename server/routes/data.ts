import { Request, Response } from 'express';
import {
    getData,
    getAllData,
    getAllDataVersions,
    setBulkData,
    clearAllData,
    putDataStrict,
    createDataSnapshot,
    listBackups,
    backupDatabase,
} from '../db.js';
import { appendAuditLog } from './audit.js';

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
    'productTypes',
    'suppliers',
    'customerProfiles',
    'config',
    'appNotifications',
    'notificationSyncKey',
]);

export function getAllDataHandler(_req: Request, res: Response): void {
    // Bulk boot payload: collections plus their OCC versions under a reserved
    // key (imports whitelist ALLOWED_KEYS, so __versions is never persisted).
    res.json({ ...getAllData(), __versions: getAllDataVersions() });
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

    if (typeof body.version !== 'number' || !Number.isInteger(body.version) || body.version < 0) {
        // Optimistic concurrency is mandatory: a write without the current
        // version may only create a brand-new key.
        const result = putDataStrict(key, value);
        if (!result.ok) {
            const current = getData(key);
            res.status(409).json({
                error: 'Version required to modify existing data. Refetch and retry.',
                version: result.version,
                data: current?.value,
            });
            return;
        }
        res.json({ ok: true, version: result.version });
        return;
    }

    const result = putDataStrict(key, value, body.version);
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
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
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

    // Safety net: snapshot current books before overwriting anything.
    const snapshotKey = createDataSnapshot(`pre-import by ${req.user?.username ?? 'unknown'}`);

    setBulkData(filtered);
    appendAuditLog({
        userId: req.user?.userId,
        username: req.user?.username ?? 'unknown',
        role: req.user?.role ?? 'system',
        action: 'DATA_IMPORT',
        entityType: 'AppData',
        entityId: Object.keys(filtered).join(','),
        details: `Imported ${Object.keys(filtered).length} collection(s); prior state saved to ${snapshotKey}`,
    });

    res.json({ ok: true, imported: Object.keys(filtered), snapshotKey });
}

export function resetDataHandler(req: Request, res: Response): void {
    const { confirmText } = req.body as { confirmText?: string };
    if (confirmText !== 'RESET') {
        res.status(400).json({ error: 'Reset requires confirmText "RESET" in the request body.' });
        return;
    }

    const snapshotKey = createDataSnapshot(`pre-reset by ${req.user?.username ?? 'unknown'}`);
    clearAllData();

    appendAuditLog({
        userId: req.user?.userId,
        username: req.user?.username ?? 'unknown',
        role: req.user?.role ?? 'system',
        action: 'DATA_RESET',
        entityType: 'AppData',
        details: `All collections cleared; prior state saved to ${snapshotKey}`,
    });

    res.json({ ok: true, snapshotKey });
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

export async function createBackupHandler(req: Request, res: Response): Promise<void> {
    try {
        const file = await backupDatabase();
        appendAuditLog({
            userId: req.user?.userId,
            username: req.user?.username ?? 'unknown',
            role: req.user?.role ?? 'system',
            action: 'BACKUP_CREATED',
            entityType: 'Database',
            details: file,
        });
        res.status(201).json({ ok: true, file });
    } catch (err) {
        console.error('[backup] failed:', err instanceof Error ? err.message : err);
        res.status(500).json({ error: 'Backup failed' });
    }
}

export function listBackupsHandler(_req: Request, res: Response): void {
    res.json({ backups: listBackups() });
}
