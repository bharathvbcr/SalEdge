import React from 'react';
import { Page } from '../types.ts';
import { useTheme } from '../context/ThemeContext.tsx';
import { NotificationCenter } from './NotificationCenter.tsx';
import { AiChatPanel } from './AiChatPanel.tsx';
import { IconMenu, IconSun, IconMoon } from './icons.tsx';

const PAGE_TITLES: Record<Page, string> = {
    'Dashboard': 'Dashboard',
    'Sales': 'Sales & Billing',
    'Purchases': 'Purchases',
    'Banking': 'Banking',
    'Customers': 'Customers',
    'Products': 'Products',
    'Expenses': 'Expenses',
    'Charging Services': 'Services',
    'Warranty': 'Warranty',
    'Reports': 'Reports',
    'Settings': 'Settings',
    'Mobile': 'Mobile Scanner',
};

interface AppHeaderProps {
    activePage: Page;
    onMenuClick: () => void;
    onNavigate: (page: Page) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ activePage, onMenuClick, onNavigate }) => {
    const { theme, setTheme } = useTheme();
    const pageTitle = PAGE_TITLES[activePage] ?? activePage;

    return (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-color bg-bg-secondary/90 backdrop-blur-md print-hidden sticky top-0 z-20">
            <div className="flex items-center gap-3 min-w-0">
                <button
                    onClick={onMenuClick}
                    className="btn-icon md:hidden flex-shrink-0 -ml-1"
                    aria-label="Open menu"
                >
                    <IconMenu className="h-5 w-5" />
                </button>
                <div className="min-w-0 md:hidden">
                    <h1 className="text-base font-bold text-text-primary truncate leading-tight">
                        {pageTitle}
                    </h1>
                    <p className="text-[11px] text-text-muted truncate">Battery Shop</p>
                </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                <AiChatPanel onNavigate={onNavigate} />
                <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="btn-icon"
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                >
                    {theme === 'dark'
                        ? <IconSun className="h-5 w-5" />
                        : <IconMoon className="h-5 w-5" />
                    }
                </button>
                {activePage !== 'Mobile' && (
                    <NotificationCenter onNavigate={onNavigate} />
                )}
            </div>
        </header>
    );
};
