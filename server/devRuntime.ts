import fs from 'fs';
import path from 'path';
import { PREFERRED_FRONTEND_PORT } from './portUtils.js';

export interface DevRuntime {
    apiPort: number;
    frontendPort?: number;
    updatedAt: string;
}

const RUNTIME_DIR = path.resolve(process.cwd(), '.bsms-dev');
const RUNTIME_FILE = path.join(RUNTIME_DIR, 'runtime.json');

export function readDevRuntime(): DevRuntime | null {
    try {
        return JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8')) as DevRuntime;
    } catch {
        return null;
    }
}

export function writeDevRuntime(partial: Partial<DevRuntime> & Pick<DevRuntime, 'apiPort'>): DevRuntime {
    const existing = readDevRuntime();
    const next: DevRuntime = {
        apiPort: partial.apiPort,
        frontendPort: partial.frontendPort ?? existing?.frontendPort,
        updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(RUNTIME_FILE, JSON.stringify(next, null, 2));
    return next;
}

export function patchDevRuntime(partial: Partial<DevRuntime>): DevRuntime | null {
    const existing = readDevRuntime();
    if (existing || partial.apiPort !== undefined) {
        return writeDevRuntime({
            apiPort: partial.apiPort ?? existing!.apiPort,
            frontendPort: partial.frontendPort ?? existing?.frontendPort,
        });
    }
    // Vite may listen before the API seeds runtime — persist frontend port only.
    if (partial.frontendPort === undefined) return null;
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(RUNTIME_FILE, JSON.stringify({
        frontendPort: partial.frontendPort,
        updatedAt: new Date().toISOString(),
    }, null, 2));
    return null;
}

export function getDevFrontendPort(fallback = PREFERRED_FRONTEND_PORT): number {
    return readDevRuntime()?.frontendPort ?? fallback;
}
