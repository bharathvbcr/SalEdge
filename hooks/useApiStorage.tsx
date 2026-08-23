import { useState, useEffect, useRef, Dispatch, SetStateAction, useCallback } from 'react';
import { api, ApiError } from '../utils/api.ts';

type ConflictHandler = (message: string) => void;
type SaveErrorHandler = (message: string, key: string) => void;
type SaveRecoveredHandler = () => void;

let globalConflictHandler: ConflictHandler | null = null;
let globalSaveErrorHandler: SaveErrorHandler | null = null;
let globalSaveRecoveredHandler: SaveRecoveredHandler | null = null;

export function setStorageConflictHandler(handler: ConflictHandler | null): void {
    globalConflictHandler = handler;
}

export function setStorageSaveHandlers(handlers: {
    onError?: SaveErrorHandler | null;
    onRecovered?: SaveRecoveredHandler | null;
}): void {
    globalSaveErrorHandler = handlers.onError ?? null;
    globalSaveRecoveredHandler = handlers.onRecovered ?? null;
}

// ---------------------------------------------------------------------------
// Hydration health: when the boot load fails (server down, network blip), the
// UI would otherwise fall back to seed/demo data SILENTLY and staff record
// real business against fabricated stock. Surface it app-wide instead.
// ---------------------------------------------------------------------------

let globalHydrationHandler: ((failed: boolean) => void) | null = null;
const failedHydrationKeys = new Set<string>();

export function setStorageHydrationHandler(handler: ((failed: boolean) => void) | null): void {
    globalHydrationHandler = handler;
}

function markHydrationFailed(key: string): void {
    if (!failedHydrationKeys.has(key)) {
        failedHydrationKeys.add(key);
        globalHydrationHandler?.(true);
    }
}

function markHydrationRecovered(key: string): void {
    if (failedHydrationKeys.delete(key) && failedHydrationKeys.size === 0) {
        globalHydrationHandler?.(false);
    }
}

// ---------------------------------------------------------------------------
// Cross-tab sync: every successful save broadcasts so sibling tabs/devices on
// the same browser profile pick up the new version without waiting for a
// conflicting write.
// ---------------------------------------------------------------------------

const SYNC_CHANNEL_NAME = 'bsms-data-sync';

interface SyncMessage {
    key: string;
    version: number;
    tabId: string;
}

const tabId = Math.random().toString(36).slice(2);
let syncChannel: BroadcastChannel | null = null;

function getSyncChannel(): BroadcastChannel | null {
    if (typeof BroadcastChannel === 'undefined') return null;
    if (!syncChannel) {
        try {
            syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        } catch {
            return null;
        }
    }
    return syncChannel;
}

const RETRY_DELAYS_MS = [500, 1_500, 4_000];

function useApiStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, boolean] {
    const [storedValue, setStoredValue] = useState<T>(initialValue);
    const [isLoading, setIsLoading] = useState(true);
    const isReady = useRef(false);
    const skipNextSave = useRef(true);
    const suppressNextSave = useRef(false);
    const versionRef = useRef<number | undefined>(undefined);

    // One in-flight/queued write at a time; retries replace the queue.
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const attemptRef = useRef(0);
    const hasFailedSaveRef = useRef(false);
    const writingRef = useRef(false);

    const clearTimers = useCallback(() => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        saveTimerRef.current = null;
        retryTimerRef.current = null;
    }, []);

    useEffect(() => clearTimers, [clearTimers]);

    /** Replace local state from the server without triggering an echo-write. */
    const adoptServerValue = useCallback((data: T, version: number) => {
        suppressNextSave.current = true;
        versionRef.current = version;
        setStoredValue(data);
    }, []);

    const handleConflict = useCallback(async () => {
        globalConflictHandler?.('Another user saved changes. Reloading latest data…');
        try {
            const fresh = await api.refetchData<T>(key);
            if (fresh) adoptServerValue(fresh.data, fresh.version);
        } catch { /* ignore */ }
    }, [key, adoptServerValue]);

    const attemptSave = useCallback((value: T): Promise<boolean> => {
        writingRef.current = true;
        return api.putData(key, value, versionRef.current)
            .then(result => {
                writingRef.current = false;
                versionRef.current = result.version;
                markHydrationRecovered(key);

                const channel = getSyncChannel();
                channel?.postMessage({ key, version: result.version, tabId } satisfies SyncMessage);

                if (hasFailedSaveRef.current) {
                    hasFailedSaveRef.current = false;
                    globalSaveRecoveredHandler?.();
                }
                return true;
            })
            .catch(err => {
                writingRef.current = false;
                if (err instanceof ApiError && err.status === 409) {
                    void handleConflict();
                    return true; // conflict resolved via reload; stop retrying
                }
                throw err;
            });
    }, [key, handleConflict]);

    const scheduleRetry = useCallback((value: T) => {
        const attempt = attemptRef.current;
        if (attempt >= RETRY_DELAYS_MS.length) {
            hasFailedSaveRef.current = true;
            globalSaveErrorHandler?.(
                'Could not save changes after several attempts. Your latest edits may be lost — check your connection.',
                key,
            );
            return;
        }

        if (!hasFailedSaveRef.current) {
            hasFailedSaveRef.current = true;
            globalSaveErrorHandler?.('Saving failed — retrying…', key);
        }

        retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            attemptSave(value)
                .then(() => { attemptRef.current = 0; })
                .catch(() => {
                    attemptRef.current += 1;
                    scheduleRetry(value);
                });
        }, RETRY_DELAYS_MS[attempt]);
    }, [attemptSave, key]);

    const persist = useCallback((value: T) => {
        clearTimers();
        attemptRef.current = 0;

        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            attemptSave(value).catch(() => scheduleRetry(value));
        }, 400);
    }, [attemptSave, scheduleRetry, clearTimers]);

    // -----------------------------------------------------------------------
    // Load: single shared bulk hydration request seeds value + OCC version.
    // -----------------------------------------------------------------------
    useEffect(() => {
        let cancelled = false;
        isReady.current = false;
        skipNextSave.current = true;
        suppressNextSave.current = false;

        api.getData<T>(key)
            .then(envelope => {
                if (cancelled) return;
                if (envelope) {
                    versionRef.current = envelope.version;
                    // Direct set (not adoptServerValue): this IS the initial load,
                    // consumed by skipNextSave below.
                    setStoredValue(envelope.data);
                }
                markHydrationRecovered(key);
            })
            .catch(err => {
                console.error(`Failed to load ${key}:`, err);
                markHydrationFailed(key);
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false);
                    isReady.current = true;
                }
            });

        return () => {
            cancelled = true;
        };
    }, [key]);

    useEffect(() => {
        if (!isReady.current) return;
        if (suppressNextSave.current) {
            suppressNextSave.current = false;
            skipNextSave.current = false;
            return;
        }
        if (skipNextSave.current) {
            skipNextSave.current = false;
            return;
        }
        persist(storedValue);
    }, [key, storedValue, persist]);

    // -----------------------------------------------------------------------
    // Freshness: refetch when the window regains focus (multi-device) and
    // whenever another tab broadcasts a newer version (cross-tab).
    // -----------------------------------------------------------------------
    const refreshIfStale = useCallback(async () => {
        if (!isReady.current || writingRef.current || saveTimerRef.current || retryTimerRef.current) return;
        try {
            const fresh = await api.refetchData<T>(key);
            if (fresh && versionRef.current !== undefined && fresh.version > versionRef.current) {
                adoptServerValue(fresh.data, fresh.version);
            } else if (fresh && versionRef.current === undefined) {
                adoptServerValue(fresh.data, fresh.version);
            }
            if (fresh) markHydrationRecovered(key);
        } catch { /* offline — local state stays */ }
    }, [key, adoptServerValue]);

    useEffect(() => {
        const onFocus = () => void refreshIfStale();
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);

        const channel = getSyncChannel();
        let unsubscribe: (() => void) | undefined;
        if (channel) {
            const onMessage = (event: MessageEvent<SyncMessage>) => {
                const msg = event.data as SyncMessage;
                if (!msg || msg.key !== key || msg.tabId === tabId) return;
                if (versionRef.current === undefined || msg.version > versionRef.current) {
                    void refreshIfStale();
                }
            };
            channel.addEventListener('message', onMessage);
            unsubscribe = () => channel.removeEventListener('message', onMessage);
        }

        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
            unsubscribe?.();
        };
    }, [refreshIfStale, key]);

    // Invalidate the boot cache so post-login reloads see fresh data.
    useEffect(() => {
        return () => api.invalidateHydration();
    }, []);

    return [storedValue, setStoredValue, isLoading];
}

export default useApiStorage;
