import React, { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 5 * 60 * 1000;

export const SessionTimeoutWarning: React.FC = () => {
    const { user, lastActivity } = useAuth();
    const { addToast } = useToast();
    const warnedRef = useRef(false);

    useEffect(() => {
        if (!user) {
            warnedRef.current = false;
            return;
        }

        const check = () => {
            const remaining = SESSION_TIMEOUT_MS - (Date.now() - lastActivity);
            if (remaining <= WARNING_BEFORE_MS && remaining > 0 && !warnedRef.current) {
                warnedRef.current = true;
                addToast('Session expires in 5 minutes. Tap or type anywhere to stay logged in.', 'warning');
            }
            if (remaining > WARNING_BEFORE_MS) {
                warnedRef.current = false;
            }
        };

        check();
        const interval = setInterval(check, 30000);
        return () => clearInterval(interval);
    }, [user, lastActivity, addToast]);

    return null;
};
