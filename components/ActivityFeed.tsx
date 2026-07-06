
import React, { useMemo } from 'react';
import { Transaction, ServiceJob } from '../types.ts';

interface ActivityFeedProps {
    transactions: Transaction[];
    serviceJobs: ServiceJob[];
}

interface ActivityItem {
    id: string;
    type: 'sale' | 'service';
    date: string;
    description: React.ReactNode;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ transactions, serviceJobs }) => {
    
    const combinedFeed = useMemo(() => {
        const saleActivities: ActivityItem[] = transactions.map(t => ({
            id: t.id,
            type: 'sale',
            date: t.date,
            description: (
                <p>
                    New sale to <span className="font-semibold text-text-primary">{t.customerName}</span>
                    {t.saleCategory && (
                        <span className="ml-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 text-[10px] rounded-full">{t.saleCategory}</span>
                    )}
                    {' '}for <span className="font-semibold text-green-500">₹{t.total.toFixed(2)}</span>.
                </p>
            )
        }));

        const serviceActivities: ActivityItem[] = serviceJobs.map(j => ({
            id: j.id,
            type: 'service',
            date: j.receivedDate,
            description: (
                <p>
                    New service job for <span className="font-semibold text-text-primary">{j.customerName}</span> (<span className="italic">{j.issueDescription}</span>).
                </p>
            )
        }));

        return [...saleActivities, ...serviceActivities]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10); // Limit to the 10 most recent activities
    }, [transactions, serviceJobs]);
    
    const timeSince = (dateString: string) => {
        const date = new Date(dateString);
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        let interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + "d ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + "h ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + "m ago";
        return "Just now";
    }

    return (
        <div className="card-section p-4 md:p-6 h-full">
            <h3 className="text-lg font-bold text-text-primary mb-4">Recent Activity</h3>
            <ul className="space-y-4">
                {combinedFeed.map(item => (
                    <li key={item.id} className="flex items-start gap-3">
                        <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${item.type === 'sale' ? 'bg-green-500/20 text-green-500' : 'bg-blue-500/20 text-blue-500'}`}>
                            {item.type === 'sale' ? 
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg> :
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            }
                        </div>
                        <div className="flex-1 text-sm text-text-secondary">
                            {item.description}
                            <p className="text-xs text-text-muted mt-0.5">{timeSince(item.date)}</p>
                        </div>
                    </li>
                ))}
                {combinedFeed.length === 0 && (
                    <li className="text-center py-4 text-text-muted">No recent activity.</li>
                )}
            </ul>
        </div>
    );
};
