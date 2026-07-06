import { useEffect, useRef, useCallback } from 'react';

const WEDGE_GAP_MS = 50;
const MIN_LENGTH = 3;

export function useBarcodeWedge(enabled: boolean, onScan: (code: string) => void) {
    const bufferRef = useRef('');
    const lastKeyTimeRef = useRef(0);
    const onScanRef = useRef(onScan);
    onScanRef.current = onScan;

    const flush = useCallback(() => {
        const code = bufferRef.current.trim();
        bufferRef.current = '';
        if (code.length >= MIN_LENGTH) {
            onScanRef.current(code);
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const tag = target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
                return;
            }

            const now = Date.now();
            if (now - lastKeyTimeRef.current > WEDGE_GAP_MS) {
                bufferRef.current = '';
            }
            lastKeyTimeRef.current = now;

            if (e.key === 'Enter') {
                if (bufferRef.current) {
                    e.preventDefault();
                    flush();
                }
                return;
            }

            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                bufferRef.current += e.key;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [enabled, flush]);
}
