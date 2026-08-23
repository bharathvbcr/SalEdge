import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { hashPassword } from './passwords.js';

const DATA_DIR = process.env.BSMS_DATA_DIR
    ? path.resolve(process.env.BSMS_DATA_DIR)
    : path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'bsms.sqlite');
const LEGACY_STORE_PATH = path.join(DATA_DIR, 'store.json');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 10;
const MAX_SNAPSHOTS = 5;

export interface DbUser {
    id: number;
    username: string;
    password_hash: string;
    display_name: string;
    role: 'admin' | 'staff';
    is_active: number;
    created_at: string;
    must_change_password?: number;
}

interface LegacyStoreFile {
    users: DbUser[];
    data: Record<string, unknown>;
    nextUserId: number;
}

let db: Database.Database;

export function initDb(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'staff',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_data (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            user_id INTEGER,
            username TEXT NOT NULL,
            role TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            details TEXT,
            snapshot TEXT
        );
    `);

    // Append-only enforcement at the database level: no UPDATE or DELETE can ever succeed.
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
        BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
        CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
        BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
    `);

    migrateSchema();
    migrateFromLegacyJson();
}

function migrateSchema(): void {
    const columns = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map(c => c.name);
    if (!columns.includes('must_change_password')) {
        db.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`);
    }
}

function migrateFromLegacyJson(): void {
    const marker = getDataRaw('_migrated_from_json');
    if (marker) return;
    if (!fs.existsSync(LEGACY_STORE_PATH)) return;

    try {
        const store = JSON.parse(fs.readFileSync(LEGACY_STORE_PATH, 'utf-8')) as LegacyStoreFile;

        for (const user of store.users || []) {
            const existing = getUserByUsername(user.username);
            if (!existing) {
                db.prepare(`
                    INSERT INTO users (username, password_hash, display_name, role, is_active, created_at)
                    VALUES (?, ?, ?, ?, 1, ?)
                `).run(user.username, user.password_hash, user.display_name, user.role, user.created_at);
            }
        }

        for (const [key, value] of Object.entries(store.data || {})) {
            setData(key, value);
        }

        setData('_migrated_from_json', { at: new Date().toISOString(), source: 'store.json' });
        fs.renameSync(LEGACY_STORE_PATH, `${LEGACY_STORE_PATH}.bak`);
        console.log('Migrated legacy store.json to SQLite');
    } catch (err) {
        console.error('Legacy JSON migration failed:', err);
    }
}

function getDataRaw(key: string): unknown | null {
    const row = db.prepare('SELECT value FROM app_data WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.value);
}

export function getUserByUsername(username: string): DbUser | undefined {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as DbUser | undefined;
}

export function getUserById(id: number): DbUser | undefined {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser | undefined;
}

export function listUsers(): DbUser[] {
    return db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as DbUser[];
}

export function countUsers(): number {
    const row = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
    return row.c;
}

export function createUser(
    username: string,
    password: string,
    displayName: string,
    role: 'admin' | 'staff' = 'staff'
): DbUser {
    const now = new Date().toISOString();
    const result = db.prepare(`
        INSERT INTO users (username, password_hash, display_name, role, is_active, created_at)
        VALUES (?, ?, ?, ?, 1, ?)
    `).run(username, hashPassword(password), displayName, role, now);

    return getUserById(Number(result.lastInsertRowid))!;
}

/** Low-level password replacement (value must already be hashed). */
export function updateUserPassword(id: number, passwordHash: string): void {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

export function clearMustChangePasswordFlag(id: number): void {
    db.prepare('UPDATE users SET must_change_password = 0 WHERE id = ?').run(id);
}

export function updateUser(
    id: number,
    updates: { displayName?: string; role?: 'admin' | 'staff'; isActive?: boolean; password?: string }
): DbUser | undefined {
    const user = getUserById(id);
    if (!user) return undefined;

    const displayName = updates.displayName ?? user.display_name;
    const role = updates.role ?? user.role;
    const isActive = updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : user.is_active;

    if (updates.password) {
        // Admin-set passwords force a change on next login.
        db.prepare(`
            UPDATE users SET display_name = ?, role = ?, is_active = ?, password_hash = ?, must_change_password = 1 WHERE id = ?
        `).run(displayName, role, isActive, hashPassword(updates.password), id);
    } else {
        db.prepare(`
            UPDATE users SET display_name = ?, role = ?, is_active = ? WHERE id = ?
        `).run(displayName, role, isActive, id);
    }

    return getUserById(id);
}

// ---------------------------------------------------------------------------
// Key-value application data
// ---------------------------------------------------------------------------

export type DataEnvelope<T = unknown> = { value: T; version: number };

export function getData<T = unknown>(key: string): DataEnvelope<T> | null {
    const row = db.prepare('SELECT value, version FROM app_data WHERE key = ?').get(key) as
        | { value: string; version: number }
        | undefined;
    if (!row) return null;
    return { value: JSON.parse(row.value) as T, version: row.version };
}

export function setData(
    key: string,
    value: unknown,
    expectedVersion?: number
): { ok: true; version: number } | { ok: false; version: number; error: 'version_conflict' } {
    const now = new Date().toISOString();
    const json = JSON.stringify(value);

    if (expectedVersion !== undefined) {
        const result = db.prepare(`
            UPDATE app_data SET value = ?, version = version + 1, updated_at = ?
            WHERE key = ? AND version = ?
        `).run(json, now, key, expectedVersion);

        if (result.changes === 0) {
            const current = db.prepare('SELECT version FROM app_data WHERE key = ?').get(key) as
                | { version: number }
                | undefined;
            return { ok: false, version: current?.version ?? 0, error: 'version_conflict' };
        }
        return { ok: true, version: expectedVersion + 1 };
    }

    db.prepare(`
        INSERT INTO app_data (key, value, version, updated_at) VALUES (?, ?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            version = app_data.version + 1,
            updated_at = excluded.updated_at
    `).run(key, json, now);

    const row = db.prepare('SELECT version FROM app_data WHERE key = ?').get(key) as { version: number };
    return { ok: true, version: row.version };
}

/**
 * Strict optimistic-concurrency write used by the public API:
 * - With an expectedVersion: conditional update, rejected on mismatch.
 * - Without one: may only CREATE the key. Overwriting an existing key without
 *   its current version is rejected as a conflict.
 */
export function putDataStrict(
    key: string,
    value: unknown,
    expectedVersion?: number
): { ok: true; version: number } | { ok: false; version: number; error: 'version_conflict' } {
    if (expectedVersion !== undefined) {
        const now = new Date().toISOString();
        const json = JSON.stringify(value);
        const result = db.prepare(`
            UPDATE app_data SET value = ?, version = version + 1, updated_at = ?
            WHERE key = ? AND version = ?
        `).run(json, now, key, expectedVersion);

        if (result.changes === 0) {
            const current = db.prepare('SELECT version FROM app_data WHERE key = ?').get(key) as
                | { version: number }
                | undefined;
            return { ok: false, version: current?.version ?? 0, error: 'version_conflict' };
        }
        return { ok: true, version: expectedVersion + 1 };
    }

    const exists = db.prepare('SELECT version FROM app_data WHERE key = ?').get(key) as
        | { version: number }
        | undefined;
    if (exists) {
        return { ok: false, version: exists.version, error: 'version_conflict' };
    }

    const created = setData(key, value);
    return created;
}

export function getAllData(): Record<string, unknown> {
    const rows = db.prepare('SELECT key, value FROM app_data').all() as { key: string; value: string }[];
    const result: Record<string, unknown> = {};
    for (const row of rows) {
        if (row.key.startsWith('_')) continue;
        result[row.key] = JSON.parse(row.value);
    }
    return result;
}

/** Current OCC versions for every public collection (boot hydration fast path). */
export function getAllDataVersions(): Record<string, number> {
    const rows = db.prepare('SELECT key, version FROM app_data').all() as { key: string; version: number }[];
    const result: Record<string, number> = {};
    for (const row of rows) {
        if (row.key.startsWith('_')) continue;
        result[row.key] = row.version;
    }
    return result;
}

export function setBulkData(data: Record<string, unknown>): void {
    const insert = db.transaction((entries: [string, unknown][]) => {
        for (const [key, value] of entries) {
            setData(key, value);
        }
    });
    insert(Object.entries(data));
}

export function clearAllData(): void {
    db.prepare(`DELETE FROM app_data WHERE substr(key, 1, 1) != '_'`).run();
}

// ---------------------------------------------------------------------------
// Server-side append-only audit trail
// ---------------------------------------------------------------------------

export interface AuditEntryInput {
    userId?: number;
    username: string;
    role: string;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: string;
    snapshot?: string;
}

export function appendAuditLog(entry: AuditEntryInput): number {
    const result = db.prepare(`
        INSERT INTO audit_log (ts, user_id, username, role, action, entity_type, entity_id, details, snapshot)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        new Date().toISOString(),
        entry.userId ?? null,
        entry.username,
        entry.role,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        entry.details ?? null,
        entry.snapshot ?? null
    );
    return Number(result.lastInsertRowid);
}

export function listAuditLogs(limit: number, offset: number): Record<string, unknown>[] {
    return db.prepare(`
        SELECT id, ts, username, role, action, entity_type, entity_id, details
        FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Backups and pre-destructive snapshots
// ---------------------------------------------------------------------------

/**
 * Online backup via better-sqlite3 (safe while WAL is active).
 * Returns the absolute backup file path.
 */
export async function backupDatabase(label = 'manual'): Promise<string> {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(BACKUP_DIR, `bsms-${stamp}-${label}.sqlite`);

    await db.backup(dest);
    pruneBackups();
    return dest;
}

function pruneBackups(): void {
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.sqlite'))
        .map(f => ({ f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
    for (const old of files.slice(MAX_BACKUPS)) {
        try { fs.unlinkSync(path.join(BACKUP_DIR, old.f)); } catch { /* best effort */ }
    }
}

export function listBackups(): { name: string; sizeBytes: number; createdAt: string }[] {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.sqlite'))
        .map(f => {
            const stat = fs.statSync(path.join(BACKUP_DIR, f));
            return { name: f, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Snapshot every collection into underscore-prefixed keys before a destructive
 * operation (import/reset). Kept out of GET /api/data by the '_' convention.
 */
export function createDataSnapshot(reason: string): string {
    const stamp = new Date().toISOString();
    // Millisecond timestamps collide when several destructive ops run in one
    // tick — add a short random suffix so every snapshot is its own row.
    const snapKey = `_snapshot_${stamp}_${Math.random().toString(36).slice(2, 6)}`;
    const payload = { reason, at: stamp, data: getAllData() };
    setData(snapKey, payload);

    pruneSnapshots();
    return snapKey;
}

function pruneSnapshots(): void {
    const rows = db.prepare(`SELECT key FROM app_data WHERE key LIKE '_snapshot_%' ORDER BY key DESC`).all() as
        { key: string }[];
    for (const row of rows.slice(MAX_SNAPSHOTS)) {
        db.prepare('DELETE FROM app_data WHERE key = ?').run(row.key);
    }
}

export function closeDb(): void {
    if (db) {
        try {
            db.pragma('wal_checkpoint(TRUNCATE)');
            db.close();
        } catch (err) {
            console.error('[db] Error closing database:', err instanceof Error ? err.message : err);
        }
    }
}

export function seedUsersIfEmpty(): void {
    if (countUsers() > 0) return;

    const admin = createUser('admin', 'admin123', 'Admin', 'admin');
    const staff = createUser('staff', 'staff123', 'Staff', 'staff');
    // Seeded default credentials must be rotated before the app is usable.
    db.prepare('UPDATE users SET must_change_password = 1 WHERE id IN (?, ?)').run(admin.id, staff.id);
    console.warn('Seeded default users: admin/admin123, staff/staff123 — these accounts MUST change their password on first login.');
}
