import React, { useState } from 'react';
import { useNotifications } from '../context/NotificationContext.tsx';
import { Page } from '../types.ts';
import { IconX, IconBell } from './icons.tsx';

interface NotificationCenterProps {
    onNavigate?: (page: Page) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ onNavigate }) => {
    const { notifications, unreadCount, markAsRead, markAllRead, dismissNotification } = useNotifications();
    const [isOpen, setIsOpen] = useState(false);

    const typeIcon = (type: string) => {
        switch (type) {
            case 'overdue': return '🔴';
            case 'due_reminder': return '🔔';
            case 'low_stock': return '📦';
            default: return 'ℹ️';
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="btn-icon relative"
                title="Notifications"
                aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            >
                <IconBell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-bg-secondary border border-border-color rounded-xl shadow-2xl z-50 animate-slide-up">
                        <div className="flex justify-between items-center p-3 border-b border-border-color sticky top-0 bg-bg-secondary">
                            <h3 className="font-bold text-text-primary text-sm">Notifications</h3>
                            <div className="flex gap-2">
                                {unreadCount > 0 && (
                                    <button onClick={markAllRead} className="btn-link text-xs">Mark all read</button>
                                )}
                                <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-bg-tertiary rounded"><IconX className="h-4 w-4" /></button>
                            </div>
                        </div>
                        {notifications.length === 0 ? (
                            <p className="p-4 text-sm text-text-muted text-center">No notifications</p>
                        ) : (
                            <ul className="divide-y divide-border-color">
                                {notifications.map(n => (
                                    <li
                                        key={n.id}
                                        className={`p-3 text-sm cursor-pointer hover:bg-bg-tertiary ${!n.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                                        onClick={() => {
                                            markAsRead(n.id);
                                            if (n.linkPage && onNavigate) {
                                                onNavigate(n.linkPage);
                                                setIsOpen(false);
                                            }
                                        }}
                                    >
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="flex gap-2">
                                                <span>{typeIcon(n.type)}</span>
                                                <div>
                                                    <p className={`font-medium text-text-primary ${!n.read ? 'font-bold' : ''}`}>{n.title}</p>
                                                    <p className="text-xs text-text-muted mt-0.5">{n.message}</p>
                                                    <p className="text-[10px] text-text-muted mt-1">{new Date(n.date).toLocaleString()}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); dismissNotification(n.id); }}
                                                className="text-text-muted hover:text-red-500 text-xs"
                                            >✕</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
