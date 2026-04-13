'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions/auth';
import { useEffect, useState } from 'react';
import { useSidebar } from './SidebarContext';

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
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const [mounted, setMounted] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<{
    plan?: string;
    status?: 'active' | 'cancelled' | 'expired';
    billingCycle?: 'monthly' | 'yearly';
    expiresAt?: string;
    renewalAt?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Set mounted flag after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch tenant subscription data
  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const response = await fetch('/api/settings/subscription');
        if (response.ok) {
          const data = await response.json();
          setSubscription(data.data?.subscription || null);
        }
      } catch (error) {
        console.error('Failed to fetch subscription:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, []);

  // Handle sidebar toggle with audit logging
  const handleToggleSidebar = async () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    
    // Log sidebar interaction
    try {
      await fetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'view',
          resource: 'system',
          description: `Sidebar ${newState ? 'collapsed' : 'expanded'}`,
          metadata: { sidebarState: newState ? 'collapsed' : 'expanded' },
        }),
      }).catch(() => {
        // Silently fail - don't break the UI
      });
    } catch (error) {
      // Silently fail - don't break the UI
    }
  };

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
    // Administration links are surfaced in the top sub-header for admins.
    if (item.category === 'Administration') {
      return acc;
    }

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
      className="fixed left-0 top-0 h-screen bg-white border-r border-gray-300 z-40 transition-all duration-300"
      style={{
        width: mounted && isCollapsed ? '80px' : '280px',
      }}
    >
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="flex items-center justify-between h-14 px-3 border-b border-gray-300">
          {(!mounted || !isCollapsed) && (
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
          )}
          {mounted && isCollapsed && (
            <Link href="/" className="w-full flex justify-center">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" fill="none" stroke="white" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
            </Link>
          )}
          <div className="relative">
            <button
              onClick={handleToggleSidebar}
              className="p-1 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mounted && isCollapsed ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                )}
              </svg>
            </button>
          </div>
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
                  <span className={`text-xs font-bold text-gray-500 uppercase tracking-wider ${mounted && isCollapsed ? 'hidden' : ''}`}>
                    {category}
                  </span>
                </div>
              )}
              {items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <div 
                    key={item.href} 
                    className="px-2 relative"
                    onMouseEnter={() => setHoveredItem(item.href)}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
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
                        <span className={`block text-sm overflow-hidden text-ellipsis whitespace-nowrap ${mounted && isCollapsed ? 'hidden' : ''}`}>
                          {item.label}
                        </span>
                      </div>
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-700 flex-shrink-0" />
                      )}
                    </Link>
                    {/* Custom Tooltip */}
                    {mounted && isCollapsed && hoveredItem === item.href && (
                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg shadow-lg whitespace-nowrap z-50 pointer-events-none">
                        {item.label}
                        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          </div>
        </div>

        {/* User Profile & Logout Section */}
        {user && (!mounted || !isCollapsed) && (
          <div className="border-t border-gray-200 p-3">
            {/* Subscription Status */}
            {!loading && subscription && (
              <div className={`flex flex-col gap-3 mb-3 p-3 rounded-lg border ${
                subscription.status === 'active'
                  ? 'bg-green-50 border-green-200'
                  : subscription.status === 'expired'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-yellow-50 border-yellow-200'
              }`}>
                <div className="flex items-center gap-2">
                  {subscription.status === 'active' ? (
                    <svg className="w-5 h-5 text-green-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : subscription.status === 'expired' ? (
                    <svg className="w-5 h-5 text-red-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-yellow-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <p className={`text-sm font-bold ${
                    subscription.status === 'active'
                      ? 'text-green-900'
                      : subscription.status === 'expired'
                      ? 'text-red-900'
                      : 'text-yellow-900'
                  }`}>
                    {subscription.status === 'active'
                      ? 'Subscription Active'
                      : subscription.status === 'expired'
                      ? 'Subscription Expired'
                      : subscription.status === 'cancelled'
                      ? 'Subscription Cancelled'
                      : 'Subscription Paused'}
                  </p>
                </div>
                <div className={`space-y-1.5 pl-7 text-xs ${
                  subscription.status === 'active'
                    ? 'text-green-800'
                    : subscription.status === 'expired'
                    ? 'text-red-800'
                    : 'text-yellow-800'
                }`}>
                  {subscription.plan && (
                    <p>
                      <span className="font-semibold">Plan:</span> {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
                    </p>
                  )}
                  {subscription.billingCycle && (
                    <p>
                      <span className="font-semibold">Billing:</span> {subscription.billingCycle === 'monthly' ? 'Monthly' : 'Yearly'}
                    </p>
                  )}
                  {subscription.expiresAt && (
                    <p>
                      <span className="font-semibold">Expires:</span> {new Date(subscription.expiresAt).toLocaleDateString()}
                    </p>
                  )}
                  {subscription.status === 'active' && subscription.expiresAt && (
                    <p className={`font-medium ${
                      subscription.status === 'active' ? 'text-green-700' : ''
                    }`}>
                      {Math.ceil((new Date(subscription.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days remaining
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Default subscription display if not loaded */}
            {!loading && !subscription && (
              <div className="flex flex-col gap-3 mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-bold text-gray-700">No Active Plan</p>
                </div>
                <p className="text-xs text-gray-600 pl-7">
                  Upgrade to access premium features
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
