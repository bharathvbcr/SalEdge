import { useEffect, useRef, useCallback } from 'react';
import { BarcodeWedgeBuffer } from '../utils/barcodeWedgeBuffer.ts';

export function useBarcodeWedge(enabled: boolean, onScan: (code: string) => void) {
    const bufferRef = useRef<BarcodeWedgeBuffer | null>(null);
    if (!bufferRef.current) bufferRef.current = new BarcodeWedgeBuffer();
    const onScanRef = useRef(onScan);
    onScanRef.current = onScan;

    useEffect(() => {
        if (!enabled) return;
        const buffer = bufferRef.current!;

        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const tag = target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
                return;
            }

            if (e.key === 'Enter') {
                // Only swallow Enter when it actually completes a scan —
                // previously stray keystrokes ate Enter with no scan emitted.
                if (buffer.willEmitOnEnter()) {
                    e.preventDefault();
                    const code = buffer.handleKey('Enter');
                    if (code) onScanRef.current(code);
                }
                return;
            }

            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                buffer.handleKey(e.key);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            buffer.reset();
        };
    }, [enabled]);
}
