import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'bsms.sqlite');
const LEGACY_STORE_PATH = path.join(DATA_DIR, 'store.json');

export interface DbUser {
    id: number;
    username: string;
    password_hash: string;
    display_name: string;
    role: 'admin' | 'staff';
    is_active: number;
    created_at: string;
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
    `);

    migrateFromLegacyJson();
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
    `).run(username, bcrypt.hashSync(password, 10), displayName, role, now);

    return getUserById(Number(result.lastInsertRowid))!;
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
        db.prepare(`
            UPDATE users SET display_name = ?, role = ?, is_active = ?, password_hash = ? WHERE id = ?
        `).run(displayName, role, isActive, bcrypt.hashSync(updates.password, 10), id);
    } else {
        db.prepare(`
            UPDATE users SET display_name = ?, role = ?, is_active = ? WHERE id = ?
        `).run(displayName, role, isActive, id);
    }

    return getUserById(id);
}

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

export function getAllData(): Record<string, unknown> {
    const rows = db.prepare('SELECT key, value FROM app_data').all() as { key: string; value: string }[];
    const result: Record<string, unknown> = {};
    for (const row of rows) {
        if (row.key.startsWith('_')) continue;
        result[row.key] = JSON.parse(row.value);
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

export function seedUsersIfEmpty(): void {
    if (countUsers() > 0) return;

    createUser('admin', 'admin123', 'Admin', 'admin');
    createUser('staff', 'staff123', 'Staff', 'staff');
    console.log('Seeded default users: admin/admin123, staff/staff123 — change passwords in production');
}
