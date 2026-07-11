import net from 'node:net';

export const PREFERRED_API_PORT = 3001;
export const PREFERRED_FRONTEND_PORT = 3000;
export const PORT_SCAN_MAX = 30;

export function isPortFree(host: string, port: number): Promise<boolean> {
    return new Promise(resolve => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close(() => resolve(true));
        });
        server.listen(port, host);
    });
}

/** First free port at or after `startPort`; falls back to OS-assigned port. */
export async function findAvailablePort(host: string, startPort: number): Promise<number> {
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

export function parsePreferredPort(raw: string | undefined, fallback: number): number {
    if (!raw || raw === 'auto') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
