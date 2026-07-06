
import React, { useState } from 'react';
import { ServiceJob, ServiceJobStatus } from '../types.ts';
import { ServiceCard } from './ServiceCard.tsx';

interface KanbanBoardProps {
    jobs: ServiceJob[];
    onStatusChange: (jobId: string, newStatus: ServiceJobStatus) => void;
    onSetCharge: (job: ServiceJob) => void;
    onDeliver: (job: ServiceJob) => void;
    onViewDetails: (job: ServiceJob) => void;
}

const KanbanColumn: React.FC<{
    title: string;
    status: ServiceJobStatus;
    jobs: ServiceJob[];
    onSetCharge: (job: ServiceJob) => void;
    onDeliver: (job: ServiceJob) => void;
    onViewDetails: (job: ServiceJob) => void;
    onDrop: (e: React.DragEvent, status: ServiceJobStatus) => void;
}> = ({ title, status, jobs, onSetCharge, onDeliver, onViewDetails, onDrop }) => {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setIsDragOver(true);
    };

    const handleDragLeave = () => setIsDragOver(false);

    const handleDrop = (e: React.DragEvent) => {
        setIsDragOver(false);
        onDrop(e, status);
    };

    return (
        <div 
            className={`kanban-column ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <h3 className="font-bold text-text-primary mb-3 px-1 flex justify-between items-center">
                <span>{title}</span>
                <span className="bg-bg-tertiary text-xs py-1 px-2.5 rounded-full font-semibold text-text-muted">{jobs.length}</span>
            </h3>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[120px]">
                {jobs.length > 0 ? jobs.map(job => (
                    <ServiceCard 
                        key={job.id} 
                        job={job} 
                        onSetCharge={onSetCharge}
                        onDeliver={onDeliver}
                        onViewDetails={onViewDetails}
                    />
                )) : (
                    <div className="flex items-center justify-center h-24 border-2 border-dashed border-border-color rounded-lg opacity-60">
                        <p className="text-sm text-text-muted">Drop items here</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ jobs, onStatusChange, onSetCharge, onDeliver, onViewDetails }) => {
    
    const handleDrop = (e: React.DragEvent, status: ServiceJobStatus) => {
        const jobId = e.dataTransfer.getData('jobId');
        if (jobId) {
            onStatusChange(jobId, status);
        }
    };

    const columns: { title: string; status: ServiceJobStatus }[] = [
        { title: 'Pending', status: ServiceJobStatus.PENDING },
        { title: 'In Progress', status: ServiceJobStatus.IN_PROGRESS },
        { title: 'Completed', status: ServiceJobStatus.COMPLETED },
        { title: 'Delivered', status: ServiceJobStatus.DELIVERED },
    ];

    return (
        <div className="flex gap-4 h-full pb-4 overflow-x-auto">
            {columns.map(col => (
                <KanbanColumn
                    key={col.status}
                    title={col.title}
                    status={col.status}
                    jobs={jobs.filter(j => j.status === col.status)}
                    onSetCharge={onSetCharge}
                    onDeliver={onDeliver}
                    onViewDetails={onViewDetails}
                    onDrop={handleDrop}
                />
            ))}
        </div>
    );
};
