import fs from 'fs';
import path from 'path';
import selfsigned from 'selfsigned';
import { getLanAddresses } from './networkInfo.js';

// Desktop bundles redirect all writable state out of the (signed, read-only)
// .app bundle via BSMS_DATA_DIR; plain deployments keep repo-root defaults.
const DATA_ROOT = process.env.BSMS_DATA_DIR
    ? path.resolve(process.env.BSMS_DATA_DIR)
    : path.resolve(process.cwd());
const CERT_DIR = path.join(DATA_ROOT, '.certs');

export interface LocalCertMaterial {
    key: string;
    cert: string;
}

/** Create or load a self-signed cert for HTTPS on the local network (camera access on iOS). */
export async function ensureLocalCerts(): Promise<LocalCertMaterial | null> {
    if (process.env.BSMS_HTTPS === 'false') return null;

    const keyPath = path.join(CERT_DIR, 'key.pem');
    const certPath = path.join(CERT_DIR, 'cert.pem');

    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        fs.mkdirSync(CERT_DIR, { recursive: true });
        const altNames = [
            { type: 7 as const, ip: '127.0.0.1' },
            ...getLanAddresses().map(ip => ({ type: 7 as const, ip })),
        ];
        const notBeforeDate = new Date();
        const notAfterDate = new Date(notBeforeDate);
        notAfterDate.setFullYear(notAfterDate.getFullYear() + 2);

        const pems = await selfsigned.generate(
            [{ name: 'commonName', value: 'SalEdge Local' }],
            {
                keySize: 2048,
                algorithm: 'sha256',
                notBeforeDate,
                notAfterDate,
                extensions: [{ name: 'subjectAltName', altNames }],
            },
        );
        fs.writeFileSync(certPath, pems.cert, 'utf8');
        fs.writeFileSync(keyPath, pems.private, 'utf8');
        // A TLS private key must never be group/world-readable.
        try {
            fs.chmodSync(CERT_DIR, 0o700);
            fs.chmodSync(certPath, 0o600);
            fs.chmodSync(keyPath, 0o600);
        } catch { /* best effort on filesystems without POSIX perms */ }
        console.log('[certs] Generated local HTTPS certificate in', CERT_DIR);
    }

    return {
        key: fs.readFileSync(keyPath, 'utf8'),
        cert: fs.readFileSync(certPath, 'utf8'),
    };
}
