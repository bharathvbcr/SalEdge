import React, { useEffect, useState } from 'react';
import { api, ApiUser } from '../utils/api.ts';
import { useToast } from '../context/ToastContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';
import { FormField } from './FormField.tsx';
import { LoadingSpinner } from './LoadingSpinner.tsx';

export const UserManagement: React.FC = () => {
    const { user: currentUser } = useAuth();
    const { addToast } = useToast();
    const [users, setUsers] = useState<ApiUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'staff' as 'admin' | 'staff' });
    const [resetUser, setResetUser] = useState<ApiUser | null>(null);
    const [newPassword, setNewPassword] = useState('');

    const loadUsers = async () => {
        try {
            const { users: list } = await api.listUsers();
            setUsers(list);
        } catch {
            addToast('Failed to load users', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadUsers(); }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.createUser(form.username, form.password, form.displayName || form.username, form.role);
            addToast('User created', 'success');
            setForm({ username: '', password: '', displayName: '', role: 'staff' });
            setShowForm(false);
            loadUsers();
        } catch (err) {
            addToast(err instanceof Error ? err.message : 'Failed to create user', 'error');
        }
    };

    const toggleActive = async (u: ApiUser) => {
        try {
            await api.updateUser(u.id, { isActive: !u.isActive });
            addToast(u.isActive ? 'User deactivated' : 'User activated', 'info');
            loadUsers();
        } catch (err) {
            addToast(err instanceof Error ? err.message : 'Update failed', 'error');
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetUser || newPassword.length < 6) {
            addToast('Password must be at least 6 characters', 'error');
            return;
        }
        try {
            await api.updateUser(resetUser.id, { password: newPassword });
            addToast('Password updated', 'success');
            setResetUser(null);
            setNewPassword('');
        } catch (err) {
            addToast(err instanceof Error ? err.message : 'Password update failed', 'error');
        }
    };

    if (loading) return <LoadingSpinner message="Loading users…" size="sm" />;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <p className="text-sm text-text-muted">{users.length} user(s)</p>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="btn-primary btn-sm"
                >
                    {showForm ? 'Cancel' : '+ Add User'}
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-bg-tertiary rounded-lg">
                    <input required placeholder="Username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className="form-input" />
                    <input required type="password" minLength={6} placeholder="Password (min 6)" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="form-input" />
                    <input placeholder="Display name" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} className="form-input" />
                    <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'admin' | 'staff' }))} className="form-input">
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button type="submit" className="md:col-span-2 btn-primary w-full">Create User</button>
                </form>
            )}

            <ul className="space-y-2">
                {users.map(u => (
                    <li key={u.id} className="flex flex-wrap justify-between items-center gap-2 bg-bg-tertiary p-3 rounded-lg text-sm">
                        <div>
                            <p className="font-medium text-text-primary">{u.displayName} <span className="text-text-muted">@{u.username}</span></p>
                            <p className="text-xs text-text-muted capitalize">{u.role}{u.isActive === false ? ' • deactivated' : ''}</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { setResetUser(u); setNewPassword(''); }} className="btn-secondary btn-sm">Reset Password</button>
                            {u.id !== currentUser?.id && (
                                <button
                                    onClick={() => toggleActive(u)}
                                    className={`btn-sm ${u.isActive === false ? 'btn-success' : 'btn-danger'}`}
                                >
                                    {u.isActive === false ? 'Activate' : 'Deactivate'}
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>

            {resetUser && (
                <Modal onClose={() => setResetUser(null)} size="sm" ariaLabel={`Reset password for ${resetUser.username}`}>
                    <ModalHeader title={`Reset Password — ${resetUser.username}`} onClose={() => setResetUser(null)} />
                    <form onSubmit={handleResetPassword} className="p-4 space-y-4">
                        <FormField label="New password (min 6 chars)">
                            <input
                                type="password"
                                minLength={6}
                                required
                                autoFocus
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                className="form-input"
                            />
                        </FormField>
                        <ModalFooter>
                            <div className="flex gap-3 ml-auto w-full">
                                <button type="button" onClick={() => setResetUser(null)} className="btn-secondary flex-1">Cancel</button>
                                <button type="submit" className="btn-primary flex-1">Update Password</button>
                            </div>
                        </ModalFooter>
                    </form>
                </Modal>
            )}
        </div>
    );
};
