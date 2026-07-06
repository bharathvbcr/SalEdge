import { Page, UserRole } from '../types.ts';

/** Pages staff can access — focused on day-to-day shop operations. */
export const STAFF_PAGES: readonly Page[] = [
    'Dashboard',
    'Sales',
    'Mobile',
    'Products',
    'Charging Services',
    'Customers',
    'Warranty',
];

export const ADMIN_ONLY_PAGES: readonly Page[] = [
    'Purchases',
    'Banking',
    'Expenses',
    'Reports',
    'Settings',
];

export function isPageAllowed(role: UserRole | null, page: Page): boolean {
    if (!role || role === 'admin') return true;
    return STAFF_PAGES.includes(page);
}

export function getDefaultPage(role: UserRole | null): Page {
    return role === 'staff' ? 'Sales' : 'Dashboard';
}
