import { Request, Response } from 'express';
import { listUsers, createUser, updateUser, getUserById } from '../db.js';

export function listUsersHandler(_req: Request, res: Response): void {
    const users = listUsers().map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        role: u.role,
        isActive: u.is_active === 1,
        createdAt: u.created_at,
    }));
    res.json({ users });
}

export function createUserHandler(req: Request, res: Response): void {
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

    try {
        const user = createUser(
            username.trim().toLowerCase(),
            password,
            displayName?.trim() || username.trim(),
            role === 'admin' ? 'admin' : 'staff'
        );
        res.status(201).json({
            user: {
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                role: user.role,
                isActive: true,
            },
        });
    } catch {
        res.status(409).json({ error: 'Username already exists' });
    }
}

export function updateUserHandler(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!id) {
        res.status(400).json({ error: 'Invalid user id' });
        return;
    }

    const { displayName, role, isActive, password } = req.body as {
        displayName?: string;
        role?: 'admin' | 'staff';
        isActive?: boolean;
        password?: string;
    };

    if (req.user?.userId === id && isActive === false) {
        res.status(400).json({ error: 'You cannot deactivate your own account' });
        return;
    }

    const user = updateUser(id, { displayName, role, isActive, password });
    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }

    res.json({
        user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            role: user.role,
            isActive: user.is_active === 1,
        },
    });
}
