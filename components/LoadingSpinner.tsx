import React from 'react';
import { BrandMark } from './BrandMark.tsx';

interface LoadingSpinnerProps {
    message?: string;
    size?: 'sm' | 'md' | 'lg';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message, size = 'md' }) => {
    const sizeClass = size === 'sm' ? 'w-5 h-5 border-2' : size === 'lg' ? 'w-10 h-10 border-4' : 'w-8 h-8 border-[3px]';

    return (
        <div className="flex flex-col items-center justify-center gap-3 animate-fade-in">
            <div
                className={`${sizeClass} border-border-color border-t-brand-red rounded-full animate-spin-slow`}
                role="status"
                aria-label="Loading"
            />
            {message && (
                <p className="text-sm text-text-muted">{message}</p>
            )}
        </div>
    );
};

export const LoadingScreen: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => (
    <div className="flex h-screen flex-col items-center justify-center bg-bg-primary gap-6">
        <BrandMark className="h-16 w-16" alt="SalEdge" glow="lg" />
        <LoadingSpinner message={message} size="lg" />
    </div>
);

export const PageLoadingFallback: React.FC = () => (
    <PageShellSkeleton />
);

interface TableSkeletonProps {
    rows?: number;
    cols?: number;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({ rows = 5, cols = 6 }) => (
    <div className="table-wrap rounded-lg border border-border-color overflow-hidden">
        <table className="data-table">
            <thead>
                <tr>
                    {Array.from({ length: cols }).map((_, i) => (
                        <th key={i}><div className="skeleton h-3 w-16" /></th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {Array.from({ length: rows }).map((_, row) => (
                    <tr key={row}>
                        {Array.from({ length: cols }).map((_, col) => (
                            <td key={col}><div className={`skeleton h-4 ${col === 0 ? 'w-28' : 'w-16 ml-auto'}`} /></td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

export const PageShellSkeleton: React.FC = () => (
    <div className="page-shell animate-fade-in" aria-busy="true" aria-label="Loading page">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-2">
                <div className="skeleton h-7 w-40" />
                <div className="skeleton h-4 w-56" />
            </div>
            <div className="skeleton h-10 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-20 rounded-xl" />
            ))}
        </div>
        <div className="card-section p-4 space-y-4">
            <div className="skeleton h-10 w-full max-w-sm rounded-lg" />
            <TableSkeleton rows={6} cols={5} />
        </div>
    </div>
);
