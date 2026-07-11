#!/usr/bin/env node
/**
 * Dev orchestrator: auto-picks free ports, starts API then Vite with matching proxy config.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile() {
    try {
        const raw = fs.readFileSync(path.resolve('.env'), 'utf8');
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

const PREFERRED_API = 3001;
const PREFERRED_FRONTEND = 3000;
const PORT_SCAN_MAX = 30;
const RUNTIME_DIR = path.resolve('.bsms-dev');
const RUNTIME_FILE = path.join(RUNTIME_DIR, 'runtime.json');

function isPortFree(host, port) {
    return new Promise(resolve => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => server.close(() => resolve(true)));
        server.listen(port, host);
    });
}

async function findAvailablePort(host, startPort, reserved = new Set()) {
    for (let port = startPort; port < startPort + PORT_SCAN_MAX; port++) {
        if (reserved.has(port)) continue;
        if (await isPortFree(host, port)) return port;
    }
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, host, () => {
            const addr = server.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            server.close(() => resolve(port));
        });
    });
}

function writeRuntime(data) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(RUNTIME_FILE, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2));
}

function clearRuntime() {
    try { fs.unlinkSync(RUNTIME_FILE); } catch { /* ignore */ }
}

function readRuntimeApiPort() {
    try {
        const runtime = JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8'));
        const port = Number(runtime.apiPort);
        return Number.isFinite(port) && port > 0 ? port : null;
    } catch {
        return null;
    }
}

async function probeApiHealth(port) {
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (!res.ok) return false;
        const data = await res.json();
        return data?.storage === 'sqlite';
    } catch {
        return false;
    }
}

async function snapshotHealthyApiPorts() {
    const healthy = new Set();
    for (let port = PREFERRED_API; port < PREFERRED_API + PORT_SCAN_MAX; port++) {
        if (await probeApiHealth(port)) healthy.add(port);
    }
    return healthy;
}

async function waitForApiPort(excludePorts = new Set(), maxMs = 45000) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
        const fromRuntime = readRuntimeApiPort();
        if (fromRuntime && !excludePorts.has(fromRuntime) && await probeApiHealth(fromRuntime)) {
            return fromRuntime;
        }

        for (let port = PREFERRED_API; port < PREFERRED_API + PORT_SCAN_MAX; port++) {
            if (excludePorts.has(port)) continue;
            if (await probeApiHealth(port)) return port;
        }

        await new Promise(r => setTimeout(r, 300));
    }
    throw new Error('API server did not become ready (auto port)');
}

const apiEnv = {
    ...process.env,
    BSMS_DEV: 'true',
    PORT: process.env.PORT || 'auto',
    SEMANTIC_LAYER_URL: process.env.SEMANTIC_LAYER_URL || 'auto',
};

console.log('[dev] auto port — API from 3001, UI from 3000');

clearRuntime();
const existingApiPorts = await snapshotHealthyApiPorts();

const children = [];

function spawnTracked(label, cmd, args, env = process.env) {
    const child = spawn(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
    child.on('exit', (code, signal) => {
        if (signal) return;
        if (code && code !== 0) {
            console.error(`[dev] ${label} exited with code ${code}`);
            shutdown(code ?? 1);
        }
    });
    children.push(child);
    return child;
}

spawnTracked('api', 'npx', ['tsx', 'watch', 'server/index.ts'], apiEnv);

const apiPort = await waitForApiPort(existingApiPorts);
const frontendPort = await findAvailablePort('0.0.0.0', PREFERRED_FRONTEND, new Set([apiPort]));

writeRuntime({ apiPort, frontendPort });

const clientEnv = {
    ...process.env,
    BSMS_DEV: 'true',
    BSMS_API_PORT: String(apiPort),
    BSMS_FRONTEND_PORT: String(frontendPort),
};

console.log(`[dev] API → http://127.0.0.1:${apiPort}`);
console.log(`[dev] UI  → https://localhost:${frontendPort}`);

spawnTracked('client', 'npx', ['vite', '--port', String(frontendPort), '--strictPort'], clientEnv);

function shutdown(code = 0) {
    for (const child of children) {
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
    }
    process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
