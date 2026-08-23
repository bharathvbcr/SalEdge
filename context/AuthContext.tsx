import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { UserRole } from '../types.ts';
import { api, ApiUser, clearToken, getToken, setToken, UNAUTHORIZED_EVENT } from '../utils/api.ts';
import { TEST_LOGIN_ENABLED, getAutoLoginAccount } from '../utils/testLogin.ts';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

interface AuthContextType {
    user: ApiUser | null;
    userRole: UserRole | null;
    login: (username: string, password: string) => Promise<boolean>;
    register: (username: string, password: string, displayName?: string) => Promise<boolean>;
    changePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
    allowRegistration: boolean;
    updateActivity: () => void;
    lastActivity: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<ApiUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [allowRegistration, setAllowRegistration] = useState(false);
    const [lastActivity, setLastActivity] = useState<number>(Date.now());

    const logout = useCallback(() => {
        clearToken();
        // Queues/intents live in sessionStorage keyed only by tab — on a shared
        // phone they would leak the previous user's scans into the next session.
        try {
            const stale: string[] = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i);
                if (k && k.startsWith('bsms_')) stale.push(k);
            }
            stale.forEach(k => sessionStorage.removeItem(k));
        } catch { /* storage unavailable */ }
        setUser(null);
    }, []);

    const updateActivity = useCallback(() => {
        setLastActivity(Date.now());
    }, []);

    useEffect(() => {
        const token = getToken();
        if (!token) {
            // Dev/testing-only: skip the login screen when a bypass is requested
            // (?autologin=admin|staff or VITE_AUTO_LOGIN). The TEST_LOGIN_ENABLED
            // guard is a compile-time literal, so this whole block — and the
            // imported testLogin module — is tree-shaken out of production builds.
            if (TEST_LOGIN_ENABLED) {
                const auto = getAutoLoginAccount();
                if (auto) {
                    console.warn(
                        `[test-login] Auto-login bypass active — signing in as "${auto.username}". This must never be enabled in production.`,
                    );
                    login(auto.username, auto.password).finally(() => setIsLoading(false));
                    return;
                }
            }
            setIsLoading(false);
            return;
        }

        api.me()
            .then(({ user: me, allowRegistration: allow }) => {
                setUser(me);
                setAllowRegistration(allow);
            })
            .catch(() => clearToken())
            .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!user) return;

        const checkTimeout = () => {
            if (Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
                logout();
            }
        };

        const interval = setInterval(checkTimeout, 60000);
        return () => clearInterval(interval);
    }, [user, lastActivity, logout]);

    useEffect(() => {
        if (!user) return;

        const handleActivity = () => updateActivity();
        window.addEventListener('click', handleActivity);
        window.addEventListener('keydown', handleActivity);
        window.addEventListener('scroll', handleActivity);

        return () => {
            window.removeEventListener('click', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('scroll', handleActivity);
        };
    }, [user, updateActivity]);

    // The API layer clears the stored token whenever the server rejects it
    // (expired JWT, deactivated account). End the session here so the lock
    // screen appears instead of an app that looks logged in but cannot save.
    useEffect(() => {
        const onUnauthorized = () => {
            setUser(null);
            setLastActivity(Date.now());
        };
        window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
        return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    }, []);

    const login = async (username: string, password: string): Promise<boolean> => {
        try {
            const { token, user: loggedInUser } = await api.login(username, password);
            setToken(token);
            // Verify the session before committing auth state — otherwise a
            // failed verification leaves the app mounted behind an error.
            const me = await api.me();
            setUser(loggedInUser);
            setLastActivity(Date.now());
            setAllowRegistration(me.allowRegistration);
            return true;
        } catch {
            clearToken();
            return false;
        }
    };

    const register = async (username: string, password: string, displayName?: string): Promise<boolean> => {
        try {
            const { token, user: newUser } = await api.register(username, password, displayName);
            setToken(token);
            setUser(newUser);
            setLastActivity(Date.now());
            setAllowRegistration(false);
            return true;
        } catch {
            return false;
        }
    };

    /** Returns an error message on failure, null on success. */
    const changePassword = async (currentPassword: string, newPassword: string): Promise<string | null> => {
        try {
            const { user: updatedUser } = await api.changePassword(currentPassword, newPassword);
            setUser(updatedUser);
            return null;
        } catch (err) {
            return err instanceof Error ? err.message : 'Password change failed';
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            userRole: user?.role ?? null,
            login,
            register,
            changePassword,
            logout,
            isAuthenticated: user !== null,
            isLoading,
            allowRegistration,
            updateActivity,
            lastActivity,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
