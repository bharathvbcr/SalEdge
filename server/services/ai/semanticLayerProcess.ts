/**
 * Auto-start and lifecycle management for the Python semantic layer.
 * Boots alongside the Express server so `npm run dev` is enough — no separate terminal.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSemanticLayerHealth } from './semanticLayerClient.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

let child: ChildProcess | null = null;
let starting = false;

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined || value === '') return defaultValue;
    return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

function venvPythonPath(): string {
    return process.platform === 'win32'
        ? path.join(REPO_ROOT, '.venv-semantic', 'Scripts', 'python.exe')
        : path.join(REPO_ROOT, '.venv-semantic', 'bin', 'python');
}

function shouldAutoStart(): boolean {
    if (process.env.SEMANTIC_LAYER_AUTO_START === 'false') return false;
    return parseBool(process.env.SEMANTIC_LAYER_ENABLED, true);
}

function semanticLayerUrl(): string {
    return process.env.SEMANTIC_LAYER_URL?.trim() || 'http://127.0.0.1:8090';
}

function ensureVenv(): void {
    const python = venvPythonPath();
    if (existsSync(python)) return;

    console.log('[semantic] First-run setup — creating Python environment (one time)...');
    const setup = spawnSync(process.execPath, ['scripts/semantic-setup.mjs'], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        env: process.env,
    });
    if (setup.status !== 0) {
        throw new Error('Semantic layer setup failed. Run: npm run semantic:setup');
    }
}

function spawnSemanticLayer(port: string, host: string): void {
    const python = existsSync(venvPythonPath()) ? venvPythonPath() : process.env.PYTHON || 'python3';

    const env = {
        ...process.env,
        SEMANTIC_OLLAMA_BASE_URL:
            process.env.SEMANTIC_OLLAMA_BASE_URL
            || process.env.OLLAMA_BASE_URL
            || 'http://127.0.0.1:11434',
    };

    child = spawn(
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
            cwd: REPO_ROOT,
            stdio: ['ignore', 'pipe', 'pipe'],
            env,
        },
    );

    child.stdout?.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) console.log(`[semantic] ${line}`);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line && !line.includes('Started server process')) {
            console.log(`[semantic] ${line}`);
        }
    });

    child.on('exit', (code, signal) => {
        if (signal) {
            console.log(`[semantic] stopped (${signal})`);
        } else if (code && code !== 0) {
            console.warn(`[semantic] exited with code ${code}`);
        }
        child = null;
        starting = false;
    });
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHealthy(url: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const health = await checkSemanticLayerHealth(url, 2000);
        if (health.available) {
            console.log(`[semantic] ready at ${url} (${health.latencyMs ?? '?'}ms)`);
            return true;
        }
        await sleep(750);
    }
    return false;
}

/**
 * Ensure the semantic layer is running. Non-blocking friendly — safe to call without await at startup.
 * Skips if already healthy, another process is starting, or auto-start is disabled.
 */
export async function ensureSemanticLayerRunning(): Promise<void> {
    if (!shouldAutoStart() || starting) return;

    const url = semanticLayerUrl();
    const existing = await checkSemanticLayerHealth(url, 1200);
    if (existing.available) {
        return;
    }

    starting = true;
    try {
        ensureVenv();

        const parsed = new URL(url);
        const host = parsed.hostname || '127.0.0.1';
        const port = parsed.port || '8090';

        console.log(`[semantic] starting on ${host}:${port}...`);
        spawnSemanticLayer(port, host);

        const ready = await waitForHealthy(url, 60_000);
        if (!ready) {
            console.warn(
                '[semantic] not ready yet — chat and insights will use direct Ollama until it is.',
            );
        }
    } catch (err) {
        console.warn(
            '[semantic] auto-start failed:',
            err instanceof Error ? err.message : err,
            '— falling back to direct Ollama.',
        );
    } finally {
        starting = false;
    }
}

export function shutdownSemanticLayer(): void {
    if (child && !child.killed) {
        child.kill('SIGTERM');
        child = null;
    }
}
