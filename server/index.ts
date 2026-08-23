import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import type { Server } from 'node:http';
import { initDb, seedUsersIfEmpty, closeDb, backupDatabase } from './db.js';
import {
    authMiddleware,
    adminMiddleware,
    loginHandler,
    meHandler,
    registerHandler,
    changePasswordHandler,
} from './auth.js';
import { rateLimit } from './rateLimit.js';
import {
    getAllDataHandler,
    getDataHandler,
    putDataHandler,
    bulkImportHandler,
    resetDataHandler,
    createBackupHandler,
    listBackupsHandler,
} from './routes/data.js';
import { createAuditHandler, listAuditHandler } from './routes/audit.js';
import { putSecretHandler, listSecretsHandler } from './routes/secrets.js';
import { generateEInvoiceHandler, generateEWayBillHandler } from './routes/einvoice.js';
import { listUsersHandler, createUserHandler, updateUserHandler } from './routes/users.js';
import {
    extractPurchaseInvoiceHandler,
    insightsHandler,
    testConnectionHandler,
    semanticStatusHandler,
    ollamaModelsHandler,
    chatHandler,
} from './routes/ai.js';
import { ensureSemanticLayerRunning, shutdownSemanticLayer } from './services/ai/semanticLayerProcess.js';
import { getLanAddresses, logNetworkAccess } from './networkInfo.js';
import { ensureLocalCerts } from './localCerts.js';
import { findAvailablePort, parsePreferredPort, PREFERRED_API_PORT } from './portUtils.js';
import { getDevFrontendPort, writeDevRuntime } from './devRuntime.js';

initDb();
seedUsersIfEmpty();

const app = express();

const distPath = path.resolve(process.cwd(), 'dist');
const isDevMode = process.env.BSMS_DEV === 'true';
const isServingBuiltFrontend = !isDevMode && fs.existsSync(distPath);
let serverUsesHttps = false;
let listeningPort = PREFERRED_API_PORT;

// ---------------------------------------------------------------------------
// Security hardening
// ---------------------------------------------------------------------------

/**
 * Pin CORS to explicit origins instead of reflecting any origin with
 * credentials. Localhost (any port) is always allowed for development;
 * extra LAN/browser origins can be added via ALLOWED_ORIGINS="https://a,https://b".
 */
const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

/**
 * CORS policy:
 *  - no Origin (curl / same-origin GET navigations) → allowed;
 *  - localhost origins → allowed (development front-ends);
 *  - SAME-ORIGIN requests → allowed. Browsers DO attach an Origin header to
 *    same-origin POSTs, and the mobile companion loads its UI from THIS very
 *    server over a LAN IP — without this rule every phone POST was 403'd and
 *    QR pairing was broken by default.
 *  - anything else requires an explicit ALLOWED_ORIGINS entry.
 */
app.use(cors((req, callback) => {
    const origin = req.headers.origin;
    if (!origin) return callback(null, { origin: false, credentials: true });

    let allowed = extraOrigins.includes(origin);
    if (!allowed) {
        try {
            const parsed = new URL(origin);
            const hostHeader = req.headers.host ?? '';
            allowed = /^(localhost|127\.0\.0\.1)$/.test(parsed.hostname)
                || parsed.host === hostHeader; // same machine, same port we served from
        } catch {
            allowed = false;
        }
    }

    if (allowed) return callback(null, { origin: true, credentials: true });
    callback(null, { origin: false, credentials: true });
}));

// Minimal helmet-equivalent headers (no external dependency). Mirrors the
// Tauri production CSP so both packaging modes behave identically.
app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self' http://localhost:* http://127.0.0.1:*",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' data: https://fonts.gstatic.com",
            "img-src 'self' data: blob:",
            "connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:*",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
        ].join('; ')
    );
    next();
});

app.use(express.json({ limit: '10mb' }));

// Brute-force protection for credential endpoints (per-IP fixed window).
const authRateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', storage: 'sqlite', port: listeningPort });
});

app.get('/api/network-info', authMiddleware, (_req, res) => {
    const frontendPort = isServingBuiltFrontend ? listeningPort : getDevFrontendPort(listeningPort);
    const httpsAvailable = serverUsesHttps || !isServingBuiltFrontend;
    res.json({
        lanHosts: getLanAddresses(),
        apiPort: listeningPort,
        frontendPort,
        protocol: httpsAvailable ? 'https' : 'http',
        httpsAvailable,
    });
});

app.post('/api/auth/login', authRateLimiter, loginHandler);
app.post('/api/auth/register', rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }), registerHandler);
app.post('/api/auth/change-password', authMiddleware, changePasswordHandler);
app.get('/api/auth/me', authMiddleware, meHandler);

app.get('/api/users', authMiddleware, adminMiddleware, listUsersHandler);
app.post('/api/users', authMiddleware, adminMiddleware, createUserHandler);
app.patch('/api/users/:id', authMiddleware, adminMiddleware, updateUserHandler);

app.get('/api/data', authMiddleware, getAllDataHandler);
app.get('/api/data/:key', authMiddleware, getDataHandler);
app.put('/api/data/:key', authMiddleware, putDataHandler);
app.post('/api/data/import', authMiddleware, adminMiddleware, bulkImportHandler);
app.post('/api/data/reset', authMiddleware, adminMiddleware, resetDataHandler);

app.get('/api/audit', authMiddleware, adminMiddleware, listAuditHandler);
app.post('/api/audit', authMiddleware, createAuditHandler);

app.get('/api/secrets', authMiddleware, adminMiddleware, listSecretsHandler);
app.put('/api/secrets/:name', authMiddleware, adminMiddleware, putSecretHandler);

app.post('/api/einvoice/generate', authMiddleware, generateEInvoiceHandler);
app.post('/api/einvoice/ewaybill', authMiddleware, generateEWayBillHandler);

app.post('/api/backup', authMiddleware, adminMiddleware, createBackupHandler);
app.get('/api/backup', authMiddleware, adminMiddleware, listBackupsHandler);

app.post('/api/ai/extract-purchase-invoice', authMiddleware, adminMiddleware, extractPurchaseInvoiceHandler);
app.post('/api/ai/insights', authMiddleware, adminMiddleware, insightsHandler);
app.post('/api/ai/test-connection', authMiddleware, adminMiddleware, testConnectionHandler);
app.post('/api/ai/ollama-models', authMiddleware, adminMiddleware, ollamaModelsHandler);
app.post('/api/ai/semantic-status', authMiddleware, adminMiddleware, semanticStatusHandler);
app.post('/api/ai/chat', authMiddleware, adminMiddleware, chatHandler);

if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get(/^(?!\/api).*/, (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

// Malformed JSON bodies → clean 400 instead of Express's default HTML page.
app.use((err: Error & { type?: string; status?: number }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.type === 'entity.parse.failed') {
        res.status(400).json({ error: 'Malformed request body' });
        return;
    }
    next(err);
});

// Central error handler: log details server-side, never leak internals.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[server] Unhandled error:', err.stack || err.message);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function resolveApiPort(): Promise<number> {
    const preferred = parsePreferredPort(process.env.PORT, PREFERRED_API_PORT);
    return findAvailablePort('0.0.0.0', preferred);
}

function listenServer(createServer: () => Server, port: number): Promise<Server> {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(port, () => resolve(server));
    });
}

let activeServer: Server | null = null;

async function startServer() {
    listeningPort = await resolveApiPort();
    if (!isServingBuiltFrontend) {
        writeDevRuntime({ apiPort: listeningPort, frontendPort: getDevFrontendPort() });
    }

    const localCerts = isServingBuiltFrontend ? await ensureLocalCerts() : null;
    serverUsesHttps = !!localCerts;
    const mobileProtocol = serverUsesHttps ? 'https' : 'http';
    const mobilePort = isServingBuiltFrontend ? listeningPort : getDevFrontendPort(listeningPort);

    if (serverUsesHttps && localCerts) {
        activeServer = await listenServer(
            () => https.createServer({ key: localCerts.key, cert: localCerts.cert }, app),
            listeningPort,
        );
        console.log(`SalEdge API server running on https://localhost:${listeningPort}`);
    } else {
        activeServer = await listenServer(() => http.createServer(app), listeningPort);
        console.log(`SalEdge API server running on http://localhost:${listeningPort}`);
    }

    logNetworkAccess(mobilePort, mobileProtocol);
    void ensureSemanticLayerRunning().catch(err => {
        console.warn('[semantic] startup error:', err instanceof Error ? err.message : err);
    });
}

void startServer().catch(err => {
    console.error('Failed to start API server:', err instanceof Error ? err.message : err);
    process.exit(1);
});

function gracefulShutdown(signal: string) {
    console.log(`${signal} received — shutting down`);
    let exiting = false;
    const exit = () => { if (!exiting) { exiting = true; process.exit(0); } };

    shutdownSemanticLayer();

    // Production builds persist one last online backup before closing.
    const finish = () => {
        try { closeDb(); } catch { /* already closed */ }
        exit();
    };

    if (!isDevMode) {
        const forceExit = setTimeout(exit, 8000);
        forceExit.unref();
        backupDatabase('shutdown')
            .then(finish)
            .catch(err => {
                console.warn('[shutdown] final backup skipped:', err instanceof Error ? err.message : err);
                finish();
            });
        return;
    }

    try { closeDb(); } catch { /* already closed */ }
    exit();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
