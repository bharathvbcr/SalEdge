#!/usr/bin/env node
/**
 * Cross-platform launcher for the semantic layer FastAPI server.
 * Auto-runs setup on first launch. Usually not needed — the Express server starts this for you.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function loadEnvFile() {
    try {
        const raw = readFileSync(path.resolve('.env'), 'utf8');
        for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq <= 0) continue;
            const key = trimmed.slice(0, eq).trim();
            let value = trimmed.slice(eq + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (process.env[key] === undefined) process.env[key] = value;
        }
    } catch { /* no .env */ }
}

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.SEMANTIC_HOST || '127.0.0.1';
const PREFERRED_PORT = 8090;
const PORT_SCAN_MAX = 30;

function isPortFree(port) {
    return new Promise(resolve => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => server.close(() => resolve(true)));
        server.listen(port, host);
    });
}

async function findAvailablePort(startPort) {
    for (let port = startPort; port < startPort + PORT_SCAN_MAX; port++) {
        if (await isPortFree(port)) return port;
    }
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, host, () => {
            const addr = server.address();
            resolve(typeof addr === 'object' && addr ? addr.port : startPort);
            server.close();
        });
    });
}

function usesAutoPort() {
    const semanticUrl = process.env.SEMANTIC_LAYER_URL?.trim();
    const semanticPort = process.env.SEMANTIC_PORT?.trim();
    return !semanticUrl || semanticUrl.toLowerCase() === 'auto'
        || !semanticPort || semanticPort.toLowerCase() === 'auto';
}

async function resolvePort() {
    if (!usesAutoPort()) {
        const fromUrl = process.env.SEMANTIC_LAYER_URL?.trim();
        if (fromUrl && fromUrl.toLowerCase() !== 'auto') {
            try {
                const parsed = new URL(fromUrl);
                const n = Number(parsed.port);
                if (Number.isFinite(n) && n > 0) return n;
            } catch { /* fall through */ }
        }
        const n = Number(process.env.SEMANTIC_PORT);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return findAvailablePort(PREFERRED_PORT);
}

const port = String(await resolvePort());

const venvPython =
    process.platform === 'win32'
        ? path.join(root, '.venv-semantic', 'Scripts', 'python.exe')
        : path.join(root, '.venv-semantic', 'bin', 'python');

if (!existsSync(venvPython)) {
    console.log('Semantic layer not set up yet — running first-time install...');
    const setup = spawnSync(process.execPath, ['scripts/semantic-setup.mjs'], {
        cwd: root,
        stdio: 'inherit',
        env: process.env,
    });
    if (setup.status !== 0) process.exit(setup.status ?? 1);
}

const python = existsSync(venvPython) ? venvPython : process.env.PYTHON || 'python3';

const child = spawn(
    python,
    [
        '-m',
        'uvicorn',
        'semantic_layer.main:app',
        '--host',
        host,
        '--port',
        port,

    ],
    {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env },
    },
);

child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exit(code ?? 0);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
