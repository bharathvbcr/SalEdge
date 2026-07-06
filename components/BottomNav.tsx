import React, { useState } from 'react';
import { Page } from '../types.ts';
import { IconDashboard, IconSales, IconInventory, IconCustomers, IconScan, IconCharging, IconShieldCheck, IconX } from './icons.tsx';

const BottomNavItem: React.FC<{
    icon: React.ReactElement<{ className?: string }>;
    label: string;
    isActive?: boolean;
    onClick: () => void;
    badge?: number;
}> = ({ icon, label, isActive, onClick, badge }) => (
    <button
        onClick={onClick}
        className={`relative flex flex-col items-center justify-center gap-0.5 py-2 min-h-[44px] transition-colors ${
            isActive ? 'text-brand-red' : 'text-text-muted hover:text-text-secondary'
        }`}
        aria-current={isActive ? 'page' : undefined}
    >
        {React.cloneElement(icon, { className: `h-6 w-6 transition-transform ${isActive ? 'scale-110' : ''}` })}
        <span className={`text-[10px] font-semibold ${isActive ? 'text-brand-red' : ''}`}>{label}</span>
        {badge !== undefined && badge > 0 && (
            <span className="absolute top-0 right-1/4 min-w-[16px] h-4 px-1 rounded-full bg-brand-red text-white text-[9px] font-bold flex items-center justify-center">
                {badge > 99 ? '99+' : badge}
            </span>
        )}
        {isActive && (
            <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-red" />
        )}
    </button>
);

interface BottomNavProps {
    activePage: Page;
    setActivePage: (page: Page) => void;
}

const MORE_PAGES: { page: Page; label: string; icon: React.ReactElement<{ className?: string }> }[] = [
    { page: 'Customers', label: 'Customers', icon: <IconCustomers /> },
    { page: 'Charging Services', label: 'Services', icon: <IconCharging /> },
    { page: 'Warranty', label: 'Warranty', icon: <IconShieldCheck /> },
];

export const BottomNav: React.FC<BottomNavProps> = ({ activePage, setActivePage }) => {
    const [moreOpen, setMoreOpen] = useState(false);
    const isMoreActive = MORE_PAGES.some(p => p.page === activePage);

    const leftItems = [
        { label: 'Dashboard' as Page, icon: <IconDashboard />, navLabel: 'Home' },
        { label: 'Sales' as Page, icon: <IconSales />, navLabel: 'Sales' },
    ];
    const rightItems = [
        { label: 'Products' as Page, icon: <IconInventory />, navLabel: 'Stock' },
    ];

    const navigate = (page: Page) => {
        setActivePage(page);
        setMoreOpen(false);
    };

    return (
        <>
            {moreOpen && (
                <>
                    <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setMoreOpen(false)} />
                    <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-2 right-2 z-40 md:hidden bg-bg-secondary border border-border-color rounded-xl shadow-2xl p-2 animate-slide-up">
                        <div className="flex justify-between items-center px-2 py-2 mb-1 border-b border-border-color">
                            <span className="text-sm font-bold text-text-primary">More pages</span>
                            <button type="button" onClick={() => setMoreOpen(false)} className="btn-icon" aria-label="Close">
                                <IconX className="h-4 w-4" />
                            </button>
                        </div>
                        {MORE_PAGES.map(item => (
                            <button
                                key={item.page}
                                type="button"
                                onClick={() => navigate(item.page)}
                                className={`flex items-center gap-3 w-full p-3 rounded-lg text-left font-medium ${
                                    activePage === item.page ? 'bg-brand-red/10 text-brand-red' : 'hover:bg-bg-tertiary text-text-primary'
                                }`}
                            >
                                {React.cloneElement(item.icon, { className: 'h-5 w-5' })}
                                {item.label}
                            </button>
                        ))}
                    </div>
                </>
            )}

            <nav
                className="fixed bottom-0 left-0 right-0 bg-glass-bg border-t border-glass-border backdrop-blur-md backdrop-saturate-150 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] md:hidden z-20 safe-bottom"
                aria-label="Main navigation"
            >
                <div className="grid grid-cols-5 h-16 items-end pb-1 px-2">
                    {leftItems.map(item => (
                        <BottomNavItem
                            key={item.label}
                            icon={item.icon}
                            label={item.navLabel}
                            isActive={activePage === item.label}
                            onClick={() => navigate(item.label)}
                        />
                    ))}
                    <div className="flex flex-col items-center justify-end -mt-5">
                        <button
                            onClick={() => navigate('Mobile')}
                            className={`flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all active:scale-95 ${
                                activePage === 'Mobile'
                                    ? 'bg-brand-red text-white ring-4 ring-brand-red/25 scale-105'
                                    : 'bg-brand-red text-white hover:bg-red-700 shadow-brand-red/30'
                            }`}
                            aria-label="Mobile Scanner"
                            aria-current={activePage === 'Mobile' ? 'page' : undefined}
                        >
                            <IconScan className="h-7 w-7" />
                        </button>
                        <span className={`text-[10px] font-bold mt-1 ${activePage === 'Mobile' ? 'text-brand-red' : 'text-text-muted'}`}>
                            Scan
                        </span>
                    </div>
                    {rightItems.map(item => (
                        <BottomNavItem
                            key={item.label}
                            icon={item.icon}
                            label={item.navLabel}
                            isActive={activePage === item.label}
                            onClick={() => navigate(item.label)}
                        />
                    ))}
                    <BottomNavItem
                        icon={<IconCustomers />}
                        label="More"
                        isActive={isMoreActive}
                        onClick={() => setMoreOpen(o => !o)}
                    />
                </div>
            </nav>
        </>
    );
};
