
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { ServiceJob, ServiceJobStatus } from '../types.ts';
import { KanbanBoard } from './KanbanBoard.tsx';
import { AddServiceJobModal } from './AddServiceJobModal.tsx';
import { IconPlus } from './icons.tsx';
import { SetChargeModal } from './SetChargeModal.tsx';
import { PrintReceiptModal } from './PrintReceiptModal.tsx';
import { ServiceJobDetailModal } from './ServiceJobDetailModal.tsx';
import { PageHeader } from './PageHeader.tsx';
import { ConfirmationModal } from './ConfirmationModal.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { SearchInput } from './SearchInput.tsx';
import { consumeOpenServiceJobRequest } from '../utils/pageActions.ts';
import { usePageIntent } from '../hooks/usePageIntent.ts';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.ts';

export const ChargingServicePage: React.FC = () => {
    const { serviceJobs, addServiceJob, updateServiceJob } = useAppData();
    const { addToast } = useToast();
    const [isAddModalOpen, setAddModalOpen] = useState(false);
    const [jobSearch, setJobSearch] = useState('');
    const [jobToSetCharge, setJobToSetCharge] = useState<ServiceJob | null>(null);
    const [jobToPrint, setJobToPrint] = useState<ServiceJob | null>(null);
    const [jobToView, setJobToView] = useState<ServiceJob | null>(null);
    const [loanerConfirmJob, setLoanerConfirmJob] = useState<ServiceJob | null>(null);

    const applyServiceJobIntent = useCallback(() => {
        if (consumeOpenServiceJobRequest()) {
            setAddModalOpen(true);
        }
    }, []);

    usePageIntent(applyServiceJobIntent);

    const openNewJob = useCallback(() => setAddModalOpen(true), []);

    useKeyboardShortcuts(useMemo(() => [
        { key: 'n', handler: openNewJob, enabled: !isAddModalOpen && !jobToSetCharge && !jobToView },
    ], [isAddModalOpen, jobToSetCharge, jobToView, openNewJob]));

    const pendingCount = useMemo(() =>
        serviceJobs.filter(j => j.status !== ServiceJobStatus.DELIVERED).length,
        [serviceJobs]
    );

    const filteredJobs = useMemo(() => {
        if (!jobSearch.trim()) return serviceJobs;
        const q = jobSearch.toLowerCase();
        return serviceJobs.filter(j =>
            j.customerName.toLowerCase().includes(q) ||
            j.customerPhone.includes(q) ||
            j.id.toLowerCase().includes(q) ||
            j.vehicleDetails.toLowerCase().includes(q) ||
            j.issueDescription.toLowerCase().includes(q)
        );
    }, [serviceJobs, jobSearch]);

    const handleUpdateStatus = (jobId: string, newStatus: ServiceJobStatus) => {
        const job = serviceJobs.find(j => j.id === jobId);
        if (job) {
            if (newStatus === ServiceJobStatus.COMPLETED && !job.chargeAmount) {
                setJobToSetCharge(job); // Prompt for charge before marking as complete
            } else {
                updateServiceJob({ ...job, status: newStatus });
            }
        }
    };

    const handleSetChargeAndUpdate = (updatedJob: ServiceJob) => {
        updateServiceJob({ ...updatedJob, status: ServiceJobStatus.COMPLETED });
        setJobToSetCharge(null);
    };

    const handleDeliver = (job: ServiceJob) => {
        if (job.chargeAmount === undefined || job.chargeAmount === null) {
            addToast('Please set a charge amount before delivering.', 'warning');
            setJobToSetCharge(job);
            return;
        }

        if (job.loanerItemDetails && job.loanerStatus !== 'Returned') {
            setLoanerConfirmJob(job);
            return;
        }

        updateServiceJob({ ...job, status: ServiceJobStatus.DELIVERED });
        setJobToPrint(job);
    };


    return (
        <div className="page-shell flex-1 h-full">
            <PageHeader title="Charging & Services" subtitle={`Manage battery charging and service jobs${pendingCount > 0 ? ` · ${pendingCount} active` : ''}`}>
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <SearchInput
                        value={jobSearch}
                        onChange={setJobSearch}
                        placeholder="Search customer, phone, job ID..."
                        className="md:w-64"
                    />
                    <button onClick={openNewJob} className="btn-primary flex-shrink-0">
                        <IconPlus className="h-4 w-4" /> New Job
                    </button>
                </div>
            </PageHeader>
            <div className="flex-1 overflow-x-auto">
                 <KanbanBoard
                    jobs={filteredJobs}
                    onStatusChange={handleUpdateStatus}
                    onSetCharge={setJobToSetCharge}
                    onDeliver={handleDeliver}
                    onViewDetails={setJobToView}
                />
            </div>
           
            {isAddModalOpen && <AddServiceJobModal onClose={() => setAddModalOpen(false)} onAdd={addServiceJob} />}
            {jobToSetCharge && <SetChargeModal job={jobToSetCharge} onClose={() => setJobToSetCharge(null)} onUpdate={handleSetChargeAndUpdate} />}
            {jobToPrint && <PrintReceiptModal job={jobToPrint} onClose={() => setJobToPrint(null)} />}
            {jobToView && <ServiceJobDetailModal job={jobToView} onClose={() => setJobToView(null)} onUpdate={updateServiceJob} />}
            {loanerConfirmJob && (
                <ConfirmationModal
                    title="Standby Battery Return"
                    message={`Customer has a standby battery: "${loanerConfirmJob.loanerItemDetails}". Has it been returned? Mark as returned and deliver?`}
                    variant="default"
                    confirmText="Mark Returned & Deliver"
                    onConfirm={() => {
                        updateServiceJob({ ...loanerConfirmJob, status: ServiceJobStatus.DELIVERED, loanerStatus: 'Returned' });
                        setJobToPrint(loanerConfirmJob);
                        setLoanerConfirmJob(null);
                    }}
                    onCancel={() => setLoanerConfirmJob(null)}
                />
            )}
        </div>
    );
};
