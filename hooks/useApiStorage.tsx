import { useState, useEffect, useRef, Dispatch, SetStateAction, useCallback } from 'react';
import { api, ApiError } from '../utils/api.ts';

type ConflictHandler = (message: string) => void;

let globalConflictHandler: ConflictHandler | null = null;

export function setStorageConflictHandler(handler: ConflictHandler | null): void {
    globalConflictHandler = handler;
}

function useApiStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, boolean] {
    const [storedValue, setStoredValue] = useState<T>(initialValue);
    const [isLoading, setIsLoading] = useState(true);
    const isReady = useRef(false);
    const skipNextSave = useRef(true);
    const versionRef = useRef<number | undefined>(undefined);
    const saveQueueRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const persist = useCallback((value: T) => {
        if (saveQueueRef.current) clearTimeout(saveQueueRef.current);

        saveQueueRef.current = setTimeout(async () => {
            try {
                const result = await api.putData(key, value, versionRef.current);
                versionRef.current = result.version;
            } catch (err) {
                if (err instanceof ApiError && err.status === 409) {
                    globalConflictHandler?.('Another user saved changes. Reloading latest data…');
                    try {
                        const fresh = await api.getData<T>(key);
                        if (fresh) {
                            versionRef.current = fresh.version;
                            setStoredValue(fresh.data);
                        }
                    } catch { /* ignore */ }
                } else {
                    console.error(`Failed to save ${key}:`, err);
                }
            }
        }, 400);
    }, [key]);

    useEffect(() => {
        let cancelled = false;
        isReady.current = false;
        skipNextSave.current = true;

        api.getData<T>(key)
            .then(envelope => {
                if (cancelled) return;
                if (envelope) {
                    setStoredValue(envelope.data);
                    versionRef.current = envelope.version;
                }
            })
            .catch(err => {
                console.error(`Failed to load ${key}:`, err);
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
        if (skipNextSave.current) {
            skipNextSave.current = false;
            return;
        }
        persist(storedValue);
    }, [key, storedValue, persist]);

    return [storedValue, setStoredValue, isLoading];
}

export default useApiStorage;
