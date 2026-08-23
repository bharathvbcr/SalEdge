/**
 * Auto-start and lifecycle management for the Python semantic layer.
 * Boots alongside the Express server so `npm run dev` is enough — no separate terminal.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSemanticLayerHealth } from './semanticLayerClient.js';
import { resolveOllamaModels } from './ollamaModels.js';

/**
 * Repo root must work for BOTH layouts: the source tree (server/services/ai/
 * → up 3) and the esbuild bundle (dist-server/index.mjs → up 3 lands OUTSIDE
 * the repo, which made auto-setup spawn node against /home/<user>/scripts/…).
 * Walk upward looking for the setup script instead of assuming depth.
 */
function resolveRepoRoot(): string {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
        if (existsSync(path.join(dir, 'scripts', 'semantic-setup.mjs'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    // Packaged installs ship no setup script — fall back to cwd and let
    // ensureVenv() fail cleanly into the direct-Ollama path.
    return process.cwd();
}
const REPO_ROOT = resolveRepoRoot();

const PREFERRED_HOST = '127.0.0.1';
const PREFERRED_PORT = 8090;
const PORT_SCAN_MAX = 30;

let child: ChildProcess | null = null;

// Per-launch identity: lets waitForHealthy() prove it is talking to THIS
// build's child rather than a stale orphan squatting on the port.
const INSTANCE_TOKEN = `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export function getSemanticInstanceToken(): string {
    return INSTANCE_TOKEN;
}
let starting = false;
let activeSemanticLayerUrl: string | null = null;

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

/** True when SEMANTIC_LAYER_URL is unset or explicitly `auto` — pick a free local port. */
function usesAutoPort(): boolean {
    const raw = process.env.SEMANTIC_LAYER_URL?.trim();
    return !raw || raw.toLowerCase() === 'auto';
}

function configuredSemanticLayerUrl(): string | null {
    const raw = process.env.SEMANTIC_LAYER_URL?.trim();
    if (!raw || raw.toLowerCase() === 'auto') return null;
    return raw;
}

function semanticHost(): string {
    return process.env.SEMANTIC_HOST?.trim() || PREFERRED_HOST;
}

function buildSemanticUrl(host: string, port: number): string {
    return `http://${host}:${port}`;
}

/** URL used by AI routes — reflects auto-selected port after startup. */
export function getActiveSemanticLayerUrl(): string {
    return activeSemanticLayerUrl
        || configuredSemanticLayerUrl()
        || buildSemanticUrl(semanticHost(), PREFERRED_PORT);
}

function isPortFree(host: string, port: number): Promise<boolean> {
    return new Promise(resolve => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close(() => resolve(true));
        });
        server.listen(port, host);
    });
}

async function findAvailablePort(host: string, startPort: number): Promise<number> {
    for (let port = startPort; port < startPort + PORT_SCAN_MAX; port++) {
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

interface SemanticLayerTarget {
    host: string;
    port: number;
    url: string;
    alreadyRunning: boolean;
}

async function resolveSemanticLayerTarget(): Promise<SemanticLayerTarget> {
    const explicit = configuredSemanticLayerUrl();
    if (explicit) {
        const parsed = new URL(explicit);
        const host = parsed.hostname || semanticHost();
        const port = Number(parsed.port) || PREFERRED_PORT;
        const health = await checkSemanticLayerHealth(explicit, 1200);
        if (health.available) activeSemanticLayerUrl = explicit;
        return { host, port, url: explicit, alreadyRunning: health.available };
    }

    const host = semanticHost();

    if (activeSemanticLayerUrl) {
        const health = await checkSemanticLayerHealth(activeSemanticLayerUrl, 1200);
        if (health.available) {
            const parsed = new URL(activeSemanticLayerUrl);
            return {
                host: parsed.hostname || host,
                port: Number(parsed.port) || PREFERRED_PORT,
                url: activeSemanticLayerUrl,
                alreadyRunning: true,
            };
        }
        activeSemanticLayerUrl = null;
    }

    for (let port = PREFERRED_PORT; port < PREFERRED_PORT + PORT_SCAN_MAX; port++) {
        const url = buildSemanticUrl(host, port);
        const health = await checkSemanticLayerHealth(url, 800);
        if (health.available) {
            activeSemanticLayerUrl = url;
            return { host, port, url, alreadyRunning: true };
        }
    }

    const port = await findAvailablePort(host, PREFERRED_PORT);
    const url = buildSemanticUrl(host, port);
    activeSemanticLayerUrl = url;
    return { host, port, url, alreadyRunning: false };
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

function spawnSemanticLayer(port: string, host: string, extraEnv: Record<string, string> = {}): void {
    const python = existsSync(venvPythonPath()) ? venvPythonPath() : process.env.PYTHON || 'python3';

    const ollamaBase =
        extraEnv.SEMANTIC_OLLAMA_BASE_URL
        || process.env.SEMANTIC_OLLAMA_BASE_URL
        || process.env.OLLAMA_BASE_URL
        || 'http://127.0.0.1:11434';

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        ...extraEnv,
        SEMANTIC_OLLAMA_BASE_URL: ollamaBase,
        SEMANTIC_INSTANCE_TOKEN: INSTANCE_TOKEN,
    };
    delete env.PORT;

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
        // Strict instance match: a stale orphan from an older build must not
        // be adopted as if our fresh spawn were ready.
        const health = await checkSemanticLayerHealth(url, 2000, { expectInstance: INSTANCE_TOKEN });
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

    starting = true;
    try {
        const target = await resolveSemanticLayerTarget();

        if (target.alreadyRunning) {
            return;
        }

        ensureVenv();

        const ollamaBase =
            process.env.SEMANTIC_OLLAMA_BASE_URL
            || process.env.OLLAMA_BASE_URL
            || 'http://127.0.0.1:11434';

        let tierEnv: Record<string, string> = {};
        try {
            const models = await resolveOllamaModels({ baseUrl: ollamaBase });
            tierEnv = {
                SEMANTIC_TIER_SMALL_MODEL: models.tierSmall,
                SEMANTIC_TIER_MEDIUM_MODEL: models.tierMedium,
                SEMANTIC_TIER_LARGE_MODEL: models.tierLarge,
            };
        } catch (err) {
            console.warn(
                '[semantic] Could not discover Ollama models for tier routing:',
                err instanceof Error ? err.message : err,
            );
        }

        console.log(
            usesAutoPort()
                ? `[semantic] auto-selected port ${target.port} (preferred ${PREFERRED_PORT} was unavailable)`
                : `[semantic] starting on ${target.host}:${target.port}...`,
        );
        spawnSemanticLayer(String(target.port), target.host, tierEnv);

        const ready = await waitForHealthy(target.url, 60_000);
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
    activeSemanticLayerUrl = null;
}
