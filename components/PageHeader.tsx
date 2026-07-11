import React from 'react';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, children }) => (
    <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
        <div className="min-w-0 hidden md:block shrink-0">
            <h2 className="page-title">{title}</h2>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {children && (
            <div className="flex flex-col gap-3 w-full lg:w-auto lg:ml-auto lg:min-w-0 lg:max-w-3xl">
                {children}
            </div>
        )}
    </div>
);
