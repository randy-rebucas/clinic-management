'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions/auth';

interface PermissionRequirement {
  resource: string;
  action: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  category?: string;
  adminOnly?: boolean;
  requiresPermission?: PermissionRequirement | null;
}

interface SidebarProps {
  navItems: NavItem[];
  user: {
    name: string;
    role: string;
    _id?: string;
  } | null;
}

export default function Sidebar({ navItems, user }: SidebarProps) {
  const pathname = usePathname();

  /**
   * Filter navigation items based on permissions
   * 
   * Note: The Navigation component (server component) already filters items based on
   * permissions using server-side permission checks. This client-side filtering is
   * primarily for defensive programming and handling edge cases.
   * 
   * The server-side filtering in Navigation.tsx:
   * - Checks adminOnly items
   * - Checks requiresPermission using hasPermission()
   * - Only passes authorized items to this component
   */
  const filteredItems = navItems.filter(item => {
    // Double-check admin-only items (defensive programming)
    if (item.adminOnly && user?.role !== 'admin') {
      return false;
    }

    // If item requires permission but no user is present, hide it
    // (This should rarely happen as Navigation already filters, but safety first)
    if (item.requiresPermission && !user) {
      return false;
    }

    // All items passed from Navigation are already permission-checked
    // This filter just adds an extra safety layer
    return true;
  });

  // Group items by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = item.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  // Always render sidebar with at least dashboard
  // If no nav items, show dashboard as fallback
  if (filteredItems.length === 0) {
    // Fallback: show at least dashboard
    const dashboardItem: NavItem = {
      href: '/',
      label: 'Dashboard',
      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
      category: 'Main'
    };
    filteredItems.push(dashboardItem);
  }

  // If no user but we have nav items (like dashboard), still render sidebar
  // The dashboard will redirect to login if needed

  return (
    <div
      className="fixed left-0 top-0 h-screen bg-white border-r border-gray-300 z-40"
      style={{
        width: '280px',
      }}
    >
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="flex items-center h-14 px-3 border-b border-gray-300">
          <Link href="/" className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" fill="none" stroke="white" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <span className="text-base font-bold bg-gradient-to-r from-blue-700 to-blue-800 bg-clip-text text-transparent overflow-hidden text-ellipsis whitespace-nowrap">
                MyClinicSoft
              </span>
            </div>
          </Link>
        </div>

        {/* Show message if no user */}
        {!user && (
          <div className="px-3 py-2 border-b border-gray-200 bg-blue-50">
            <div className="text-xs text-blue-700">
              <p className="font-semibold mb-1">Not logged in</p>
              <p className="mb-2">Please log in to access all features</p>
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full mt-2 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded-md transition-colors text-xs flex items-center justify-center gap-1.5 border border-red-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear Session
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto py-3 px-2">
          <div className="flex flex-col gap-0">
          {Object.entries(groupedItems).map(([category, items]) => (
            <div key={category}>
              {items.length > 0 && (
                <div className="px-3 py-2">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    {category}
                  </span>
                </div>
              )}
              {items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <div key={item.href} className="px-2">
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md no-underline transition-colors ${
                        isActive
                          ? 'bg-blue-100 text-blue-900 font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <div className={`w-[18px] h-[18px] flex-shrink-0 ${
                        isActive ? 'text-blue-700' : 'text-gray-600'
                      }`}>
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d={item.icon}
                          />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-sm overflow-hidden text-ellipsis whitespace-nowrap">
                          {item.label}
                        </span>
                      </div>
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-700 flex-shrink-0" />
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          ))}
          </div>
        </div>

        {/* User Profile & Logout Section */}
        {user && (
          <div className="border-t border-gray-200 p-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-semibold text-sm">
                  {user.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user.name || 'User'}
                </p>
                <p className="text-xs text-gray-500 capitalize truncate">
                  {user.role || 'Staff'}
                </p>
              </div>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-700 font-medium rounded-md transition-colors text-sm border border-gray-200 hover:border-red-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
