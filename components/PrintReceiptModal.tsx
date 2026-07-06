import React from 'react';
import { ServiceJob } from '../types.ts';
import { useConfig } from '../context/ConfigContext.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';

interface PrintReceiptModalProps {
    job: ServiceJob;
    onClose: () => void;
}

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({ job, onClose }) => {
    const { defaultFirm } = useConfig();

    const handlePrint = () => {
        window.print();
    };

    return (
        <Modal onClose={onClose} size="sm" ariaLabel="Service Receipt">
            <ModalHeader title="Service Receipt" onClose={onClose} className="print-hidden" />
            <div className="p-6">
                <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold text-gray-800">{defaultFirm?.shopDetails.name}</h3>
                    <p className="text-sm text-gray-500">{defaultFirm?.shopDetails.address}</p>
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-sm mb-4">
                    <p className="font-semibold">Job ID:</p><p className="font-mono">{job.id}</p>
                    <p className="font-semibold">Customer:</p><p>{job.customerName}</p>
                    <p className="font-semibold">Phone:</p><p>{job.customerPhone}</p>
                    <p className="font-semibold">Vehicle:</p><p>{job.vehicleDetails}</p>
                    <p className="font-semibold">Date:</p><p>{new Date().toLocaleDateString()}</p>
                </div>
                <div className="border-t border-b py-2 my-2">
                    <div className="flex justify-between font-semibold">
                        <span>Service Description</span>
                        <span>Amount</span>
                    </div>
                    <div className="flex justify-between mt-1">
                        <span>{job.issueDescription}</span>
                        <span>{defaultFirm?.financials.currencySymbol || '₹'}{job.chargeAmount?.toFixed(2)}</span>
                    </div>
                    {job.notes && <p className="text-xs text-gray-500 mt-1">Notes: {job.notes}</p>}
                </div>
                <div className="flex justify-between font-bold text-lg mt-4">
                    <span>Total</span>
                    <span>{defaultFirm?.financials.currencySymbol || '₹'}{job.chargeAmount?.toFixed(2)}</span>
                </div>
            </div>
            <ModalFooter className="print-hidden">
                <button type="button" onClick={onClose} className="btn-secondary">Close</button>
                <button type="button" onClick={handlePrint} className="btn-primary">Print</button>
            </ModalFooter>
        </Modal>
    );
};
