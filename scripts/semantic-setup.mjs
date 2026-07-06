#!/usr/bin/env node
/**
 * Create .venv-semantic at repo root and install Python deps (one-time setup).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const venvDir = path.join(root, '.venv-semantic');
const pythonBin =
    process.platform === 'win32'
        ? path.join(venvDir, 'Scripts', 'python.exe')
        : path.join(venvDir, 'bin', 'python');
const pipBin =
    process.platform === 'win32'
        ? path.join(venvDir, 'Scripts', 'pip.exe')
        : path.join(venvDir, 'bin', 'pip');

function run(cmd, args, opts = {}) {
    const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

if (!existsSync(pythonBin)) {
    console.log('Creating .venv-semantic...');
    run(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'venv', venvDir]);
}

console.log('Installing semantic layer dependencies...');
run(pipBin, ['install', '-r', 'requirements-semantic.txt']);

console.log('\nSemantic layer ready. It also starts automatically with npm run dev.');
