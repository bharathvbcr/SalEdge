import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const MobileInstallBanner: React.FC = () => {
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [dismissed, setDismissed] = useState(() => localStorage.getItem('bsms_pwa_dismissed') === '1');
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        setIsStandalone(
            window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as Navigator & { standalone?: boolean }).standalone === true
        );

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferred(e as BeforeInstallPromptEvent);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    if (isStandalone || dismissed || !deferred) return null;

    const install = async () => {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === 'accepted') setDeferred(null);
    };

    const dismiss = () => {
        localStorage.setItem('bsms_pwa_dismissed', '1');
        setDismissed(true);
    };

    return (
        <div className="bg-brand-red/10 border border-brand-red/30 rounded-xl p-3 flex items-center gap-3">
            <span className="text-2xl">📲</span>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-primary">Install Shop App</p>
                <p className="text-xs text-text-muted">Add to home screen for faster scanning</p>
            </div>
            <button onClick={install} className="btn-primary btn-sm flex-shrink-0">
                Install
            </button>
            <button onClick={dismiss} className="text-text-muted text-lg leading-none flex-shrink-0" aria-label="Dismiss">×</button>
        </div>
    );
};

export function registerServiceWorker() {
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
}
