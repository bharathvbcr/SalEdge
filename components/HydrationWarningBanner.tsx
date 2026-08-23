import React, { useState } from 'react';
import { api } from '../utils/api.ts';
import { IconAlertTriangle } from './icons.tsx';

/**
 * Persistent banner shown when the initial data load from the server failed.
 * The UI falls back to seed/demo data in that state — staff must know that
 * what they see is NOT their real books before recording transactions.
 */
export const HydrationWarningBanner: React.FC = () => {
    const [retrying, setRetrying] = useState(false);

    const handleRetry = () => {
        setRetrying(true);
        api.invalidateHydration();
        window.location.reload();
    };

    return (
        <div
            role="alert"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/60 dark:text-amber-200"
        >
            <IconAlertTriangle className="h-5 w-5 shrink-0" />
            <span className="font-medium">
                Couldn't load your shop's live data. What you're seeing may be sample data — don't record sales until reconnected.
            </span>
            <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="ml-auto rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
                {retrying ? 'Retrying…' : 'Retry now'}
            </button>
        </div>
    );
};
