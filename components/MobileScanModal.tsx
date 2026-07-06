import React from 'react';
import { BarcodeScanner } from './BarcodeScanner.tsx';
import { Modal, ModalHeader } from './Modal.tsx';

interface MobileScanModalProps {
    onScan: (code: string) => void;
    onClose: () => void;
    title?: string;
}

export const MobileScanModal: React.FC<MobileScanModalProps> = ({ onScan, onClose, title = 'Scan Barcode' }) => {
    return (
        <Modal
            onClose={onClose}
            size="full"
            className="max-w-none w-full max-h-none h-[100dvh] rounded-none border-0"
            overlayClassName="!z-[60] !p-0 !items-stretch !justify-stretch"
            closeOnBackdrop={false}
            ariaLabel={title}
        >
            <ModalHeader title={title} onClose={onClose} className="flex-shrink-0" />
            <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
                <BarcodeScanner onScan={onScan} onClose={onClose} className="flex-shrink-0" />
                <p className="text-center text-sm text-text-muted">Point camera at barcode or serial label</p>
            </div>
        </Modal>
    );
};
