import { Transaction } from '../types.ts';

const IRN_REGEX = /^[a-f0-9]{64}$/i;
const EWAY_BILL_REGEX = /^\d{12}$/;
const ACK_NO_REGEX = /^\d{1,15}$/;

export function isValidIrn(irn: string): boolean {
    return IRN_REGEX.test(irn);
}

export function isValidEWayBillNo(no: string): boolean {
    return EWAY_BILL_REGEX.test(no);
}

export function isValidAckNo(no: string): boolean {
    return ACK_NO_REGEX.test(no);
}

function generateHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    const base = Math.abs(hash).toString(16).padStart(16, '0');
    const seed = `${input}-${Date.now()}`;
    let result = '';
    for (let i = 0; i < 64; i++) {
        const idx = (seed.charCodeAt(i % seed.length) + i + parseInt(base[i % base.length], 16)) % 16;
        result += idx.toString(16);
    }
    return result;
}

export type EInvoiceGenerateResult = {
    irn: string;
    ackNo: string;
    ackDate: string;
    status: 'Generated';
};

export type EWayBillGenerateResult = {
    eWayBillNo: string;
    eWayBillDate: string;
    status: 'Generated';
};

export interface GspConfig {
    apiKey?: string;
    gspUrl?: string;
}

async function callGsp<T>(endpoint: string, transaction: Transaction, config: GspConfig): Promise<T> {
    const base = config.gspUrl!.replace(/\/$/, '');
    const res = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transaction }),
    });
    if (!res.ok) {
        const err = await res.text().catch(() => res.statusText);
        throw new Error(`GSP error (${res.status}): ${err}`);
    }
    return res.json() as Promise<T>;
}

export async function generateEInvoice(
    transaction: Transaction,
    config?: GspConfig
): Promise<EInvoiceGenerateResult> {
    if (config?.apiKey && config?.gspUrl) {
        try {
            const result = await callGsp<EInvoiceGenerateResult>('/einvoice/generate', transaction, config);
            if (!isValidIrn(result.irn)) throw new Error('GSP returned invalid IRN format');
            if (!isValidAckNo(result.ackNo)) throw new Error('GSP returned invalid Ack No format');
            return result;
        } catch (err) {
            console.warn('GSP e-invoice failed, falling back to mock:', err);
        }
    }

    await new Promise(r => setTimeout(r, 400));

    const irn = generateHash(`${transaction.id}-${transaction.invoiceNumber || ''}-${transaction.total}`);
    const ackNo = String(Date.now()).slice(-12);
    const ackDate = new Date().toISOString();

    if (!isValidIrn(irn)) throw new Error('Generated IRN failed validation');
    if (!isValidAckNo(ackNo)) throw new Error('Generated Ack No failed validation');

    return { irn, ackNo, ackDate, status: 'Generated' };
}

export async function generateEWayBill(
    transaction: Transaction,
    config?: GspConfig
): Promise<EWayBillGenerateResult> {
    if (config?.apiKey && config?.gspUrl) {
        try {
            const result = await callGsp<EWayBillGenerateResult>('/ewaybill/generate', transaction, config);
            if (!isValidEWayBillNo(result.eWayBillNo)) throw new Error('GSP returned invalid E-Way Bill No');
            return result;
        } catch (err) {
            console.warn('GSP e-way bill failed, falling back to mock:', err);
        }
    }

    await new Promise(r => setTimeout(r, 300));

    const eWayBillNo = String(100000000000 + (Date.now() % 900000000000)).slice(0, 12);
    const eWayBillDate = new Date().toISOString();

    if (!isValidEWayBillNo(eWayBillNo)) throw new Error('Generated E-Way Bill No failed validation');

    return { eWayBillNo, eWayBillDate, status: 'Generated' };
}

export function requiresEInvoice(transaction: Transaction): boolean {
    return !!(transaction.customerGst && transaction.total >= 50000);
}

export function requiresEWayBill(transaction: Transaction): boolean {
    return transaction.total >= 50000 && transaction.type === 'Sale';
}
