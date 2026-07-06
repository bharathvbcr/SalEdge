import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
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
    chatHandler,
} from './routes/ai.js';
import { ensureSemanticLayerRunning, shutdownSemanticLayer } from './services/ai/semanticLayerProcess.js';

const PORT = Number(process.env.PORT) || 3001;

initDb();
seedUsersIfEmpty();

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', storage: 'sqlite' });
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
app.post('/api/ai/semantic-status', authMiddleware, adminMiddleware, semanticStatusHandler);
app.post('/api/ai/chat', authMiddleware, adminMiddleware, chatHandler);

const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get(/^(?!\/api).*/, (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`BSMS API server running on http://localhost:${PORT}`);
    void ensureSemanticLayerRunning();
});

function gracefulShutdown(signal: string) {
    console.log(`${signal} received — shutting down`);
    shutdownSemanticLayer();
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
