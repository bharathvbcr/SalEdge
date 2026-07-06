
import React, { useEffect } from 'react';
import { useToast, ToastMessage } from '../context/ToastContext.tsx';
import { IconX } from './icons.tsx';

const Toast: React.FC<{ toast: ToastMessage; onRemove: (id: number) => void }> = ({ toast, onRemove }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onRemove(toast.id);
        }, 5000); // Auto-dismiss after 5 seconds
        return () => clearTimeout(timer);
    }, [toast, onRemove]);

    const typeClasses = {
        success: 'bg-status-green-bg border-status-green-text text-status-green-text',
        error: 'bg-status-red-bg border-status-red-text text-status-red-text',
        info: 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/50 dark:border-blue-500 dark:text-blue-300',
        warning: 'bg-status-yellow-bg border-status-yellow-text text-status-yellow-text',
    };

    return (
        <div className={`flex items-center justify-between w-full max-w-sm p-4 mb-3 rounded-xl shadow-lg border-l-4 animate-slide-in ${typeClasses[toast.type]} backdrop-blur-sm`}>
            <div className="text-sm font-medium pr-2">{toast.message}</div>
            <button
                onClick={() => onRemove(toast.id)}
                className="flex-shrink-0 btn-icon"
                aria-label="Dismiss"
            >
                <IconX className="h-4 w-4" />
            </button>
        </div>
    );
};

export const ToastContainer: React.FC = () => {
    const { toasts, removeToast } = useToast();

    return (
        <div className="fixed top-[calc(1rem+env(safe-area-inset-top,0px))] right-4 z-[100] flex flex-col items-end pointer-events-none">
            {toasts.map(toast => (
                <div key={toast.id} className="pointer-events-auto">
                    <Toast toast={toast} onRemove={removeToast} />
                </div>
            ))}
        </div>
    );
};
