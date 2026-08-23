import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';

/**
 * Blocking gate shown when an account still carries its default/admin-set
 * password (seeded accounts ship with known credentials). The app cannot be
 * used until a real password is chosen.
 */
export const ForcePasswordChange: React.FC = () => {
    const { user, changePassword } = useAuth();
    const { addToast } = useToast();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!currentPassword) { setError('Enter your current password.'); return; }
        if (newPassword.length < 8) { setError('New password must be at least 8 characters.'); return; }
        if (newPassword === currentPassword) { setError('New password must differ from the current one.'); return; }
        if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

        setSaving(true);
        const errorMessage = await changePassword(currentPassword, newPassword);
        setSaving(false);

        if (errorMessage) {
            setError(errorMessage);
        } else {
            addToast('Password updated — welcome!', 'success');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg-primary p-4">
            <form onSubmit={handleSubmit} className="card-section-padded w-full max-w-md space-y-4" noValidate>
                <div>
                    <h1 className="text-xl font-bold text-text-primary">Set a new password</h1>
                    <p className="text-sm text-text-muted mt-1">
                        Hi {user?.displayName || user?.username} — your account is using a default or admin-assigned
                        password. Choose your own before continuing.
                    </p>
                </div>

                <div className="form-group">
                    <label htmlFor="fp-current">Current password</label>
                    <input id="fp-current" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="form-input" autoComplete="current-password" autoFocus />
                </div>
                <div className="form-group">
                    <label htmlFor="fp-new">New password</label>
                    <input id="fp-new" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="form-input" autoComplete="new-password" />
                </div>
                <div className={`form-group ${error ? 'has-error' : ''}`}>
                    <label htmlFor="fp-confirm">Confirm new password</label>
                    <input id="fp-confirm" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="form-input" autoComplete="new-password" />
                    {error && <p className="form-error" role="alert">{error}</p>}
                </div>

                <button type="submit" disabled={saving} className="btn-primary w-full disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save Password & Continue'}
                </button>
            </form>
        </div>
    );
};
