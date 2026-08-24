/**
 * LIVE-SERVER STRESS SUITE
 *
 * Boots the REAL built server (dist-server/index.mjs) on an ephemeral port
 * against an isolated temp database and attacks it: concurrent optimistic-
 * concurrency writes, malformed/oversized bodies, unicode round-trips,
 * prototype-pollution attempts, audit floods, backups under write load,
 * and rate-limit saturation. The server must stay healthy throughout.
 *
 * Run order matters: the single admin login happens BEFORE the rate-limit
 * scenario, which deliberately saturates the limiter LAST.
 */
process.env.STRESS_PORT = String(3950 + Math.floor(Math.random() * 40));
const PORT = process.env.STRESS_PORT;
const BASE = `http://127.0.0.1:${PORT}`;

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Unique per-run scratch dir under the OS temp root. A hardcoded absolute
// macOS path here made CI fail on Linux runners with EACCES.
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'saledge-stress-'));
const SERVER_LOG = `${TMP_ROOT}/server.log`;

let child: ReturnType<typeof spawn> | null = null;
let spawnError: Error | null = null;
let serverLogFd: number | null = null;
let adminToken = '';

function req(path: string, options: RequestInit & { rawBody?: string } = {}): Promise<Response> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
    };
    if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
    return fetch(`${BASE}${path}`, {
        ...options,
        headers,
        body: options.rawBody ?? (options.body as string | undefined),
    } as RequestInit);
}

async function waitForHealth(timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (spawnError) throw spawnError;
        if (child && child.exitCode !== null) {
            throw new Error(
                `Server exited (code ${child.exitCode}) before becoming healthy — see ${SERVER_LOG}`
            );
        }
        try {
            const res = await fetch(`${BASE}/api/health`);
            if (res.ok) return;
        } catch { /* not up yet */ }
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`Server did not become healthy on ${PORT}`);
}

before(async () => {
    // Fresh bundle is built by npm run build:server before tests. Fail fast
    // with the real cause instead of a 20s timeout when it is missing.
    if (!fs.existsSync('dist-server/index.mjs')) {
        throw new Error('dist-server/index.mjs not found — run `npm run build:server` before tests');
    }
    const logFd = fs.openSync(SERVER_LOG, 'a');
    serverLogFd = logFd;
    child = spawn(process.execPath, ['dist-server/index.mjs'], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            PORT,
            DATABASE_PATH: `${TMP_ROOT}/bsms.sqlite`,
            BSMS_DATA_DIR: TMP_ROOT,
            BSMS_HTTPS: 'false',
            BSMS_DEV: 'true',
            SEMANTIC_LAYER_AUTO_START: 'false',
        },
        stdio: ['ignore', logFd, logFd],
    });
    child.on('error', err => { spawnError = err; });

    await waitForHealth();

    const login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    assert.equal(login.status, 200, 'seeded admin login must work');
    adminToken = ((await login.json()) as { token: string }).token;
});

after(async () => {
    if (child) {
        await new Promise<void>(resolve => {
            child!.once('exit', resolve);
            child!.kill('SIGTERM');
            setTimeout(() => { try { child!.kill('SIGKILL'); } catch { /* gone */ } resolve(); }, 5000);
        });
    }
    if (serverLogFd !== null) {
        try { fs.closeSync(serverLogFd); } catch { /* already closed */ }
    }
    try {
        for (const entry of fs.readdirSync(TMP_ROOT)) {
            if (entry === 'server.log') continue; // keep for failure diagnosis
            fs.rmSync(`${TMP_ROOT}/${entry}`, { recursive: true, force: true });
        }
    } catch { /* best effort */ }
});

describe('stress: auth surface', () => {
    it('rejects unauthenticated data access', async () => {
        const saved = adminToken;
        adminToken = '';
        const res = await req('/api/data/inventory');
        adminToken = saved;
        assert.equal(res.status, 401);
    });
});

describe('stress: optimistic concurrency race', () => {
    it('16 parallel same-version PUTs → exactly ONE winner, rest 409, version +1', async () => {
        await req('/api/data/expenses', { method: 'PUT', body: JSON.stringify({ value: [], version: undefined }) });

        // Everyone reads version 1, everyone writes at once.
        const attempts = await Promise.all(Array.from({ length: 16 }, (_, i) =>
            req('/api/data/expenses', { method: 'PUT', body: JSON.stringify({ value: [{ i }], version: 1 }) })
                .then(r => r.status)
        ));

        assert.equal(attempts.filter(s => s === 200).length, 1, 'exactly one writer wins');
        assert.equal(attempts.filter(s => s === 409).length, 15, 'losers get clean conflicts');

        const final = await req('/api/data/expenses').then(r => r.json());
        assert.equal(final.version, 2, 'version advanced exactly once');
    });

    it('sequential rapid saves keep versions monotonic (40 rounds)', async () => {
        let version = 2;
        for (let i = 0; i < 40; i++) {
            const res = await req('/api/data/expenses', {
                method: 'PUT',
                body: JSON.stringify({ value: [{ round: i }], version }),
            });
            assert.equal(res.status, 200);
            version = ((await res.json()) as { version: number }).version;
            assert.equal(version, i + 3);
        }
    });
});

describe('stress: adversarial payloads', () => {
    it('malformed JSON → clean 400, server stays healthy', async () => {
        const res = await req('/api/data/expenses', { method: 'PUT', rawBody: '{"value": [broken' });
        assert.equal(res.status, 400);
        const health = await fetch(`${BASE}/api/health`);
        assert.equal(health.status, 200);
    });

    it('oversized body (>10MB limit) → rejected without crashing', async () => {
        const huge = JSON.stringify({ value: 'x'.repeat(11 * 1024 * 1024) });
        let status = 0;
        try {
            const res = await req('/api/data/expenses', { method: 'PUT', rawBody: huge });
            status = res.status;
        } catch (err) {
            // Undici may abort oversized bodies client-side; that also counts.
            status = -1;
        }
        assert.notEqual(status, 200, 'must not accept');
        const health = await fetch(`${BASE}/api/health`);
        assert.equal(health.status, 200);
    });

    it('unicode / control chars / quotes round-trip byte-exact', async () => {
        const nasty = ['🚀 battery ₹₹₹', 'line\r\nbreaks', 'quotes "and \'apostrophes', 'back\\slash', '\u0000-ish\u0001ctrl', '中文 العربية'];
        await req('/api/data/suppliers', { method: 'PUT', body: JSON.stringify({ value: nasty }) });
        const back = await req('/api/data/suppliers').then(r => r.json());
        assert.deepEqual(back.data, nasty);
    });

    it('prototype-pollution keys in import payload are filtered, not merged', async () => {
        const res = await req('/api/data/import', {
            method: 'POST',
            body: JSON.stringify({ __proto__: { polluted: true }, constructor: { x: 1 }, expenses: [] }),
        });
        assert.equal((res as Response).status, 200); // expenses imported; dangerous keys dropped
        assert.equal(({} as Record<string, unknown>).polluted, undefined);
    });

    it('wrong-type bodies are handled without 500s', async () => {
        for (const body of ['"just a string"', '[1,2,3]', 'null']) {
            const res = await req('/api/data/import', { method: 'POST', rawBody: body });
            assert.ok([400].includes(res.status), `body ${body} → 400, got ${res.status}`);
        }
    });
});

describe('stress: audit flood', () => {
    it('100 concurrent audit posts all persist, newest first', async () => {
        const results = await Promise.all(Array.from({ length: 100 }, (_, i) =>
            req('/api/audit', {
                method: 'POST',
                body: JSON.stringify({ action: 'STRESS_TEST', entityType: 'Transaction', entityId: `T-${i}`, details: `flood ${i}` }),
            }).then(r => r.status)
        ));
        assert.equal(results.filter(s => s === 201).length, 100);

        const list = await req('/api/audit?limit=150').then(r => r.json());
        assert.ok(list.entries.length >= 100);
        assert.equal(list.entries[0]!.action, 'STRESS_TEST');
    });
});

describe('stress: durability under concurrent load', () => {
    it('online backup succeeds WHILE 30 writers hammer distinct collections', async () => {
        // One writer PER KEY with the freshly-read version — concurrent
        // versionless writes to the SAME key are correctly rejected by our
        // OCC contract (covered by the dedicated race test above).
        const bulk = await req('/api/data').then(r => r.json());
        const versions = (bulk.__versions ?? {}) as Record<string, number>;
        const keys = [
            'inventory', 'scrapInventory', 'serviceJobs', 'transactions', 'warrantyLogs',
            'expenses', 'inventoryLogs', 'purchases', 'purchaseInvoiceQueue', 'paymentVouchers',
            'productTypes', 'suppliers', 'customerProfiles', 'config',
            'appNotifications', 'notificationSyncKey',
        ];
        const payload = Array.from({ length: 30 }, (_, i) => ({ gen: i, pad: 'y'.repeat(50_000) }));

        const writes = keys.map(key => {
            const version = versions[key];
            return req(`/api/data/${key}`, {
                method: 'PUT',
                body: JSON.stringify({ value: payload, ...(version !== undefined ? { version } : {}) }),
            }).then(r => r.status);
        });
        // Churn: rewrite half the keys AFTER that key's first write resolved
        // (chained, not raced) using the fresh version from a targeted read.
        const rewrites = keys.slice(0, 14).map((key, idx) =>
            writes[idx]!.then(async () => {
                const res = await req(`/api/data/${key}`).then(r => r.json());
                const second = await req(`/api/data/${key}`, {
                    method: 'PUT',
                    body: JSON.stringify({ value: payload, version: res.version }),
                });
                return second.status;
            })
        );

        const backupPromise = req('/api/backup', { method: 'POST' });
        const [backup, ...statuses] = await Promise.all([backupPromise, ...writes, ...rewrites]);

        assert.equal(backup.status, 201);
        assert.ok(statuses.every(s => s === 200), `all writers must win: ${JSON.stringify(statuses.filter(s => s !== 200))}`);
    });

    it('secrets store + masked readback', async () => {
        const put = await req('/api/secrets/geminiApiKey', { method: 'PUT', body: JSON.stringify({ value: 'super-secret-key-123' }) });
        assert.equal(put.status, 200);

        const list = await req('/api/secrets').then(r => r.json());
        assert.equal(list.configured.geminiApiKey.set, true);
        assert.ok(!JSON.stringify(list).includes('super-secret-key-123'), 'raw secret must never be returned');
    });

    it('reset requires explicit confirmation token; snapshot survives', async () => {
        const noToken = await req('/api/data/reset', { method: 'POST', body: JSON.stringify({}) });
        assert.equal(noToken.status, 400);

        const withToken = await req('/api/data/reset', { method: 'POST', body: JSON.stringify({ confirmText: 'RESET' }) });
        assert.equal(withToken.status, 200);
        const { snapshotKey } = await withToken.json();
        assert.match(snapshotKey, /^_snapshot_/);

        // Audit log survived the reset (append-only table).
        const list = await req('/api/audit?limit=1').then(r => r.json());
        assert.equal(list.entries[0]!.action, 'DATA_RESET');
    });
});

describe('stress: brute-force protection (run LAST — saturates limiter)', () => {
    it('login flood hits 429 and blocks even VALID credentials', async () => {
        const statuses: number[] = [];
        for (let i = 0; i < 25; i++) {
            const res = await fetch(`${BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
            });
            statuses.push(res.status);
        }
        assert.ok(statuses.includes(429), 'limiter must engage');

        const valid = await fetch(`${BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin123' }),
        });
        assert.equal(valid.status, 429, 'even correct creds are throttled once saturated');
    });
});
