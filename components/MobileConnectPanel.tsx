import React, { useCallback, useEffect, useState } from 'react';
import { fetchLanMobileUrls } from '../utils/mobileConnect.ts';

async function makeQrDataUrl(text: string): Promise<string> {
    const QRCode = await import('qrcode');
    return QRCode.toDataURL(text, {
        width: 220,
        margin: 2,
        color: { dark: '#1e293b', light: '#ffffff' },
    });
}

function describeDiscoveryFailure(reason: 'no_network' | 'api_unreachable' | 'unauthorized'): string {
    switch (reason) {
        case 'unauthorized':
            return 'Session expired — sign in again, then refresh.';
        case 'api_unreachable':
            return 'Could not reach the app server. Ensure it is running, then refresh.';
        case 'no_network':
            return 'No Wi‑Fi address found on this computer. Connect to Wi‑Fi and refresh.';
    }
}

export const MobileConnectPanel: React.FC = () => {
    const [urls, setUrls] = useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const activeUrl = urls[selectedIndex] ?? null;
    const isHttps = activeUrl?.startsWith('https://') ?? false;

    const loadUrls = useCallback(async (cancelled: () => boolean) => {
        setLoading(true);
        setError(null);
        const discovered = await fetchLanMobileUrls();
        if (cancelled()) return;
        if (discovered.urls.length > 0) {
            setUrls(discovered.urls);
            setSelectedIndex(0);
            try {
                const dataUrl = await makeQrDataUrl(discovered.urls[0]);
                if (!cancelled()) setQrDataUrl(dataUrl);
            } catch {
                if (!cancelled()) setError('QR code unavailable — use the link below.');
            }
            if (!cancelled()) setLoading(false);
        } else {
            setUrls([]);
            setQrDataUrl(null);
            setError(describeDiscoveryFailure(discovered.error ?? 'api_unreachable'));
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        void loadUrls(() => cancelled);
        return () => { cancelled = true; };
    }, [loadUrls, refreshKey]);

    useEffect(() => {
        if (!activeUrl) return;
        let cancelled = false;
        makeQrDataUrl(activeUrl).then(dataUrl => {
            if (!cancelled) setQrDataUrl(dataUrl);
        }).catch(() => {
            if (!cancelled) setQrDataUrl(null);
        });
        return () => { cancelled = true; };
    }, [activeUrl]);

    const copyUrl = () => {
        if (!activeUrl) return;
        navigator.clipboard.writeText(activeUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="bg-bg-secondary border border-border-color rounded-xl p-5 space-y-4 text-left">
            <div className="flex flex-col sm:flex-row gap-5 items-center">
                <div className="flex-shrink-0 relative">
                    {loading ? (
                        <div className="w-[220px] h-[220px] rounded-xl bg-bg-tertiary animate-pulse" />
                    ) : qrDataUrl ? (
                        <img
                            src={qrDataUrl}
                            alt="QR code to open mobile companion on your phone"
                            className="w-[220px] h-[220px] rounded-xl border border-border-color bg-white p-2"
                        />
                    ) : (
                        <div className="w-[220px] h-[220px] rounded-xl bg-bg-tertiary flex items-center justify-center text-4xl">
                            📱
                        </div>
                    )}
                    {isHttps && !loading && (
                        <span className="absolute -top-2 -right-2 text-[10px] font-bold uppercase tracking-wide bg-green-600 text-white px-2 py-0.5 rounded-full">
                            HTTPS
                        </span>
                    )}
                </div>
                <div className="flex-1 space-y-3 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-text-primary">Connect your phone</p>
                        <button
                            type="button"
                            onClick={() => setRefreshKey(k => k + 1)}
                            className="text-xs text-brand-red font-semibold hover:underline"
                        >
                            Refresh
                        </button>
                    </div>
                    <ol className="text-sm text-text-muted space-y-1.5 list-decimal list-inside">
                        <li>Connect phone to the <strong className="text-text-secondary">same Wi‑Fi</strong></li>
                        <li>Scan the QR code with your camera</li>
                        <li>Sign in with your shop account</li>
                        <li>Tap <strong className="text-text-secondary">Add to Home Screen</strong> for quick access</li>
                    </ol>
                </div>
            </div>

            {isHttps && (
                <p className="text-xs text-text-muted bg-bg-tertiary rounded-lg px-3 py-2">
                    <strong className="text-text-secondary">iPhone first visit:</strong> Safari may warn about the certificate — tap <em>Show Details</em> → <em>visit this website</em>. This is required for camera scanning.
                </p>
            )}

            {error && !activeUrl && (
                <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p>
            )}
            {error && activeUrl && (
                <p className="text-xs text-text-muted">{error}</p>
            )}

            {urls.length > 1 && (
                <div className="flex flex-wrap gap-2">
                    {urls.map((url, i) => {
                        const host = new URL(url).hostname;
                        return (
                            <button
                                key={url}
                                type="button"
                                onClick={() => setSelectedIndex(i)}
                                className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-colors ${
                                    i === selectedIndex
                                        ? 'border-brand-red bg-brand-red/10 text-brand-red'
                                        : 'border-border-color text-text-muted hover:border-text-muted'
                                }`}
                            >
                                {host}
                            </button>
                        );
                    })}
                </div>
            )}

            {activeUrl && (
                <div className="flex gap-2">
                    <code className="flex-1 text-left text-sm bg-bg-tertiary rounded-lg px-3 py-2 font-mono truncate">{activeUrl}</code>
                    <button onClick={copyUrl} className="btn-primary btn-sm flex-shrink-0">
                        {copied ? 'Copied!' : 'Copy link'}
                    </button>
                </div>
            )}
        </div>
    );
};
