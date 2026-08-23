import type { AiActionContext, AiBusinessSnapshot, AiChatMessage, AiChatResult, AiInsightsResult, AiSettings, PurchaseExtractionResult } from '../types.ts';

const TOKEN_KEY = 'bsms_auth_token';

export interface ApiUser {
    id: number;
    username: string;
    displayName: string;
    role: 'admin' | 'staff';
    isActive?: boolean;
    createdAt?: string;
    mustChangePassword?: boolean;
}
export class ApiError extends Error {
    status: number;
    conflictData?: unknown;
    conflictVersion?: number;
    constructor(message: string, status: number, extras?: { conflictData?: unknown; conflictVersion?: number }) {
        super(message);
        this.status = status;
        this.conflictData = extras?.conflictData;
        this.conflictVersion = extras?.conflictVersion;
    }
}

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}

const DEFAULT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

/** Fired when the server rejects our token; AuthContext locks the app. */
export const UNAUTHORIZED_EVENT = 'bsms:unauthorized';

function notifyUnauthorized(): void {
    clearToken();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
}

async function request<T>(path: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(path, {
        ...options,
        headers,
        // Bound every request so a hung connection can never stall saves forever.
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
        let message = `Request failed (${res.status})`;
        let conflictData: unknown;
        let conflictVersion: number | undefined;
        try {
            const body = await res.json();
            if (body.error) message = body.error;
            if (body.data !== undefined) conflictData = body.data;
            if (typeof body.version === 'number') conflictVersion = body.version;
        } catch { /* ignore */ }
        // An expired or invalidated session is not a "connection problem" —
        // surface it by ending the session so the lock screen re-authenticates
        // instead of letting users retry into the same 401.
        // Login/register failures are excluded: there they are just bad credentials.
        const isAuthEndpoint = path.startsWith('/api/auth/login') || path.startsWith('/api/auth/register');
        if (res.status === 401 && !isAuthEndpoint) {
            notifyUnauthorized();
        }
        throw new ApiError(message, res.status, { conflictData, conflictVersion });
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
}

/**
 * Single bulk hydration of every collection at boot: one round-trip instead
 * of ~17 individual key fetches. The promise is memoized so all useApiStorage
 * consumers await the same request.
 */
export interface HydratedData {
    data: Record<string, unknown>;
    versions: Record<string, number>;
}

let hydrationPromise: Promise<HydratedData> | null = null;

export function hydrateAllData(force = false): Promise<HydratedData> {
    if (!hydrationPromise || force) {
        hydrationPromise = request<Record<string, unknown>>('/api/data')
            .then(payload => {
                const { __versions: versions, ...data } = payload;
                return { data, versions: (versions as Record<string, number>) ?? {} };
            })
            .catch(err => {
                // Allow a later retry after auth settles or the network recovers.
                hydrationPromise = null;
                throw err;
            });
    }
    return hydrationPromise;
}

function isUploadPath(path: string): boolean {
    return path.startsWith('/api/ai/') || path.startsWith('/api/einvoice/');
}

export const api = {
    login(username: string, password: string) {
        return request<{ token: string; mustChangePassword?: boolean; user: ApiUser }>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
    },

    register(username: string, password: string, displayName?: string) {
        return request<{ token: string; user: ApiUser }>('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, displayName }),
        });
    },

    me() {
        return request<{ user: ApiUser; allowRegistration: boolean }>('/api/auth/me');
    },

    changePassword(currentPassword: string, newPassword: string) {
        return request<{ ok: boolean; user: ApiUser }>('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword }),
        });
    },

    listUsers() {
        return request<{ users: ApiUser[] }>('/api/users');
    },

    createUser(username: string, password: string, displayName: string, role: 'admin' | 'staff') {
        return request<{ user: ApiUser }>('/api/users', {
            method: 'POST',
            body: JSON.stringify({ username, password, displayName, role }),
        });
    },

    updateUser(id: number, updates: { displayName?: string; role?: 'admin' | 'staff'; isActive?: boolean; password?: string }) {
        return request<{ user: ApiUser }>(`/api/users/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    },

    getData<T>(key: string): Promise<{ data: T; version: number } | null> {
        return hydrateAllData()
            .then(({ data, versions }) => {
                if (!(key in data)) return null;
                return { data: data[key] as T, version: versions[key] ?? 1 };
            })
            .catch(err => {
                if (err instanceof ApiError && err.status === 404) return null;
                throw err;
            });
    },

    /** Fresh per-key read bypassing the boot cache (used after conflicts). */
    refetchData<T>(key: string): Promise<{ data: T; version: number } | null> {
        return request<{ data: T; version: number }>(`/api/data/${key}`).catch(err => {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
        });
    },

    getAllData(): Promise<Record<string, unknown>> {
        return hydrateAllData().then(({ data }) => data);
    },

    invalidateHydration(): void {
        hydrationPromise = null;
    },

    putData<T>(key: string, value: T, version?: number): Promise<{ version: number }> {
        return request(`/api/data/${key}`, {
            method: 'PUT',
            body: JSON.stringify({ value, version }),
        });
    },

    importData(data: Record<string, unknown>): Promise<void> {
        return request('/api/data/import', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    resetData(confirmText = 'RESET'): Promise<void> {
        return request('/api/data/reset', {
            method: 'POST',
            body: JSON.stringify({ confirmText }),
        });
    },

    getAuditLogs(limit = 200): Promise<{ entries: AuditLogEntry[] }> {
        return request(`/api/audit?limit=${limit}`);
    },

    postAuditLog(entry: Omit<AuditLogEntry, 'id' | 'date' | 'userRole' | 'username'> & { userRole: string }): void {
        // Fire-and-forget mirror; failures are non-blocking by design.
        void request('/api/audit', {
            method: 'POST',
            body: JSON.stringify(entry),
        }).catch(() => { /* server trail is authoritative */ });
    },

    listSecrets() {
        return request<{ configured: Record<string, { set: boolean; preview: string | null }> }>('/api/secrets');
    },

    putSecret(name: string, value: string) {
        return request<{ ok: boolean; configured: Record<string, boolean> }>(`/api/secrets/${name}`, {
            method: 'PUT',
            body: JSON.stringify({ value }),
        });
    },

    createBackup() {
        return request<{ ok: boolean; file: string }>('/api/backup', { method: 'POST' });
    },

    listBackups() {
        return request<{ backups: { name: string; sizeBytes: number; createdAt: string }[] }>('/api/backup');
    },

    /** Server-side GSP proxy — credentials never reach the browser. */
    generateEInvoiceProxy(transaction: unknown): Promise<{ irn: string; ackNo: string; ackDate: string }> {
        return request('/api/einvoice/generate', {
            method: 'POST',
            body: JSON.stringify({ transaction }),
            timeoutMs: UPLOAD_TIMEOUT_MS,
        });
    },

    generateEWayBillProxy(transaction: unknown): Promise<{ eWayBillNo: string; eWayBillDate: string }> {
        return request('/api/einvoice/ewaybill', {
            method: 'POST',
            body: JSON.stringify({ transaction }),
            timeoutMs: UPLOAD_TIMEOUT_MS,
        });
    },
};

export interface AuditLogEntry {
    id: string;
    date: string;
    action: string;
    entityType?: string;
    entityId?: string;
    userRole: string;
    username?: string;
    details?: string;
    snapshot?: string;
}

// ---------------------------------------------------------------------------
// AI + e-invoice helpers
// ---------------------------------------------------------------------------

function aiRequest<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: UPLOAD_TIMEOUT_MS,
    });
}

export async function aiExtractPurchaseInvoice(body: {
    image: string;
    aiSettings: AiSettings;
    catalog?: { suppliers: { name: string }[]; productTypes: { brandName: string; name: string }[] };
}): Promise<PurchaseExtractionResult> {
    return aiRequest('/api/ai/extract-purchase-invoice', body);
}

export async function aiGetInsights(body: {
    aiSettings: AiSettings;
    period: string;
    businessSnapshot: AiBusinessSnapshot;
}): Promise<AiInsightsResult & { generatedAt?: string }> {
    return aiRequest('/api/ai/insights', body);
}

export async function aiTestConnection(body: {
    aiSettings: AiSettings;
}): Promise<{ ok: boolean; message: string }> {
    return aiRequest('/api/ai/test-connection', body);
}

export async function aiChat(body: {
    aiSettings: AiSettings;
    messages: AiChatMessage[];
    businessSnapshot: AiBusinessSnapshot;
    actionContext: AiActionContext;
}): Promise<AiChatResult> {
    return aiRequest('/api/ai/chat', body);
}

export async function aiOllamaModels(body: {
    aiSettings: AiSettings;
}): Promise<{
    available: string[];
    selected: {
        visionModel: string;
        textModel: string;
        tierSmall: string;
        tierMedium: string;
        tierLarge: string;
    };
    error?: string;
}> {
    return aiRequest('/api/ai/ollama-models', body);
}

export async function aiSemanticStatus(body: {
    aiSettings: AiSettings;
}): Promise<{ enabled: boolean; available: boolean; url: string; message: string; latencyMs?: number }> {
    return aiRequest('/api/ai/semantic-status', body);
}
