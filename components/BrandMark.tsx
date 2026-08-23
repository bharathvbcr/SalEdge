import React from 'react';

interface BrandMarkProps {
    /** Tailwind sizing classes. The mark is square. */
    className?: string;
    /**
     * Accessible name. Defaults to empty: the mark is normally paired with the
     * visible "SalEdge" wordmark, which already names it. Pass a label only
     * where the mark stands alone.
     */
    alt?: string;
    /** Glow strength. Use 'lg' where the mark is the focal point of the screen. */
    glow?: 'sm' | 'lg';
}

/**
 * The SalEdge logo mark — the single in-app placement of the brand asset.
 *
 * Source of truth is public/logo.svg; the badge and raster variants used by the
 * browser, PWA and desktop shells are derived from public/icon.svg by
 * `npm run icons:generate`.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ className = 'h-9 w-9', alt = '', glow = 'sm' }) => (
    <img
        src="/logo.svg"
        alt={alt}
        aria-hidden={alt ? undefined : true}
        draggable={false}
        className={`${className} flex-shrink-0 object-contain select-none ${
            glow === 'lg'
                ? 'filter drop-shadow-[0_4px_14px_rgba(211,47,47,0.32)]'
                : 'filter drop-shadow-[0_2px_6px_rgba(211,47,47,0.22)]'
        }`}
    />
);
