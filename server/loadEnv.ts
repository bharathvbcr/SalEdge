import fs from 'fs';
import path from 'path';

/** Load `.env` into process.env (does not override existing vars). */
export function loadEnvFile(): void {
    const envPath = path.resolve(process.cwd(), '.env');
    let raw: string;
    try {
        raw = fs.readFileSync(envPath, 'utf8');
    } catch {
        return;
    }

    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

loadEnvFile();
