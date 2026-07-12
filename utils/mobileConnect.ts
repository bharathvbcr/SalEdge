import { Page } from '../types.ts';
import { getToken } from './api.ts';

export const MOBILE_PAGE_QUERY = 'Mobile';
export const MOBILE_REDIRECT_KEY = 'bsms_post_login_page';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalHost(hostname: string): boolean {
    return LOCAL_HOSTS.has(hostname);
}

export function isPrivateLanHost(hostname: string): boolean {
    if (isLocalHost(hostname)) return true;
    if (hostname.startsWith('192.168.')) return true;
    if (hostname.startsWith('10.')) return true;
    const match = /^172\.(1[6-9]|2\d|3[01])\./.exec(hostname);
    return !!match;
}

export function isSecureContext(): boolean {
    return typeof window !== 'undefined' && window.isSecureContext;
}

export function getRequestedPage(): Page | null {
    const page = new URLSearchParams(window.location.search).get('page');
    return page === MOBILE_PAGE_QUERY ? 'Mobile' : null;
}

export function stashMobileRedirect(page: Page = 'Mobile'): void {
    sessionStorage.setItem(MOBILE_REDIRECT_KEY, page);
}

export function consumeMobileRedirect(): Page | null {
    const page = sessionStorage.getItem(MOBILE_REDIRECT_KEY);
    if (!page) return null;
    sessionStorage.removeItem(MOBILE_REDIRECT_KEY);
    return page === MOBILE_PAGE_QUERY ? 'Mobile' : null;
}

export function resolveInitialMobilePage(): Page | null {
    return getRequestedPage() ?? consumeMobileRedirect();
}

export function isMobileViewport(): boolean {
    return window.matchMedia('(max-width: 768px)').matches;
}

export function isMobileCompanionContext(): boolean {
    return getRequestedPage() === 'Mobile' || isMobileViewport();
}

/** Port the phone should use — matches the UI the desktop browser is on. */
export function getClientPort(): number {
    const port = window.location.port;
    if (port) return Number(port);
    return window.location.protocol === 'https:' ? 443 : 80;
}

export function getClientProtocol(): 'http:' | 'https:' {
    return window.location.protocol === 'https:' ? 'https:' : 'http:';
}

export function buildMobileConnectUrl(
    host: string,
    port = getClientPort(),
    protocol: 'http:' | 'https:' = getClientProtocol(),
): string {
    return `${protocol}//${host}:${port}/?page=${MOBILE_PAGE_QUERY}`;
}

export function resolveMobileConnectUrlFromOrigin(): string {
    const { hostname, origin } = window.location;
    if (!isLocalHost(hostname)) {
        return `${origin}/?page=${MOBILE_PAGE_QUERY}`;
    }
    return '';
}

export interface NetworkInfoResponse {
    lanHosts: string[];
    apiPort: number;
    frontendPort: number;
    protocol: 'http' | 'https';
    httpsAvailable: boolean;
}

export type LanMobileUrlsResult = {
    urls: string[];
    error?: 'no_network' | 'api_unreachable' | 'unauthorized';
};

export async function fetchNetworkInfo(): Promise<NetworkInfoResponse | null> {
    try {
        const headers: Record<string, string> = {};
        const token = getToken();
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch('/api/network-info', { headers });
        if (res.status === 401) return null;
        if (!res.ok) return null;
        return (await res.json()) as NetworkInfoResponse;
    } catch {
        return null;
    }
}

export async function fetchLanMobileUrls(): Promise<LanMobileUrlsResult> {
    const existing = resolveMobileConnectUrlFromOrigin();
    if (existing) return { urls: [existing] };

    let data: NetworkInfoResponse;
    try {
        const headers: Record<string, string> = {};
        const token = getToken();
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch('/api/network-info', { headers });
        if (res.status === 401) return { urls: [], error: 'unauthorized' };
        if (!res.ok) return { urls: [], error: 'api_unreachable' };
        data = (await res.json()) as NetworkInfoResponse;
    } catch {
        return { urls: [], error: 'api_unreachable' };
    }

    if (!data.lanHosts.length) return { urls: [], error: 'no_network' };

    const protocol: 'http:' | 'https:' =
        data.httpsAvailable || getClientProtocol() === 'https:' ? 'https:' : 'http:';
    const port = data.frontendPort || getClientPort();

    return {
        urls: data.lanHosts.map(host => buildMobileConnectUrl(host, port, protocol)),
    };
}

export function clearMobilePageQuery(): void {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('page')) return;
    url.searchParams.delete('page');
    const next = url.searchParams.toString();
    window.history.replaceState({}, '', next ? `${url.pathname}?${next}` : url.pathname);
}

export function needsHttpsForCamera(): boolean {
    return isPrivateLanHost(window.location.hostname) && !isSecureContext();
}
