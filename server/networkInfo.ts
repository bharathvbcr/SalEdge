import os from 'os';

/** Private IPv4 addresses reachable from other devices on the same LAN. */
export function getLanAddresses(): string[] {
    const nets = os.networkInterfaces();
    const results: string[] = [];

    for (const ifaces of Object.values(nets)) {
        for (const net of ifaces ?? []) {
            const family = String(net.family);
            const isIpv4 = family === 'IPv4' || family === '4';
            if (!isIpv4 || net.internal) continue;
            // Skip link-local (APIPA) addresses — not useful for phone pairing.
            if (net.address.startsWith('169.254.')) continue;
            results.push(net.address);
        }
    }

    return [...new Set(results)];
}

export function buildLanUrls(port: number, path = '/?page=Mobile', protocol: 'http' | 'https' = 'http'): string[] {
    return getLanAddresses().map(ip => `${protocol}://${ip}:${port}${path}`);
}

export function logNetworkAccess(port: number, protocol: 'http' | 'https' = 'http'): void {
    const urls = buildLanUrls(port, '/?page=Mobile', protocol);
    if (urls.length === 0) {
        console.log(`Mobile companion: connect phone on same Wi‑Fi (port ${port})`);
        return;
    }
    console.log('Mobile companion — scan QR in app or open on your phone (same Wi‑Fi):');
    for (const url of urls) {
        console.log(`  ${url}`);
    }
    if (protocol === 'https') {
        console.log('  (First visit: accept the certificate warning — required for iPhone camera)');
    }
}
