import { Request, Response } from 'express';
import { getSecret } from './secrets.js';

const IRN_REGEX = /^[a-f0-9]{64}$/i;
const EWAY_BILL_REGEX = /^\d{12}$/;
const ACK_NO_REGEX = /^\d{1,15}$/;

/**
 * Server-side proxy to the configured GSP. The API key and endpoint never
 * reach the browser. Failures are returned loudly — no mock fallback here.
 */
async function proxyGsp(req: Request, res: Response, path: string, validate: (payload: Record<string, unknown>) => string | null): Promise<void> {
    const apiKey = getSecret('eInvoiceApiKey');
    const gspUrl = getSecret('eInvoiceGspUrl');

    if (!apiKey || !gspUrl) {
        res.status(400).json({ error: 'E-invoice is not configured. Set the GSP URL and API key in Settings.' });
        return;
    }

    const transaction = req.body?.transaction;
    if (!transaction || typeof transaction !== 'object') {
        res.status(400).json({ error: 'transaction object is required' });
        return;
    }

    try {
        const base = gspUrl.replace(/\/$/, '');
        const upstream = await fetch(`${base}${path}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ transaction }),
            signal: AbortSignal.timeout(30_000),
        });

        if (!upstream.ok) {
            const detail = await upstream.text().catch(() => upstream.statusText);
            console.error(`[einvoice] GSP ${path} failed (${upstream.status}):`, detail.slice(0, 500));
            res.status(502).json({ error: `GSP rejected the request (${upstream.status}).` });
            return;
        }

        const payload = await upstream.json() as Record<string, unknown>;
        const invalid = validate(payload);
        if (invalid) {
            res.status(502).json({ error: `GSP returned an invalid response: ${invalid}` });
            return;
        }
        res.json(payload);
    } catch (err) {
        console.error('[einvoice] GSP call failed:', err instanceof Error ? err.message : err);
        res.status(502).json({ error: 'Could not reach the GSP endpoint. Check connectivity and configuration.' });
    }
}

export function generateEInvoiceHandler(req: Request, res: Response): void {
    void proxyGsp(req, res, '/einvoice/generate', payload => {
        if (!IRN_REGEX.test(String(payload.irn ?? ''))) return 'invalid IRN format';
        if (!ACK_NO_REGEX.test(String(payload.ackNo ?? ''))) return 'invalid Ack No format';
        return null;
    });
}

export function generateEWayBillHandler(req: Request, res: Response): void {
    void proxyGsp(req, res, '/ewaybill/generate', payload => {
        if (!EWAY_BILL_REGEX.test(String(payload.eWayBillNo ?? ''))) return 'invalid E-Way Bill number';
        return null;
    });
}
