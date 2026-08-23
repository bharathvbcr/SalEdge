/**
 * Pure keystroke-buffer for USB/Bluetooth barcode wedges (keyboard-wedge mode).
 *
 * Extracted from the React hook so the timing behaviour is unit-testable.
 * A wedge types characters in rapid bursts terminated by Enter; human typing
 * is slower and rarely ends with an immediate Enter after 3+ chars.
 */
export interface WedgeBufferOptions {
    /** Max ms between characters to count as the same scan burst. */
    gapMs?: number;
    /** Minimum emitted code length. */
    minLength?: number;
    /** Safety valve: wedges never type essays — reset beyond this. */
    maxBufferLength?: number;
}

export const WEDGE_DEFAULTS = {
    // 50ms fragmented scanners configured with per-char delay; 90ms still
    // rejects fast human typing bursts while tolerating "interstrobe delay".
    gapMs: 90,
    minLength: 3,
    maxBufferLength: 64,
} as const;

export class BarcodeWedgeBuffer {
    private buffer = '';
    private lastKeyTime = 0;

    constructor(
        private options: WedgeBufferOptions = {},
        private readonly now: () => number = () => Date.now(),
    ) { }

    reset(): void {
        this.buffer = '';
    }

    /**
     * Feed one keydown key. Returns a scanned code when Enter completes a
     * valid burst; null otherwise.
     */
    handleKey(key: string): string | null {
        const { gapMs, minLength, maxBufferLength } = { ...WEDGE_DEFAULTS, ...this.options };
        const timestamp = this.now();

        if (key === 'Enter') {
            const code = this.buffer.trim();
            this.buffer = '';
            return code.length >= minLength ? code : null;
        }

        if (timestamp - this.lastKeyTime > gapMs) {
            this.buffer = '';
        }
        this.lastKeyTime = timestamp;

        this.buffer += key;
        if (this.buffer.length > maxBufferLength) {
            this.buffer = '';
        }
        return null;
    }

    /** True when Enter should be suppressed (a scan is being completed). */
    willEmitOnEnter(): boolean {
        return this.buffer.trim().length >= ({ ...WEDGE_DEFAULTS, ...this.options }).minLength;
    }
}
