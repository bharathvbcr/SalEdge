/**
 * Database-layer behaviour tests against an ISOLATED temp SQLite file so the
 * developer's real data/ directory is never touched.
 *
 * NOTE: static ES imports hoist above any statement in this file, so
 * server/db.ts would capture process.env.DATABASE_PATH before we set it.
 * The module MUST be imported dynamically after the env override below.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

const TMP_DB = path.join(os.tmpdir(), `saledge-dbtest-${process.pid}.sqlite`);
process.env.DATABASE_PATH = TMP_DB;

for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TMP_DB + suffix); } catch { /* absent */ }
}

const {
    initDb,
    putDataStrict,
    getData,
    setData,
    appendAuditLog,
    listAuditLogs,
    createDataSnapshot,
    getAllDataVersions,
} = await import('../server/db.ts');

initDb();

describe('db optimistic concurrency (strict writes)', () => {
    it('a versionless write may CREATE a key', () => {
        const result = putDataStrict('testKey', { a: 1 });
        assert.deepEqual(result, { ok: true, version: 1 });
        assert.deepEqual(getData<{ a: number }>('testKey')!.value, { a: 1 });
    });

    it('overwriting an existing key WITHOUT a version is rejected as a conflict', () => {
        // Regression guard: the old blind upsert let any PUT clobber live data.
        const result = putDataStrict('testKey', { a: 2 });
        assert.equal(result.ok, false);
        assert.equal((result as { error: string }).error, 'version_conflict');
        assert.equal(result.version, 1); // current version surfaced for refetch
        assert.deepEqual(getData<{ a: number }>('testKey')!.value, { a: 1 });
    });

    it('conditional update with the correct version succeeds and bumps', () => {
        const result = putDataStrict('testKey', { a: 3 }, 1);
        assert.deepEqual(result, { ok: true, version: 2 });
    });

    it('stale versions are rejected with the CURRENT version', () => {
        const result = putDataStrict('testKey', { a: 4 }, 1);
        assert.equal(result.ok, false);
        assert.equal(result.version, 2);
    });
});

describe('append-only audit trail', () => {
    it('records entries with server-stamped timestamps', () => {
        const id = appendAuditLog({
            username: 'admin',
            role: 'admin',
            action: 'DATA_RESET',
            entityType: 'AppData',
            entityId: 'x',
            details: 'test entry',
        });
        assert.ok(id > 0);
        const rows = listAuditLogs(10, 0);
        assert.ok(rows.some(r => r.id === id && r.action === 'DATA_RESET' && typeof r.ts === 'string'));
    });

    it('UPDATE on audit_log is aborted by trigger', () => {
        const db = new Database(TMP_DB);
        const row = listAuditLogs(1, 0)[0] as { id: number };
        assert.throws(
            () => db.prepare('UPDATE audit_log SET details = ? WHERE id = ?').run('tampered', row.id),
            /append-only/,
        );
        db.close();
    });

    it('DELETE on audit_log is aborted by trigger', () => {
        const db = new Database(TMP_DB);
        const rows = listAuditLogs(5, 0) as { id: number }[];
        assert.throws(
            () => db.prepare('DELETE FROM audit_log WHERE id = ?').run(rows[0].id),
            /append-only/,
        );
        db.close();
    });
});

describe('pre-destructive snapshots', () => {
    it('captures all public collections under an underscore key', () => {
        setData('snapshotProbe', [1, 2, 3]);
        const snapKey = createDataSnapshot('unit-test');
        assert.match(snapKey, /^_snapshot_/);

        // Underscore keys are excluded from bulk reads…
        const raw = new Database(TMP_DB).prepare('SELECT value FROM app_data WHERE key = ?').get(snapKey) as { value: string };
        const parsed = JSON.parse(raw.value);
        assert.equal(parsed.reason, 'unit-test');
        assert.deepEqual(parsed.data.snapshotProbe, [1, 2, 3]);
    });

    it('rotates snapshots to at most 5', () => {
        for (let i = 0; i < 7; i++) {
            createDataSnapshot(`rotation-${i}`);
        }
        const db = new Database(TMP_DB);
        const count = (db.prepare(`SELECT COUNT(*) AS c FROM app_data WHERE key LIKE '_snapshot_%'`).get() as { c: number }).c;
        db.close();
        assert.equal(count, 5);
    });
});

describe('getAllDataVersions', () => {
    it('exposes OCC versions for public keys only', () => {
        const versions = getAllDataVersions();
        assert.ok(typeof versions.testKey === 'number');
        assert.ok(!Object.keys(versions).some(k => k.startsWith('_')));
    });
});
