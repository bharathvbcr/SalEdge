import React, { useState } from 'react';
import { ServiceJob } from '../types.ts';
import { useConfig } from '../context/ConfigContext.tsx';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';

interface SetChargeModalProps {
    job: ServiceJob;
    onClose: () => void;
    onUpdate: (updatedJob: ServiceJob) => void;
}

export const SetChargeModal: React.FC<SetChargeModalProps> = ({ job, onClose, onUpdate }) => {
    const { defaultFirm } = useConfig();
    const [charge, setCharge] = useState(job.chargeAmount || '');
    const [notes, setNotes] = useState(job.notes || '');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onUpdate({
            ...job,
            chargeAmount: Number(charge),
            notes: notes,
        });
        onClose();
    };

    return (
        <Modal onClose={onClose} size="md" ariaLabel="Set Service Charge">
            <ModalHeader title={`Set Service Charge — ${job.id}`} onClose={onClose} />
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="form-group">
                    <label htmlFor="chargeAmount">Charge Amount ({defaultFirm?.financials.currencySymbol || '₹'})</label>
                    <input
                        id="chargeAmount"
                        type="number"
                        value={charge}
                        onChange={e => setCharge(e.target.value)}
                        className="form-input"
                        placeholder="e.g., 500"
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="notes">Notes (Optional)</label>
                    <textarea
                        id="notes"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        rows={3}
                        placeholder="e.g., Battery fluid topped up."
                        className="form-input"
                    />
                </div>
                <ModalFooter>
                    <div className="flex gap-3 ml-auto">
                        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                        <button type="submit" className="btn-primary">Save</button>
                    </div>
                </ModalFooter>
            </form>
        </Modal>
    );
};
