
import React from 'react';

interface KpiCardProps {
    title: string;
    value: string;
    change?: string;
    icon: React.ReactElement<{ className?: string }>;
    alert?: boolean;
}

export const KpiCard: React.FC<KpiCardProps> = ({ title, value, change, icon, alert = false }) => {
    const isPositive = change && change.startsWith('+');

    const alertClasses = 'bg-status-red-bg/60 text-status-red-text border-status-red-text/25';
    const normalClasses = 'bg-bg-secondary text-text-primary border-border-color hover:border-border-color/80';

    return (
        <div className={`p-5 rounded-xl border transition-all duration-200 ${alert ? alertClasses : normalClasses}`}>
            <div className="flex justify-between items-start gap-3">
                <p className={`text-sm font-medium leading-snug ${alert ? 'text-status-red-text' : 'text-text-muted'}`}>{title}</p>
                <div className={`p-2 rounded-lg flex-shrink-0 ${alert ? 'bg-status-red-bg text-brand-red' : 'bg-bg-tertiary text-text-muted'}`}>
                    {React.cloneElement(icon, { className: 'h-5 w-5' })}
                </div>
            </div>
            <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 mt-3">
                <p className="text-2xl md:text-3xl font-bold tracking-tight">{value}</p>
                {change && (
                    <span className={`text-sm font-semibold ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                        {change}
                    </span>
                )}
            </div>
        </div>
    );
};
