#!/usr/bin/env node
/**
 * Run semantic layer component benchmarks using .venv-semantic when present.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const venvPython =
    process.platform === 'win32'
        ? path.join(root, '.venv-semantic', 'Scripts', 'python.exe')
        : path.join(root, '.venv-semantic', 'bin', 'python');

const python = existsSync(venvPython) ? venvPython : process.env.PYTHON || 'python3';
const args = process.argv.slice(2);

const result = spawnSync(
    python,
    ['-m', 'semantic_layer.benchmark', ...args],
    { stdio: 'inherit', cwd: root, env: { ...process.env } },
);

process.exit(result.status ?? 0);
