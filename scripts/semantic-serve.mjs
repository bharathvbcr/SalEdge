#!/usr/bin/env node
/**
 * Cross-platform launcher for the semantic layer FastAPI server.
 * Auto-runs setup on first launch. Usually not needed — the Express server starts this for you.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.SEMANTIC_HOST || '127.0.0.1';
const port = process.env.SEMANTIC_PORT || '8090';

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
        '--reload',
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
