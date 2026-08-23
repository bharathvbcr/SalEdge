import { Transaction } from '../types.ts';
import { api } from './api.ts';

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

export type EInvoiceMode = 'mock' | 'live';

export type EInvoiceGenerateResult = {
    irn: string;
    ackNo: string;
    ackDate: string;
    /** 'MockGenerated' marks locally-fabricated identifiers that were never filed with the IRP. */
    status: 'Generated' | 'MockGenerated';
};

export type EWayBillGenerateResult = {
    eWayBillNo: string;
    eWayBillDate: string;
    status: 'Generated' | 'MockGenerated';
};

/**
 * Generate an IRN. In 'live' mode the request is proxied through the app's own
 * server (which holds the GSP credentials) and ANY failure throws loudly —
 * a failed GSP call must never silently degrade to fabricated legal
 * documents. Mock mode returns distinctly-marked sandbox data.
 */
export async function generateEInvoice(
    transaction: Transaction,
    mode: EInvoiceMode = 'mock'
): Promise<EInvoiceGenerateResult> {
    if (mode === 'live') {
        const result = await api.generateEInvoiceProxy(transaction);
        if (!isValidIrn(result.irn)) throw new Error('GSP returned invalid IRN format');
        if (!isValidAckNo(String(result.ackNo))) throw new Error('GSP returned invalid Ack No format');
        return { irn: result.irn, ackNo: String(result.ackNo), ackDate: result.ackDate, status: 'Generated' };
    }

    // Explicit mock/sandbox path — clearly flagged, never mixed with real filings.
    await new Promise(r => setTimeout(r, 400));

    const irn = generateHash(`${transaction.id}-${transaction.invoiceNumber || ''}-${transaction.total}`);
    const ackNo = String(Date.now()).slice(-12);
    const ackDate = new Date().toISOString();

    if (!isValidIrn(irn)) throw new Error('Generated IRN failed validation');
    if (!isValidAckNo(ackNo)) throw new Error('Generated Ack No failed validation');

    return { irn, ackNo, ackDate, status: 'MockGenerated' };
}

/**
 * Generate an E-Way Bill. Same contract as generateEInvoice: live mode fails
 * loudly through the server proxy; mock mode is explicitly requested.
 */
export async function generateEWayBill(
    transaction: Transaction,
    mode: EInvoiceMode = 'mock'
): Promise<EWayBillGenerateResult> {
    if (mode === 'live') {
        const result = await api.generateEWayBillProxy(transaction);
        if (!isValidEWayBillNo(String(result.eWayBillNo))) throw new Error('GSP returned invalid E-Way Bill No');
        return { eWayBillNo: String(result.eWayBillNo), eWayBillDate: result.eWayBillDate, status: 'Generated' };
    }

    await new Promise(r => setTimeout(r, 300));

    const eWayBillNo = String(100000000000 + (Date.now() % 900000000000)).slice(0, 12);
    const eWayBillDate = new Date().toISOString();

    if (!isValidEWayBillNo(eWayBillNo)) throw new Error('Generated E-Way Bill No failed validation');

    return { eWayBillNo, eWayBillDate, status: 'MockGenerated' };
}

/**
 * The e-invoicing mandate applies by aggregate annual TURNOVER (configured per
 * firm in Settings), not per-invoice value — so any B2B invoice from a
 * mandate-covered firm needs an IRN.
 */
export function requiresEInvoice(transaction: Transaction, mandateApplied = false): boolean {
    return !!(mandateApplied && transaction.customerGst);
}

export function requiresEWayBill(transaction: Transaction): boolean {
    return transaction.total >= 50000 && transaction.type === 'Sale';
}
