import { Request, Response } from 'express';
import { getData, setData } from '../db.js';

const SECRET_NAMES = new Set(['geminiApiKey', 'eInvoiceApiKey', 'eInvoiceGspUrl']);
const SECRETS_KEY = '_secrets';

type SecretsMap = Record<string, string>;

function readSecrets(): SecretsMap {
    return (getData<SecretsMap>(SECRETS_KEY)?.value) || {};
}

function writeSecrets(map: SecretsMap): void {
    setData(SECRETS_KEY, map);
}

export function getSecret(name: string): string | undefined {
    const value = readSecrets()[name];
    return value && value.trim() ? value.trim() : undefined;
}

function mask(value: string): string {
    if (value.length <= 6) return '••••••';
    return `${value.slice(0, 3)}••••${value.slice(-3)}`;
}

/** Admin-only: store a server-side secret. Values never leave the server again unmasked. */
export function putSecretHandler(req: Request, res: Response): void {
    const { name } = req.params;
    if (!SECRET_NAMES.has(name)) {
        res.status(400).json({ error: `Unknown secret name. Allowed: ${[...SECRET_NAMES].join(', ')}` });
        return;
    }

    const { value } = req.body as { value?: string };
    if (typeof value !== 'string') {
        res.status(400).json({ error: 'value (string) is required' });
        return;
    }

    const secrets = readSecrets();
    if (!value.trim()) {
        delete secrets[name];
    } else {
        secrets[name] = value.trim();
    }
    writeSecrets(secrets);

    res.json({
        ok: true,
        configured: Object.fromEntries([...SECRET_NAMES].map(n => [n, !!secrets[n]])),
    });
}

/** Admin-only: which secrets are configured, masked — never raw values. */
export function listSecretsHandler(_req: Request, res: Response): void {
    const secrets = readSecrets();
    res.json({
        configured: Object.fromEntries(
            [...SECRET_NAMES].map(n => [
                n,
                { set: !!secrets[n], preview: secrets[n] ? mask(secrets[n]) : null },
            ])
        ),
    });
}
