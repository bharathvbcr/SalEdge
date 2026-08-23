import React, { useMemo, useState } from 'react';
import { Page } from '../types.ts';
import { IconDashboard, IconSales, IconInventory, IconCharging, IconSettings, IconCustomers, IconReceipt, IconShieldCheck, IconReports, IconShoppingBag, IconBuildingBank, IconChevronDown, IconScan, IconX } from './icons.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useNotifications } from '../context/NotificationContext.tsx';
import { useAppData } from '../context/AppDataContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { isPageAllowed } from '../utils/roleAccess.ts';
import { BrandMark } from './BrandMark.tsx';

interface NavLinkProps {
  icon: React.ReactElement<{ className?: string }>;
  label: string;
  isActive?: boolean;
  onClick: () => void;
  badge?: number;
}

const NavLink: React.FC<NavLinkProps> = ({ icon, label, isActive = false, onClick, badge }) => {
  const activeClasses = 'bg-brand-red text-white shadow-md shadow-brand-red/20';
  const inactiveClasses = 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40';
  const commonClasses = 'flex items-center space-x-3 p-3 rounded-lg transition-all duration-200 ease-in-out font-medium w-full text-left relative min-h-[44px]';

  return (
    <button onClick={onClick} className={`${commonClasses} ${isActive ? activeClasses : inactiveClasses}`}>
      {React.cloneElement(icon, { className: "h-5 w-5 flex-shrink-0" })}
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute right-2 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-brand-red text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
};

interface NavGroupProps {
  icon: React.ReactElement<{ className?: string }>;
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  hasActiveChild?: boolean;
}

const NavGroup: React.FC<NavGroupProps> = ({ icon, label, children, defaultOpen = false, hasActiveChild = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen || hasActiveChild);

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full p-3 rounded-lg transition-all duration-200 font-medium ${hasActiveChild ? 'text-brand-red bg-red-50 dark:bg-red-900/20' : 'text-text-secondary hover:bg-bg-secondary/60'}`}
      >
        <div className="flex items-center space-x-4">
          {React.cloneElement(icon, { className: "h-5 w-5 flex-shrink-0" })}
          <span>{label}</span>
        </div>
        <IconChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="ml-4 pl-4 border-l border-border-color space-y-1">
          {children}
        </div>
      )}
    </div>
  );
};

interface SidebarProps {
  isSidebarOpen: boolean;
  setSidebarOpen: (isOpen: boolean) => void;
  activePage: Page;
  setActivePage: (page: Page) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isSidebarOpen, setSidebarOpen, activePage, setActivePage }) => {
  const { user, userRole, logout } = useAuth();
  const { inventory, transactions } = useAppData();
  const { productTypes } = useMasterData();
  const { unreadCount: notificationCount } = useNotifications();

  const { lowStockCount, overdueCount } = useMemo(() => {
    const lowStock = productTypes.filter(pt => {
      if (!pt.lowStockThreshold || pt.lowStockThreshold <= 0) return false;
      const totalStock = inventory
        .filter(inv => inv.productTypeId === pt.id)
        .reduce((sum, item) => sum + item.stock, 0);
      return totalStock <= pt.lowStockThreshold;
    }).length;

    const overdue = transactions.filter(t => {
      if (t.status !== 'Due') return false;
      const paid = t.payments.reduce((sum, p) => sum + p.amount, 0);
      return (t.total - paid) > 1;
    }).length;

    return { lowStockCount: lowStock, overdueCount: overdue };
  }, [inventory, productTypes, transactions]);

  const handleNav = (page: Page) => {
    setActivePage(page);
    if (isSidebarOpen) setSidebarOpen(false);
  };

  const isAdmin = userRole === 'admin';
  const moneyPages: Page[] = ['Purchases', 'Banking', 'Expenses'];
  const customerPages: Page[] = ['Customers', 'Warranty'];

  const isMoneyActive = moneyPages.includes(activePage);
  const isCustomerActive = customerPages.includes(activePage);

  const handleNavSafe = (page: Page) => {
    if (!isPageAllowed(userRole, page)) return;
    handleNav(page);
  };

  return (
    <>
      <div className={`fixed inset-0 bg-black/40 z-30 transition-opacity md:hidden ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setSidebarOpen(false)}></div>
      <aside className={`flex-shrink-0 w-64 flex flex-col bg-glass-bg border-r border-glass-border shadow-lg backdrop-blur-lg backdrop-saturate-150 p-4 fixed md:relative h-full z-40 transition-transform duration-300 ease-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="flex items-center justify-between pb-4 border-b border-border-color">
          <div className="flex items-center space-x-2">
            <div className="flex-shrink-0">
              <BrandMark className="h-9 w-9" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-text-primary leading-tight">SalEdge</h1>
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${userRole === 'admin' ? 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800' : 'bg-bg-tertiary text-text-muted border-border-color'}`}>
                {user?.displayName || userRole}
              </span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="btn-icon md:hidden flex-shrink-0"
            aria-label="Close menu"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-4 flex flex-col flex-1 overflow-y-auto space-y-1">
          <NavLink icon={<IconDashboard />} label="Dashboard" isActive={activePage === 'Dashboard'} onClick={() => handleNavSafe('Dashboard')} badge={notificationCount} />
          <NavLink icon={<IconSales />} label="Sales" isActive={activePage === 'Sales'} onClick={() => handleNavSafe('Sales')} badge={overdueCount} />
          <NavLink icon={<IconScan />} label="Mobile Companion" isActive={activePage === 'Mobile'} onClick={() => handleNavSafe('Mobile')} />
          <NavLink icon={<IconInventory />} label="Products" isActive={activePage === 'Products'} onClick={() => handleNavSafe('Products')} badge={lowStockCount} />
          <NavLink icon={<IconCharging />} label="Services" isActive={activePage === 'Charging Services'} onClick={() => handleNavSafe('Charging Services')} />

          {isAdmin ? (
            <NavGroup icon={<IconCustomers />} label="Customers" hasActiveChild={isCustomerActive}>
              <NavLink icon={<IconCustomers />} label="Customer List" isActive={activePage === 'Customers'} onClick={() => handleNavSafe('Customers')} />
              <NavLink icon={<IconShieldCheck />} label="Warranty" isActive={activePage === 'Warranty'} onClick={() => handleNavSafe('Warranty')} />
            </NavGroup>
          ) : (
            <>
              <NavLink icon={<IconCustomers />} label="Customers" isActive={activePage === 'Customers'} onClick={() => handleNavSafe('Customers')} />
              <NavLink icon={<IconShieldCheck />} label="Warranty" isActive={activePage === 'Warranty'} onClick={() => handleNavSafe('Warranty')} />
            </>
          )}

          {isAdmin && (
            <>
              <NavGroup icon={<IconBuildingBank />} label="Finance" hasActiveChild={isMoneyActive}>
                <NavLink icon={<IconShoppingBag />} label="Purchases" isActive={activePage === 'Purchases'} onClick={() => handleNavSafe('Purchases')} />
                <NavLink icon={<IconBuildingBank />} label="Banking" isActive={activePage === 'Banking'} onClick={() => handleNavSafe('Banking')} />
                <NavLink icon={<IconReceipt />} label="Expenses" isActive={activePage === 'Expenses'} onClick={() => handleNavSafe('Expenses')} />
              </NavGroup>
              <NavLink icon={<IconReports />} label="Reports" isActive={activePage === 'Reports'} onClick={() => handleNavSafe('Reports')} />
            </>
          )}

          <div className="mt-auto pt-4 border-t border-border-color space-y-1">
            {isAdmin && (
              <NavLink icon={<IconSettings />} label="Settings" isActive={activePage === 'Settings'} onClick={() => handleNavSafe('Settings')} />
            )}
            <button
              onClick={logout}
              className="flex items-center space-x-4 p-3 rounded-lg transition-all duration-200 ease-in-out font-medium w-full text-left text-text-muted hover:bg-red-50 hover:text-red-600 border border-transparent hover:border-red-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              <span>Lock App</span>
            </button>
          </div>
        </nav>
      </aside>
    </>
  );
};