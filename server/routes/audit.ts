import { Request, Response } from 'express';
import { appendAuditLog, listAuditLogs } from '../db.js';

export { appendAuditLog };

const MAX_SNAPSHOT_LENGTH = 20_000;

/**
 * Client-forwarded audit entry. Identity is stamped from the verified JWT —
 * client-supplied user fields are ignored.
 */
export function createAuditHandler(req: Request, res: Response): void {
    const body = req.body as {
        action?: string;
        entityType?: string;
        entityId?: string;
        details?: string;
        snapshot?: string;
    };

    if (!body.action || typeof body.action !== 'string') {
        res.status(400).json({ error: 'action is required' });
        return;
    }

    const id = appendAuditLog({
        userId: req.user?.userId,
        username: req.user?.username ?? 'unknown',
        role: req.user?.role ?? 'system',
        action: body.action.slice(0, 64),
        entityType: body.entityType?.slice(0, 128),
        entityId: body.entityId?.slice(0, 256),
        details: body.details?.slice(0, 2000),
        snapshot: body.snapshot?.slice(0, MAX_SNAPSHOT_LENGTH),
    });

    res.status(201).json({ ok: true, id });
}

/** Admin-only paginated read of the immutable server-side audit trail. */
export function listAuditHandler(req: Request, res: Response): void {
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const entries = listAuditLogs(limit, offset).map(row => ({
        id: `SRV-${row.id}`,
        date: row.ts,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        userRole: row.role,
        username: row.username,
        details: row.details,
    }));

    res.json({ entries, limit, offset });
}
