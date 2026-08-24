import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import { getUserByUsername, getUserById, createUser, countUsers, DbUser, updateUserPassword, clearMustChangePasswordFlag } from './db.js';
import { hashPassword, verifyPasswordValue, isLegacyBcryptHash } from './passwords.js';

const DEFAULT_DEV_SECRET = 'bsms-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';
const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION === 'true';

/**
 * Desktop-managed provisioning: the packaged shell opts in via
 * BSMS_DESKTOP_MANAGED=true and points BSMS_DATA_DIR at the user's app-data
 * directory. On first launch we mint a 256-bit random secret and persist it
 * user-read-only; later launches reuse it so sessions survive restarts.
 * Every other context still refuses to start without an explicit secret.
 */
function provisionDesktopJwtSecret(): string {
    const dataDir = process.env.BSMS_DATA_DIR?.trim();
    if (!dataDir) {
        throw new Error(
            'Refusing to start: BSMS_DESKTOP_MANAGED=true requires BSMS_DATA_DIR to provision a JWT secret.'
        );
    }
    const secretFile = `${dataDir}/jwt.secret`;
    try {
        const existing = fs.readFileSync(secretFile, 'utf8').trim();
        if (existing.length >= 32) return existing;
    } catch { /* first launch */ }

    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, `${secret}\n`, { encoding: 'utf8', mode: 0o600 });
    console.log('[auth] Provisioned per-installation JWT secret.');
    return secret;
}

function resolveJwtSecret(): string {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret || secret === DEFAULT_DEV_SECRET) {
        if (process.env.BSMS_DESKTOP_MANAGED === 'true') {
            return provisionDesktopJwtSecret();
        }
        if (process.env.NODE_ENV === 'production' || process.env.BSMS_DEV !== 'true') {
            throw new Error(
                'Refusing to start: JWT_SECRET is not set to a secure value. '
                + 'Generate one (e.g. `openssl rand -hex 32`) and add it to .env.'
            );
        }
        console.warn('[auth] Using development JWT secret — never ship this to production.');
        return DEFAULT_DEV_SECRET;
    }
    return secret;
}

const JWT_SECRET = resolveJwtSecret();

export interface AuthPayload {
    userId: number;
    username: string;
    role: 'admin' | 'staff';
    displayName: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthPayload;
        }
    }
}

export function signToken(user: DbUser): string {
    const payload: AuthPayload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function serializeUser(user: DbUser) {
    return {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        mustChangePassword: user.must_change_password === 1,
    };
}

/**
 * Verify a password; when the stored hash is legacy bcrypt it is transparently
 * upgraded to scrypt so every active account converges on the stronger format.
 */
function verifyAndUpgrade(user: DbUser, password: string): boolean {
    if (!verifyPasswordValue(password, user.password_hash)) return false;
    if (isLegacyBcryptHash(user.password_hash)) {
        try {
            updateUserPassword(user.id, hashPassword(password));
        } catch (err) {
            console.error('[auth] Failed to upgrade password hash:', err instanceof Error ? err.message : err);
        }
    }
    return true;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    const token = header.slice(7);
    try {
        const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
        const user = getUserById(payload.userId);
        if (!user || user.is_active !== 1) {
            res.status(401).json({ error: 'User not found or deactivated' });
            return;
        }
        req.user = {
            userId: user.id,
            username: user.username,
            role: user.role,
            displayName: user.display_name,
        };
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.user || req.user.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
}

export function loginHandler(req: Request, res: Response): void {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username?.trim() || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
    }

    const user = getUserByUsername(username.trim().toLowerCase());
    if (!user || user.is_active !== 1 || !verifyAndUpgrade(user, password)) {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
    }

    const token = signToken(user);
    res.json({
        token,
        mustChangePassword: user.must_change_password === 1,
        user: serializeUser(user),
    });
}

export function meHandler(req: Request, res: Response): void {
    if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }
    const current = getUserById(req.user.userId)!;
    res.json({
        user: serializeUser(current),
        allowRegistration: ALLOW_REGISTRATION || countUsers() === 0,
    });
}

export function registerHandler(req: Request, res: Response): void {
    const userCount = countUsers();
    if (!ALLOW_REGISTRATION && userCount > 0) {
        res.status(403).json({ error: 'Registration is disabled. Ask an admin to create your account.' });
        return;
    }

    const { username, password, displayName, role } = req.body as {
        username?: string;
        password?: string;
        displayName?: string;
        role?: 'admin' | 'staff';
    };

    if (!username?.trim() || !password || password.length < 6) {
        res.status(400).json({ error: 'Username and password (min 6 chars) are required' });
        return;
    }

    if (getUserByUsername(username.trim().toLowerCase())) {
        res.status(409).json({ error: 'Username already exists' });
        return;
    }

    const isFirstUser = userCount === 0;
    const user = createUser(
        username.trim().toLowerCase(),
        password,
        displayName?.trim() || username.trim(),
        isFirstUser ? 'admin' : (role === 'admin' && req.user?.role === 'admin' ? 'admin' : 'staff')
    );

    const token = signToken(user);
    res.status(201).json({
        token,
        mustChangePassword: false,
        user: serializeUser(user),
    });
}

/** Self-service password change: requires the current password. */
export function changePasswordHandler(req: Request, res: Response): void {
    if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }

    const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
    };

    if (!currentPassword || !newPassword || newPassword.length < 8) {
        res.status(400).json({ error: 'Current password and a new password (min 8 chars) are required' });
        return;
    }
    if (newPassword === currentPassword) {
        res.status(400).json({ error: 'New password must differ from the current password' });
        return;
    }

    const user = getUserById(req.user.userId);
    if (!user || !verifyAndUpgrade(user, currentPassword)) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
    }

    updateUserPassword(user.id, hashPassword(newPassword));
    // Password change clears the forced-change flag.
    clearMustChangePasswordFlag(user.id);

    const fresh = getUserById(req.user.userId)!;
    res.json({ ok: true, user: serializeUser(fresh) });
}
