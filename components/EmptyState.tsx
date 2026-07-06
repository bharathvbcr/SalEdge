import React from 'react';
import { IconPlus } from './icons.tsx';

interface EmptyStateProps {
    icon: React.ReactElement<{ className?: string }>;
    title: string;
    message: string;
    action?: {
        label: string;
        onClick: () => void;
    };
    compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, message, action, compact = false }) => {
    return (
        <div className={`empty-state-box text-center animate-slide-up ${compact ? 'p-6' : 'p-10'}`}>
            <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-red/10 text-brand-red mb-4">
                {React.cloneElement(icon, { className: 'h-7 w-7' })}
            </div>
            <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
            <p className="mt-2 text-sm text-text-muted max-w-sm mx-auto leading-relaxed">{message}</p>
            {action && (
                <div className="mt-6">
                    <button
                        type="button"
                        onClick={action.onClick}
                        className="btn-primary mx-auto"
                    >
                        <IconPlus className="h-4 w-4" />
                        {action.label}
                    </button>
                </div>
            )}
        </div>
    );
};
