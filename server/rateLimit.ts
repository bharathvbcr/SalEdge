import { NextFunction, Request, Response } from 'express';

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

interface RateLimitStore {
    [key: string]: RateLimitEntry;
}

export interface RateLimitOptions {
    /** Sliding window length in milliseconds. */
    windowMs: number;
    /** Maximum requests allowed per window per key. */
    max: number;
    /** Builds the bucket key; defaults to client IP. */
    keyExtractor?: (req: Request) => string;
}

const stores = new Map<string, RateLimitStore>();
const cleanupTimers = new Map<string, NodeJS.Timeout>();

function getStore(windowMs: number): RateLimitStore {
    let store = stores.get(String(windowMs));
    if (!store) {
        store = {};
        stores.set(String(windowMs), store);
        const timer = setInterval(() => {
            const now = Date.now();
            for (const key of Object.keys(store)) {
                if (store[key].resetAt <= now) delete store[key];
            }
        }, Math.min(windowMs, 60_000));
        timer.unref();
        cleanupTimers.set(String(windowMs), timer);
    }
    return store;
}

/**
 * Minimal fixed-window rate limiter (no external dependency).
 * Emits 429 with a Retry-After header once `max` requests are exceeded.
 */
export function rateLimit(options: RateLimitOptions) {
    const { windowMs, max, keyExtractor } = options;

    return (req: Request, res: Response, next: NextFunction): void => {
        const key = `${keyExtractor ? keyExtractor(req) : req.ip ?? 'unknown'}`;
        const store = getStore(windowMs);
        const now = Date.now();
        const entry = store[key];

        if (!entry || entry.resetAt <= now) {
            store[key] = { count: 1, resetAt: now + windowMs };
            next();
            return;
        }

        if (entry.count >= max) {
            const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
            res.setHeader('Retry-After', retryAfterSec);
            res.status(429).json({ error: 'Too many requests. Please try again later.' });
            return;
        }

        entry.count += 1;
        next();
    };
}
