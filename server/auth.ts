import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getUserByUsername, getUserById, createUser, countUsers, DbUser } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'bsms-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';
const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION === 'true';

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

export function verifyPassword(user: DbUser, password: string): boolean {
    return bcrypt.compareSync(password, user.password_hash);
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
    if (!user || user.is_active !== 1 || !verifyPassword(user, password)) {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
    }

    const token = signToken(user);
    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            role: user.role,
        },
    });
}

export function meHandler(req: Request, res: Response): void {
    if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }
    res.json({
        user: {
            id: req.user.userId,
            username: req.user.username,
            displayName: req.user.displayName,
            role: req.user.role,
        },
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
        user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            role: user.role,
        },
    });
}
