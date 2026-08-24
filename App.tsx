


import React, { useState, Suspense, ReactNode, useEffect, useCallback } from 'react';
import { Page } from './types.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { AppDataProvider, useAppData } from './context/AppDataContext.tsx';
import { MasterDataProvider, useMasterData } from './context/MasterDataContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { ConfigProvider, useConfig } from './context/ConfigContext.tsx';
import { ToastProvider, useToast } from './context/ToastContext.tsx';
import { ToastContainer } from './components/Toast.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { NotificationProvider } from './context/NotificationContext.tsx';
import { LockScreen } from './components/LockScreen.tsx';
import { ForcePasswordChange } from './components/ForcePasswordChange.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { setStorageConflictHandler, setStorageSaveHandlers, setStorageHydrationHandler } from './hooks/useApiStorage.tsx';
import { HydrationWarningBanner } from './components/HydrationWarningBanner.tsx';
import { AppHeader } from './components/AppHeader.tsx';
import { LoadingScreen, PageLoadingFallback } from './components/LoadingSpinner.tsx';
import { getDefaultPage, isPageAllowed } from './utils/roleAccess.ts';
import { clearMobilePageQuery, isMobileViewport, resolveInitialMobilePage, stashMobileRedirect, getRequestedPage } from './utils/mobileConnect.ts';
import { SessionTimeoutWarning } from './components/SessionTimeoutWarning.tsx';
import { QuickNavPalette } from './components/QuickNavPalette.tsx';

const DashboardPage = React.lazy(() => import('./components/DashboardPage.tsx').then(module => ({ default: module.DashboardPage })));
const SalesPage = React.lazy(() => import('./components/SalesPage.tsx').then(module => ({ default: module.SalesPage })));
const CustomersPage = React.lazy(() => import('./components/CustomersPage.tsx').then(module => ({ default: module.CustomersPage })));
const InventoryPage = React.lazy(() => import('./components/InventoryPage.tsx').then(module => ({ default: module.InventoryPage })));
const PurchasePage = React.lazy(() => import('./components/PurchasePage.tsx').then(module => ({ default: module.PurchasePage })));
const BankingPage = React.lazy(() => import('./components/BankingPage.tsx').then(module => ({ default: module.BankingPage })));
const ExpensesPage = React.lazy(() => import('./components/ExpensesPage.tsx').then(module => ({ default: module.ExpensesPage })));
const ChargingServicePage = React.lazy(() => import('./components/ChargingServicePage.tsx').then(module => ({ default: module.ChargingServicePage })));
const WarrantyPage = React.lazy(() => import('./components/WarrantyPage.tsx').then(module => ({ default: module.WarrantyPage })));
const ReportsPage = React.lazy(() => import('./components/ReportsPage.tsx').then(module => ({ default: module.ReportsPage })));
const SettingsPage = React.lazy(() => import('./components/SettingsPage.tsx').then(module => ({ default: module.SettingsPage })));
const MobileCompanionPage = React.lazy(() => import('./components/MobileCompanionPage.tsx').then(module => ({ default: module.MobileCompanionPage })));
const MobileCompanionDesktopHint = React.lazy(() => import('./components/MobileCompanionPage.tsx').then(module => ({ default: module.MobileCompanionDesktopHint })));

const DataLoadingGate: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { isLoading: configLoading } = useConfig();
    const { isLoading: masterLoading } = useMasterData();
    const { isLoading: appLoading } = useAppData();

    if (configLoading || masterLoading || appLoading) {
        return <LoadingScreen message="Loading shop data..." />;
    }

    return <>{children}</>;
};

const MainLayout: React.FC = () => {
    const { userRole } = useAuth();
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [activePage, setActivePageState] = useState<Page>('Dashboard');
    const [pageInitialized, setPageInitialized] = useState(false);
    const [quickNavOpen, setQuickNavOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setQuickNavOpen(true);
            } else if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const target = e.target as HTMLElement | null;
                const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
                if (!isTyping) {
                    e.preventDefault();
                    setQuickNavOpen(prev => !prev);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const closeQuickNav = useCallback(() => setQuickNavOpen(false), []);

    useEffect(() => {
        if (userRole && !pageInitialized) {
            const requestedPage = resolveInitialMobilePage();
            const defaultPage = getDefaultPage(userRole, {
                requestedPage,
                mobile: isMobileViewport(),
            });
            setActivePageState(defaultPage);
            setPageInitialized(true);
            if (requestedPage) clearMobilePageQuery();
        }
    }, [userRole, pageInitialized]);

    useEffect(() => {
        if (userRole && !isPageAllowed(userRole, activePage)) {
            setActivePageState(getDefaultPage(userRole));
        }
    }, [userRole, activePage]);

    const setActivePage = (page: Page) => {
        if (userRole && !isPageAllowed(userRole, page)) return;
        setActivePageState(page);
    };

    const renderPage = () => {
        switch (activePage) {
            case 'Dashboard': return <DashboardPage onNavigate={setActivePage} />;
            case 'Sales': return <SalesPage />;
            case 'Purchases': return <PurchasePage />;
            case 'Banking': return <BankingPage />;
            case 'Customers': return <CustomersPage onNavigate={setActivePage} />;
            case 'Products': return <InventoryPage />;
            case 'Expenses': return <ExpensesPage />;
            case 'Charging Services': return <ChargingServicePage />;
            case 'Warranty': return <WarrantyPage />;
            case 'Reports': return <ReportsPage />;
            case 'Settings': return <SettingsPage />;
            case 'Mobile': return (
                <>
                    <MobileCompanionPage onNavigate={setActivePage} />
                    <MobileCompanionDesktopHint />
                </>
            );
            default: return <DashboardPage onNavigate={setActivePage} />;
        }
    };

    const LoadingFallback = () => <PageLoadingFallback />;

    return (
        <div className="flex h-screen bg-bg-primary text-text-primary font-sans">
            <Sidebar
                isSidebarOpen={isSidebarOpen}
                setSidebarOpen={setSidebarOpen}
                activePage={activePage}
                setActivePage={setActivePage}
            />
            <main className="flex-1 flex flex-col overflow-hidden min-w-0">
                <AppHeader
                    activePage={activePage}
                    onMenuClick={() => setSidebarOpen(true)}
                    onNavigate={setActivePage}
                />
                <div className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
                    <Suspense fallback={<LoadingFallback />}>
                        {renderPage()}
                    </Suspense>
                </div>
                <BottomNav activePage={activePage} setActivePage={setActivePage} />
            </main>
            <ToastContainer />
            {quickNavOpen && userRole && (
                <QuickNavPalette
                    userRole={userRole}
                    onNavigate={setActivePage}
                    onClose={closeQuickNav}
                />
            )}
        </div>
    );
};

const AuthenticatedApp: React.FC = () => {
    const { user, isAuthenticated, isLoading } = useAuth();
    const [hydrationFailed, setHydrationFailed] = useState(false);

    useEffect(() => {
        const page = getRequestedPage();
        if (page) stashMobileRedirect(page);
    }, []);

    useEffect(() => {
        setStorageHydrationHandler(setHydrationFailed);
        return () => setStorageHydrationHandler(null);
    }, []);

    if (isLoading) {
        return <LoadingScreen message="Checking session..." />;
    }

    if (!isAuthenticated) {
        return <LockScreen />;
    }

    // ToastProvider must wrap EVERY authenticated branch, not just the main
    // layout — the forced-password gate consumes useToast and previously
    // crashed with "useToast must be used within a ToastProvider" for any
    // returning user whose account still carried a seeded password.
    return (
        <ConfigProvider>
            <ToastProvider>
                {user?.mustChangePassword ? (
                    <ForcePasswordChange />
                ) : (
                    <StorageConflictBridge>
                        <MasterDataProvider>
                            <AppDataProvider>
                                <DataLoadingGate>
                                    {hydrationFailed && <HydrationWarningBanner />}
                                    <NotificationProvider>
                                        <SessionTimeoutWarning />
                                        <MainLayout />
                                    </NotificationProvider>
                                </DataLoadingGate>
                            </AppDataProvider>
                        </MasterDataProvider>
                    </StorageConflictBridge>
                )}
            </ToastProvider>
        </ConfigProvider>
    );
};

const StorageConflictBridge: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { addToast } = useToast();
    useEffect(() => {
        setStorageConflictHandler(msg => addToast(msg, 'warning'));
        setStorageSaveHandlers({
            onError: msg => addToast(msg, 'error'),
            onRecovered: () => addToast('Connection restored — all changes saved.', 'success'),
        });
        return () => {
            setStorageConflictHandler(null);
            setStorageSaveHandlers({ onError: null, onRecovered: null });
        };
    }, [addToast]);
    return <>{children}</>;
};

const App: React.FC = () => {
    return (
        <ErrorBoundary>
            <ThemeProvider>
                <AuthProvider>
                    <AuthenticatedApp />
                </AuthProvider>
            </ThemeProvider>
        </ErrorBoundary>
    );
};

export default App;
