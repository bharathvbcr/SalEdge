import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import type { Server } from 'node:http';
import { initDb, seedUsersIfEmpty } from './db.js';
import { authMiddleware, adminMiddleware, loginHandler, meHandler, registerHandler } from './auth.js';
import {
    getAllDataHandler,
    getDataHandler,
    putDataHandler,
    bulkImportHandler,
    resetDataHandler,
} from './routes/data.js';
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

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', storage: 'sqlite', port: listeningPort });
});

app.get('/api/network-info', (_req, res) => {
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

app.post('/api/auth/login', loginHandler);
app.post('/api/auth/register', registerHandler);
app.get('/api/auth/me', authMiddleware, meHandler);

app.get('/api/users', authMiddleware, adminMiddleware, listUsersHandler);
app.post('/api/users', authMiddleware, adminMiddleware, createUserHandler);
app.patch('/api/users/:id', authMiddleware, adminMiddleware, updateUserHandler);

app.get('/api/data', authMiddleware, getAllDataHandler);
app.get('/api/data/:key', authMiddleware, getDataHandler);
app.put('/api/data/:key', authMiddleware, putDataHandler);
app.post('/api/data/import', authMiddleware, bulkImportHandler);
app.post('/api/data/reset', authMiddleware, adminMiddleware, resetDataHandler);

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

async function resolveApiPort(): Promise<number> {
    const preferred = parsePreferredPort(process.env.PORT, PREFERRED_API_PORT);
    return findAvailablePort('0.0.0.0', preferred);
}

function listenServer(createServer: () => Server, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(port, () => resolve());
    });
}

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
        await listenServer(
            () => https.createServer({ key: localCerts.key, cert: localCerts.cert }, app),
            listeningPort,
        );
        console.log(`BSMS API server running on https://localhost:${listeningPort}`);
    } else {
        await listenServer(() => http.createServer(app), listeningPort);
        console.log(`BSMS API server running on http://localhost:${listeningPort}`);
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
    shutdownSemanticLayer();
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
