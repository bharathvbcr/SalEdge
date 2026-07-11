import fs from 'fs';
import path from 'path';

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
    if (!existing && partial.apiPort === undefined) return null;
    return writeDevRuntime({
        apiPort: partial.apiPort ?? existing!.apiPort,
        frontendPort: partial.frontendPort ?? existing?.frontendPort,
    });
}

export function getDevFrontendPort(fallback = 3000): number {
    return readDevRuntime()?.frontendPort ?? fallback;
}
