import React, { createContext, useContext, ReactNode, useEffect, useMemo, useCallback } from 'react';
import useApiStorage from '../hooks/useApiStorage.tsx';
import { AppNotification, Transaction, Purchase } from '../types.ts';
import { useAppData } from './AppDataContext.tsx';
import { useMasterData } from './MasterDataContext.tsx';
import { useConfig } from './ConfigContext.tsx';
import { getUpcomingDues } from '../utils/reports.ts';

interface NotificationContextType {
    notifications: AppNotification[];
    unreadCount: number;
    markAsRead: (id: string) => void;
    markAllRead: () => void;
    dismissNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { transactions, purchases, inventory } = useAppData();
    const { productTypes } = useMasterData();
    const { config } = useConfig();
    const [notifications, setNotifications] = useApiStorage<AppNotification[]>('appNotifications', []);
    const [lastSyncKey, setLastSyncKey] = useApiStorage<string>('notificationSyncKey', '');

    const syncDueReminders = useCallback(() => {
        const upcomingReceivables = getUpcomingDues<Transaction>(
            transactions.filter(t => t.status === 'Due'),
            t => t.total - t.payments.reduce((s, p) => s + p.amount, 0)
        );
        const upcomingPayables = getUpcomingDues<Purchase>(
            purchases.filter(p => p.paymentStatus === 'Due' || p.paymentStatus === 'Partial'),
            p => p.totalAmount - p.paidAmount
        );

        const now = new Date();
        const overdueReceivables = transactions.filter(t => {
            if (t.status !== 'Due') return false;
            const due = t.total - t.payments.reduce((s, p) => s + p.amount, 0);
            if (due <= 0) return false;
            const dueDate = new Date(t.paymentDueDate || t.date);
            return dueDate < now;
        });

        const syncKey = `${upcomingReceivables.length}-${upcomingPayables.length}-${overdueReceivables.length}-${transactions.length}`;
        if (syncKey === lastSyncKey) return;
        setLastSyncKey(syncKey);

        const newNotifs: Omit<AppNotification, 'id'>[] = [];

        upcomingReceivables.forEach(t => {
            const due = t.total - t.payments.reduce((s, p) => s + p.amount, 0);
            newNotifs.push({
                date: new Date().toISOString(),
                type: 'due_reminder',
                title: `Collection due: ${t.customerName}`,
                message: `₹${due.toLocaleString('en-IN')} due in ${getUpcomingDues([t], x => x.total - x.payments.reduce((s, p) => s + p.amount, 0))[0]?.daysUntilDue ?? 0} day(s)`,
                read: false,
                linkPage: 'Sales',
                referenceId: t.id,
            });
        });

        overdueReceivables.slice(0, 5).forEach(t => {
            const due = t.total - t.payments.reduce((s, p) => s + p.amount, 0);
            newNotifs.push({
                date: new Date().toISOString(),
                type: 'overdue',
                title: `Overdue: ${t.customerName}`,
                message: `₹${due.toLocaleString('en-IN')} overdue on invoice ${t.invoiceNumber || t.id}`,
                read: false,
                linkPage: 'Sales',
                referenceId: t.id,
            });
        });

        const lowStock = productTypes.filter(pt => {
            if (!pt.lowStockThreshold) return false;
            const stock = inventory.filter(i => i.productTypeId === pt.id).reduce((s, i) => s + i.stock, 0);
            return stock <= pt.lowStockThreshold;
        });

        if (lowStock.length > 0) {
            newNotifs.push({
                date: new Date().toISOString(),
                type: 'low_stock',
                title: `${lowStock.length} product(s) low on stock`,
                message: lowStock.slice(0, 3).map(p => `${p.brandName} ${p.name}`).join(', '),
                read: false,
                linkPage: 'Products',
            });
        }

        if (newNotifs.length === 0) return;

        setNotifications(prev => {
            const existingRefs = new Set(prev.map(n => `${n.type}-${n.referenceId || n.title}`));
            const toAdd = newNotifs
                .filter(n => !existingRefs.has(`${n.type}-${n.referenceId || n.title}`))
                .map((n, i) => ({ ...n, id: `NOTIF-${Date.now()}-${i}` }));
            if (toAdd.length === 0) return prev;
            return [...toAdd, ...prev].slice(0, 50);
        });
    }, [transactions, purchases, inventory, productTypes, lastSyncKey, setLastSyncKey, setNotifications]);

    useEffect(() => {
        syncDueReminders();
        const interval = setInterval(syncDueReminders, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [syncDueReminders]);

    useEffect(() => {
        if (!config.preferences.browserNotificationsEnabled) return;
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const unread = notifications.filter(n => !n.read && (n.type === 'due_reminder' || n.type === 'overdue'));
        if (unread.length > 0) {
            const latest = unread[0];
            try {
                new Notification(latest.title, { body: latest.message, tag: latest.id });
            } catch { /* ignore */ }
        }
    }, [notifications, config.preferences.browserNotificationsEnabled]);

    const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

    const markAsRead = (id: string) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const dismissNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    return (
        <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllRead, dismissNotification }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const ctx = useContext(NotificationContext);
    if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
    return ctx;
};
