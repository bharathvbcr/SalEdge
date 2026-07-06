import React, { useEffect, useRef, useState, useCallback, useId } from 'react';
import { IconX } from './icons.tsx';
import { hapticSuccess, playScanBeep } from '../utils/haptics.ts';

interface BarcodeScannerProps {
    onScan: (code: string) => void;
    onClose?: () => void;
    pauseOnScan?: boolean;
    scanSound?: boolean;
    fullscreen?: boolean;
    className?: string;
    active?: boolean;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
    onScan,
    onClose,
    pauseOnScan = true,
    scanSound = true,
    fullscreen = false,
    className = '',
    active = true,
}) => {
    const reactId = useId().replace(/:/g, '');
    const containerId = `barcode-scanner-${reactId}`;
    const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [paused, setPaused] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [torchSupported, setTorchSupported] = useState(false);
    const [libReady, setLibReady] = useState(false);
    const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
    const libRef = useRef<typeof import('html5-qrcode') | null>(null);

    const stopScanner = useCallback(async () => {
        if (scannerRef.current?.isScanning) {
            try { await scannerRef.current.stop(); } catch { /* stopped */ }
        }
        setIsRunning(false);
        setTorchOn(false);
    }, []);

    const startScanner = useCallback(async () => {
        if (!scannerRef.current || !active || !libRef.current) return;
        setError(null);
        setPaused(false);
        lastScanRef.current = { code: '', at: 0 };

        const qrbox = Math.min(window.innerWidth * 0.75, 300);
        try {
            await scannerRef.current.start(
                { facingMode: 'environment' },
                { fps: 12, qrbox: { width: qrbox, height: Math.round(qrbox * 0.45) } },
                (text) => {
                    const now = Date.now();
                    const trimmed = text.trim();
                    if (!trimmed) return;
                    if (lastScanRef.current.code === trimmed && now - lastScanRef.current.at < 1500) return;
                    lastScanRef.current = { code: trimmed, at: now };
                    hapticSuccess();
                    if (scanSound) playScanBeep();
                    onScan(trimmed);
                    if (pauseOnScan) {
                        stopScanner().then(() => setPaused(true));
                    }
                },
                () => {}
            );
            setIsRunning(true);
            try {
                const caps = scannerRef.current.getRunningTrackCameraCapabilities();
                setTorchSupported(!!caps?.torchFeature()?.isSupported());
            } catch {
                setTorchSupported(false);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Camera access denied');
            setIsRunning(false);
        }
    }, [active, onScan, pauseOnScan, scanSound, stopScanner]);

    // Lazy-load html5-qrcode
    useEffect(() => {
        let cancelled = false;
        import('html5-qrcode').then(lib => {
            if (cancelled) return;
            libRef.current = lib;
            const scanner = new lib.Html5Qrcode(containerId, {
                formatsToSupport: [
                    lib.Html5QrcodeSupportedFormats.CODE_128,
                    lib.Html5QrcodeSupportedFormats.CODE_39,
                    lib.Html5QrcodeSupportedFormats.EAN_13,
                    lib.Html5QrcodeSupportedFormats.EAN_8,
                    lib.Html5QrcodeSupportedFormats.UPC_A,
                    lib.Html5QrcodeSupportedFormats.UPC_E,
                    lib.Html5QrcodeSupportedFormats.QR_CODE,
                ],
                verbose: false,
            });
            scannerRef.current = scanner;
            setLibReady(true);
        });
        return () => { cancelled = true; };
    }, [containerId]);

    useEffect(() => {
        if (!libReady || !active) {
            if (!active) stopScanner();
            return;
        }
        startScanner();
        return () => {
            if (scannerRef.current?.isScanning) {
                scannerRef.current.stop().catch(() => {});
            }
        };
    }, [libReady, active, startScanner, stopScanner]);

    const toggleTorch = async () => {
        if (!scannerRef.current || !torchSupported) return;
        try {
            const next = !torchOn;
            await scannerRef.current.applyVideoConstraints({
                advanced: [{ torch: next } as MediaTrackConstraintSet],
            });
            setTorchOn(next);
        } catch { /* unavailable */ }
    };

    const shellClass = fullscreen
        ? 'fixed inset-0 z-50 rounded-none'
        : 'rounded-xl';

    return (
        <div className={`relative bg-black overflow-hidden ${shellClass} ${className}`}>
            {onClose && (
                <button onClick={onClose} className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/50 text-white" aria-label="Close">
                    <IconX className="h-5 w-5" />
                </button>
            )}
            {torchSupported && isRunning && (
                <button
                    onClick={toggleTorch}
                    className={`absolute top-3 left-3 z-10 p-2 rounded-full text-xs font-bold ${torchOn ? 'bg-yellow-400 text-black' : 'bg-black/50 text-white'}`}
                >
                    🔦
                </button>
            )}
            <div id={containerId} className={`w-full ${fullscreen ? 'h-full min-h-[100dvh]' : 'min-h-[260px]'}`} />
            {isRunning && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="border-2 border-brand-red/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" style={{ width: '75%', height: '7rem' }} />
                </div>
            )}
            {!libReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 min-h-[260px]">
                    <p className="text-white text-sm animate-pulse">Loading scanner...</p>
                </div>
            )}
            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-4 text-center min-h-[260px]">
                    <p className="text-white text-sm mb-2">{error}</p>
                    <p className="text-white/70 text-xs mb-4">Allow camera access or use manual entry.</p>
                    <button onClick={startScanner} className="btn-primary btn-sm">Retry</button>
                </div>
            )}
            {libReady && !isRunning && !error && !paused && active && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 min-h-[260px]">
                    <p className="text-white text-sm animate-pulse">Starting camera...</p>
                </div>
            )}
            {paused && (
                <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex justify-center">
                    <button onClick={startScanner} className="btn-primary rounded-full px-5 py-2.5 text-sm shadow-lg">
                        Scan Again
                    </button>
                </div>
            )}
        </div>
    );
};
