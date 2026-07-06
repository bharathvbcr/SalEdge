



import React from 'react';
import { ServiceJob, ServiceJobStatus } from '../types.ts';

interface ServiceCardProps {
    job: ServiceJob;
    onSetCharge: (job: ServiceJob) => void;
    onDeliver: (job: ServiceJob) => void;
    onViewDetails: (job: ServiceJob) => void;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ job, onSetCharge, onDeliver, onViewDetails }) => {
    const timeSince = (dateString: string) => {
        const date = new Date(dateString);
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        let interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + "d ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + "h ago";
        return "Recent";
    }
    
    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('jobId', job.id);
        e.dataTransfer.effectAllowed = "move";
    };

    const priorityColors = {
        Low: 'bg-status-blue-bg text-status-blue-text border-status-blue-text/20',
        Medium: 'bg-status-yellow-bg text-status-yellow-text border-status-yellow-text/20',
        High: 'bg-status-red-bg text-status-red-text border-status-red-text/20'
    };

    return (
        <div 
            draggable
            onDragStart={handleDragStart}
            className="card p-3 cursor-grab active:cursor-grabbing hover:border-brand-red/40 hover:shadow-md transition-all select-none group bg-bg-tertiary" 
            onClick={() => onViewDetails(job)}
        >
            <div className="flex justify-between items-start mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityColors[job.priority || 'Medium']}`}>
                    {job.priority || 'Medium'}
                </span>
                <p className="text-xs font-mono text-text-muted group-hover:text-text-primary transition-colors">{job.id}</p>
            </div>
            <p className="font-bold text-text-primary text-sm mb-1">{job.customerName}</p>
            <p className="text-xs text-text-secondary mb-2">{job.vehicleDetails || 'N/A'}</p>
            <p className="text-sm text-text-primary mb-3 line-clamp-2 bg-bg-secondary p-2 rounded border border-border-color/50">{job.issueDescription}</p>
            
            {job.warrantyClaim && (
                 <div className="mb-2 p-1.5 bg-orange-50 border border-orange-100 rounded text-xs text-orange-800 font-medium">
                    CLAIM: {job.warrantyClaim.companyName}
                </div>
            )}

            {job.loanerItemDetails && (
                <div className="mb-2 p-1.5 bg-blue-50 border border-blue-100 rounded text-xs">
                    <span className="font-semibold text-blue-800">Standby:</span> <span className="text-blue-700">{job.loanerItemDetails}</span>
                    {job.status === ServiceJobStatus.COMPLETED && (
                        <div className="mt-1 text-red-600 font-bold animate-pulse">Ensure Return!</div>
                    )}
                </div>
            )}

            <div className="flex justify-between items-center text-xs text-text-muted">
                <span>{timeSince(job.receivedDate)}</span>
                {job.assignedTo && <span>To: {job.assignedTo}</span>}
            </div>
            {job.status === ServiceJobStatus.COMPLETED && (
                 <button 
                    onClick={(e) => { e.stopPropagation(); onDeliver(job); }} 
                    className="mt-3 w-full btn-success py-1.5 text-sm font-bold"
                >
                    Mark Delivered & Print
                </button>
            )}
            {job.status !== ServiceJobStatus.COMPLETED && job.status !== ServiceJobStatus.DELIVERED && (
                 <button 
                    onClick={(e) => { e.stopPropagation(); onSetCharge(job); }} 
                    className="mt-3 w-full text-center btn-primary py-1.5 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    Mark Complete
                </button>
            )}
        </div>
    );
};
