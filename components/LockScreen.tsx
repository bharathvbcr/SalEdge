import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { TEST_LOGIN_ENABLED, TEST_ACCOUNTS, TestAccount } from '../utils/testLogin.ts';
import { isMobileCompanionContext, stashMobileRedirect } from '../utils/mobileConnect.ts';

export const LockScreen: React.FC = () => {
    const { login, register, allowRegistration } = useAuth();
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const mobileConnect = isMobileCompanionContext();

    useEffect(() => {
        if (mobileConnect) stashMobileRedirect('Mobile');
    }, [mobileConnect]);

    const canRegister = allowRegistration;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        const success = mode === 'login'
            ? await login(username.trim(), password)
            : await register(username.trim(), password, displayName.trim() || undefined);

        setIsSubmitting(false);

        if (!success) {
            setError(mode === 'login' ? 'Invalid username or password' : 'Could not create account');
            setPassword('');
        }
    };

    // Dev/testing-only: fill the seeded credentials and sign in with one click.
    const quickLogin = async (account: TestAccount) => {
        setError('');
        setUsername(account.username);
        setPassword(account.password);
        setIsSubmitting(true);
        const success = await login(account.username, account.password);
        setIsSubmitting(false);
        if (!success) {
            setError('Invalid username or password');
            setPassword('');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] bg-bg-primary">
            {/* Subtle background pattern */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-brand-red/5 blur-3xl" />
                <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-brand-red/8 blur-3xl" />
            </div>

            <div className="relative bg-bg-secondary p-8 rounded-2xl shadow-2xl w-full max-w-md border border-border-color animate-slide-up">
                <div className="flex justify-center mb-6">
                    <img src="/logo.svg" alt="Battery Shop Logo" className="h-20 w-20 object-contain filter drop-shadow-[0_4px_10px_rgba(6,182,212,0.25)] dark:drop-shadow-[0_4px_16px_rgba(6,182,212,0.4)]" />
                </div>
                <h1 className="text-2xl font-bold text-text-primary mb-1 text-center tracking-tight">
                    {mobileConnect ? 'Mobile Companion' : 'Battery Shop'}
                </h1>
                <p className="text-text-muted mb-8 text-center text-sm">
                    {mobileConnect
                        ? 'Sign in to start scanning and recording sales'
                        : mode === 'login' ? 'Sign in to manage your shop' : 'Create the first admin account'}
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {mode === 'register' && (
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1.5">Display Name</label>
                            <input
                                type="text"
                                placeholder="Your name"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="form-input"
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1.5">Username</label>
                        <input
                            type="text"
                            placeholder="Enter username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="form-input"
                            autoFocus
                            required
                            autoComplete="username"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1.5">Password</label>
                        <input
                            type="password"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="form-input"
                            minLength={mode === 'register' ? 6 : undefined}
                            required
                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        />
                    </div>
                    {error && (
                        <div className="bg-status-red-bg text-status-red-text text-sm font-medium text-center py-2 px-3 rounded-lg">
                            {error}
                        </div>
                    )}
                    <button
                        type="submit"
                        className="btn-primary w-full mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!username || !password || isSubmitting}
                    >
                        {isSubmitting ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-slow" />
                                Please wait...
                            </span>
                        ) : mode === 'login' ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                {TEST_LOGIN_ENABLED && mode === 'login' && (
                    <div className="mt-6 pt-6 border-t border-dashed border-border-color">
                        <div className="flex items-center justify-center gap-2 mb-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-status-yellow-text bg-status-yellow-bg px-2 py-0.5 rounded">
                                Testing only
                            </span>
                            <span className="text-xs text-text-muted">Quick sign-in</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {TEST_ACCOUNTS.map((account) => (
                                <button
                                    key={account.username}
                                    type="button"
                                    onClick={() => quickLogin(account)}
                                    disabled={isSubmitting}
                                    className="flex flex-col items-center gap-0.5 py-2.5 px-3 rounded-lg border border-border-color bg-bg-tertiary hover:border-brand-red hover:bg-brand-red/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="text-sm font-semibold text-text-primary">{account.label}</span>
                                    <span className="text-[11px] text-text-muted font-mono">
                                        {account.username} / {account.password}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-text-muted text-center mt-3">
                            Disabled in production builds. Add <code className="font-mono">?autologin=admin</code> to skip this screen.
                        </p>
                    </div>
                )}

                <div className="mt-6 pt-6 border-t border-border-color text-center">
                    {canRegister && mode === 'login' && (
                        <button
                            type="button"
                            onClick={() => { setMode('register'); setError(''); }}
                            className="text-sm text-brand-red hover:underline font-medium"
                        >
                            First-time setup? Create admin account
                        </button>
                    )}
                    {mode === 'register' && (
                        <button
                            type="button"
                            onClick={() => { setMode('login'); setError(''); }}
                            className="text-sm text-brand-red hover:underline font-medium"
                        >
                            Already have an account? Sign in
                        </button>
                    )}
                    {mode === 'login' && !canRegister && (
                        <p className="text-xs text-text-muted">Contact your admin for an account.</p>
                    )}
                </div>
            </div>
        </div>
    );
};
