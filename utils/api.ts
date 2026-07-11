import type { AiActionContext, AiBusinessSnapshot, AiChatMessage, AiChatResult, AiInsightsResult, AiSettings, PurchaseExtractionResult } from '../types.ts';

const TOKEN_KEY = 'bsms_auth_token';

export interface ApiUser {
    id: number;
    username: string;
    displayName: string;
    role: 'admin' | 'staff';
    isActive?: boolean;
    createdAt?: string;
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(path, { ...options, headers });

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
        throw new ApiError(message, res.status, { conflictData, conflictVersion });
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
}

export const api = {
    login(username: string, password: string) {
        return request<{ token: string; user: ApiUser }>('/api/auth/login', {
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
        return request<{ data: T; version: number }>(`/api/data/${key}`).catch(err => {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
        });
    },

    putData<T>(key: string, value: T, version?: number): Promise<{ version: number }> {
        return request(`/api/data/${key}`, {
            method: 'PUT',
            body: JSON.stringify({ value, version }),
        });
    },

    getAllData(): Promise<Record<string, unknown>> {
        return request('/api/data');
    },

    importData(data: Record<string, unknown>): Promise<void> {
        return request('/api/data/import', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    resetData(): Promise<void> {
        return request('/api/data/reset', { method: 'POST' });
    },
};

export async function aiExtractPurchaseInvoice(body: {
    image: string;
    aiSettings: AiSettings;
    catalog?: { suppliers: { name: string }[]; productTypes: { brandName: string; name: string }[] };
}): Promise<PurchaseExtractionResult> {
    return request('/api/ai/extract-purchase-invoice', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

export async function aiGetInsights(body: {
    aiSettings: AiSettings;
    period: string;
    businessSnapshot: AiBusinessSnapshot;
}): Promise<AiInsightsResult & { generatedAt?: string }> {
    return request('/api/ai/insights', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

export async function aiTestConnection(body: {
    aiSettings: AiSettings;
}): Promise<{ ok: boolean; message: string }> {
    return request('/api/ai/test-connection', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

export async function aiChat(body: {
    aiSettings: AiSettings;
    messages: AiChatMessage[];
    businessSnapshot: AiBusinessSnapshot;
    actionContext: AiActionContext;
}): Promise<AiChatResult> {
    return request('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify(body),
    });
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
    return request('/api/ai/ollama-models', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

export async function aiSemanticStatus(body: {
    aiSettings: AiSettings;
}): Promise<{ enabled: boolean; available: boolean; url: string; message: string; latencyMs?: number }> {
    return request('/api/ai/semantic-status', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
