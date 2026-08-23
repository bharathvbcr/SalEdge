import React, { useEffect, useRef } from 'react';
import { IconX } from './icons.tsx';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SIZE_CLASSES: Record<ModalSize, string> = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[95vw] max-h-[95vh]',
};

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface ModalProps {
    onClose: () => void;
    children: React.ReactNode;
    size?: ModalSize;
    ariaLabel?: string;
    showClose?: boolean;
    className?: string;
    overlayClassName?: string;
    closeOnBackdrop?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
    onClose,
    children,
    size = 'md',
    ariaLabel,
    showClose = false,
    className = '',
    overlayClassName = '',
    closeOnBackdrop = true,
}) => {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null;

        const panel = panelRef.current;
        if (panel) {
            const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
                .filter((el) => !el.hasAttribute('disabled'));
            (focusables.length > 0 ? focusables[0] : panel).focus();
        }

        return () => {
            if (previouslyFocused?.isConnected) {
                previouslyFocused.focus();
            }
        };
    }, []);

    useEffect(() => {
        const handleTab = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            const panel = panelRef.current;
            if (!panel) return;
            const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
                .filter((el) => !el.hasAttribute('disabled'));
            if (focusables.length === 0) {
                e.preventDefault();
                panel.focus();
                return;
            }
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement;
            if (e.shiftKey) {
                if (active === first || active === panel || !panel.contains(active)) {
                    e.preventDefault();
                    last.focus();
                }
            } else if (active === last || !panel.contains(active)) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleTab);
        return () => document.removeEventListener('keydown', handleTab);
    }, []);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    return (
        <div
            className={`modal-overlay ${overlayClassName}`}
            onClick={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                className={`modal-panel ${SIZE_CLASSES[size]} ${className}`}
            >
                {showClose && (
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 btn-icon z-10"
                        aria-label="Close"
                    >
                        <IconX className="h-5 w-5" />
                    </button>
                )}
                {children}
            </div>
        </div>
    );
};

interface ModalHeaderProps {
    title: string;
    onClose?: () => void;
    subtitle?: string;
}

export const ModalHeader: React.FC<ModalHeaderProps & { className?: string }> = ({ title, onClose, subtitle, className = '' }) => (
    <div className={`flex items-start justify-between gap-3 p-4 border-b border-border-color ${className}`}>
        <div>
            <h2 className="text-lg font-bold text-text-primary">{title}</h2>
            {subtitle && <p className="text-sm text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {onClose && (
            <button onClick={onClose} className="btn-icon flex-shrink-0" aria-label="Close">
                <IconX className="h-5 w-5" />
            </button>
        )}
    </div>
);

export const ModalFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`flex flex-wrap justify-between items-center gap-3 p-4 border-t border-border-color bg-bg-tertiary/50 rounded-b-xl ${className}`}>
        {children}
    </div>
);
