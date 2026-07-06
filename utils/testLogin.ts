/**
 * Dev/testing-only login helpers.
 *
 * SECURITY: everything here is gated behind `TEST_LOGIN_ENABLED`, which is the
 * compile-time constant `__TEST_LOGIN__` injected by Vite `define`:
 *   - true during `vite dev` and `npm run build:test`, and
 *   - false in a plain production `npm run build`.
 * When false, every guard folds to `if (false)`, so esbuild dead-code-eliminates
 * the call sites and tree-shakes this ENTIRE module — seeded credentials, the
 * quick-fill buttons, and the auto-login bypass — out of the production bundle.
 * Enable it for a build only via `npm run build:test` (never `npm run build`).
 */

export interface TestAccount {
    label: string;
    username: string;
    password: string;
    role: 'admin' | 'staff';
}

export const TEST_LOGIN_ENABLED: boolean = __TEST_LOGIN__;

/** Seeded default accounts (see server/db.ts -> seedUsersIfEmpty). */
export const TEST_ACCOUNTS: TestAccount[] = [
    { label: 'Admin', username: 'admin', password: 'admin123', role: 'admin' },
    { label: 'Staff', username: 'staff', password: 'staff123', role: 'staff' },
];

/**
 * Resolves which seeded account to auto-login as, skipping the login screen.
 * Source, in priority order (only when TEST_LOGIN_ENABLED):
 *   1. URL query param `?autologin=admin` / `?autologin=staff` (no rebuild needed)
 *   2. build-time env `VITE_AUTO_LOGIN=admin|staff`
 * Returns null to show the normal login screen.
 */
export function getAutoLoginAccount(): TestAccount | null {
    if (!TEST_LOGIN_ENABLED) return null;

    let key: string | null = null;
    try {
        key = new URLSearchParams(window.location.search).get('autologin');
    } catch {
        key = null;
    }

    if (!key) {
        const envKey = import.meta.env.VITE_AUTO_LOGIN;
        key = typeof envKey === 'string' && envKey.trim() ? envKey.trim() : null;
    }

    if (!key) return null;

    const lower = key.toLowerCase();
    return TEST_ACCOUNTS.find(
        (a) => a.role === lower || a.username.toLowerCase() === lower,
    ) ?? null;
}
