import fs from 'fs';
import path from 'path';
import selfsigned from 'selfsigned';
import { getLanAddresses } from './networkInfo.js';

const CERT_DIR = path.resolve(process.cwd(), '.certs');

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
            [{ name: 'commonName', value: 'Battery Shop Local' }],
            {
                keySize: 2048,
                algorithm: 'sha256',
                notBeforeDate,
                notAfterDate,
                extensions: [{ name: 'subjectAltName', altNames }],
            },
        );
        fs.writeFileSync(keyPath, pems.private, 'utf8');
        fs.writeFileSync(certPath, pems.cert, 'utf8');
        console.log('[certs] Generated local HTTPS certificate in .certs/');
    }

    return {
        key: fs.readFileSync(keyPath, 'utf8'),
        cert: fs.readFileSync(certPath, 'utf8'),
    };
}
