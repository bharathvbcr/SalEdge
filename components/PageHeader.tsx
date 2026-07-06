import React from 'react';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, children }) => (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="min-w-0 hidden md:block">
            <h2 className="page-title">{title}</h2>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {children && (
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto sm:ml-auto">
                {children}
            </div>
        )}
    </div>
);
