
import React from 'react';
import { Modal } from './Modal.tsx';
import { IconAlertTriangle } from './icons.tsx';

interface ConfirmationModalProps {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'default';
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger',
    onConfirm,
    onCancel,
}) => {
    return (
        <Modal onClose={onCancel} size="sm" ariaLabel={title}>
            <div className="p-6 text-center">
                <div className={`mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center ${variant === 'danger' ? 'bg-status-red-bg text-status-red-text' : 'bg-status-yellow-bg text-status-yellow-text'}`}>
                    <IconAlertTriangle className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-text-primary mb-2">{title}</h2>
                <p className="text-text-secondary text-sm leading-relaxed mb-6">{message}</p>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="btn-secondary flex-1">
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
