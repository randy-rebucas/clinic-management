'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions/auth';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSidebar } from './SidebarContext';
import BrandLogo from './BrandLogo';

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

const subscribeNoop = () => () => {};

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-1';

/** The dashboard lives at /dashboard but is linked as "/"; nested routes highlight their parent. */
function isNavItemActive(href: string, pathname: string | null) {
  if (!pathname) return false;
  if (href === '/') return pathname === '/' || pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function daysUntil(date: string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function Sidebar({ navItems, user }: SidebarProps) {
  const pathname = usePathname();
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();
  // False during SSR and hydration, true afterwards.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const collapsed = mounted && isCollapsed;
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<{
    plan?: string;
    status?: 'active' | 'cancelled' | 'expired';
    billingCycle?: 'monthly' | 'yearly';
    expiresAt?: string;
    renewalAt?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Close the mobile drawer on Escape
  useEffect(() => {
    if (!isMobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMobileOpen, setIsMobileOpen]);

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
   */
  const filteredItems = navItems.filter(item => {
    // Double-check admin-only items (defensive programming)
    if (item.adminOnly && user?.role !== 'admin') {
      return false;
    }

    // If item requires permission but no user is present, hide it
    if (item.requiresPermission && !user) {
      return false;
    }

    return true;
  });

  // Always render sidebar with at least dashboard
  if (filteredItems.length === 0) {
    filteredItems.push({
      href: '/',
      label: 'Dashboard',
      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
      category: 'Main'
    });
  }

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

  // Labels and panels hide only on desktop when collapsed; the mobile drawer is always full width.
  const hideWhenCollapsed = collapsed ? 'lg:hidden' : '';
  const closeMobile = () => setIsMobileOpen(false);

  const subscriptionTone =
    subscription?.status === 'active'
      ? { dot: 'bg-emerald-500', label: 'Subscription active' }
      : subscription?.status === 'expired'
      ? { dot: 'bg-red-500', label: 'Subscription expired' }
      : subscription?.status === 'cancelled'
      ? { dot: 'bg-amber-500', label: 'Subscription cancelled' }
      : { dot: 'bg-amber-500', label: 'Subscription paused' };

  return (
    <>
      {/* Mobile backdrop */}
      <div
        aria-hidden="true"
        onClick={closeMobile}
        className={`fixed inset-0 z-40 bg-brand-navy/40 lg:hidden transition-opacity duration-200 ${
          isMobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        id="app-sidebar"
        className={`fixed left-0 top-0 h-screen w-[280px] bg-white border-r border-gray-200 z-50 lg:z-40 transition-[width,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          collapsed ? 'lg:w-20' : 'lg:w-[280px]'
        } ${isMobileOpen ? 'translate-x-0 shadow-[0_20px_50px_rgb(15,23,42,0.18)]' : '-translate-x-full'} lg:translate-x-0 lg:shadow-none`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className={`flex items-center h-16 border-b border-gray-200 ${collapsed ? 'px-4 lg:px-0 lg:justify-center' : 'px-4'} gap-2`}>
            <Link
              href="/"
              onClick={closeMobile}
              aria-label="MyClinicSoft dashboard"
              className={`flex items-center gap-2.5 min-w-0 rounded-md ${collapsed ? 'flex-1 lg:flex-none' : 'flex-1'} ${FOCUS_RING}`}
            >
              <BrandLogo size={32} rounded="rounded-lg" />
              <span className={`text-base font-bold text-gray-900 tracking-tight truncate ${hideWhenCollapsed}`}>
                MyClinicSoft
              </span>
            </Link>

            {/* Desktop collapse toggle */}
            <button
              type="button"
              onClick={handleToggleSidebar}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`hidden ${collapsed ? '' : 'lg:inline-flex'} p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors shrink-0 ${FOCUS_RING}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>

            {/* Mobile close */}
            <button
              type="button"
              onClick={closeMobile}
              aria-label="Close navigation"
              className={`lg:hidden p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors shrink-0 ${FOCUS_RING}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Expand toggle when collapsed (desktop only) */}
          {collapsed && (
            <div className="hidden lg:flex justify-center py-2 border-b border-gray-200">
              <button
                type="button"
                onClick={handleToggleSidebar}
                aria-label="Expand sidebar"
                aria-expanded={false}
                aria-controls="app-sidebar"
                title="Expand sidebar"
                className={`p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors ${FOCUS_RING}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* Show message if no user */}
          {!user && (
            <div className={`m-3 p-3 rounded-lg border border-gray-200 bg-gray-50 ${hideWhenCollapsed}`}>
              <p className="text-sm font-semibold text-gray-900">Not signed in</p>
              <p className="text-xs text-gray-600 mt-0.5">Sign in again to access your clinic.</p>
              <form action={logout}>
                <button
                  type="submit"
                  className={`w-full mt-3 px-3 py-2 bg-white border border-gray-300 hover:border-gray-900 text-gray-900 font-semibold rounded-md transition-colors text-xs ${FOCUS_RING}`}
                >
                  Clear session
                </button>
              </form>
            </div>
          )}

          {/* Navigation Items */}
          <nav aria-label="Main navigation" className="flex-1 overflow-y-auto py-4 px-3">
            <div className="flex flex-col gap-5">
              {Object.entries(groupedItems).map(([category, items]) => (
                <div key={category}>
                  <p className={`px-3 mb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider ${hideWhenCollapsed}`}>
                    {category}
                  </p>
                  {collapsed && <div className="hidden lg:block mx-3 mb-2 h-px bg-gray-200" aria-hidden="true" />}
                  <ul className="flex flex-col gap-0.5">
                    {items.map((item) => {
                      const isActive = isNavItemActive(item.href, pathname);
                      return (
                        <li
                          key={item.href}
                          className="relative"
                          onMouseEnter={() => setHoveredItem(item.href)}
                          onMouseLeave={() => setHoveredItem(null)}
                        >
                          <Link
                            href={item.href}
                            onClick={closeMobile}
                            aria-label={collapsed ? item.label : undefined}
                            aria-current={isActive ? 'page' : undefined}
                            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                              collapsed ? 'lg:justify-center lg:px-0' : ''
                            } ${
                              isActive
                                ? 'bg-brand-teal-light text-brand-teal-deep font-semibold'
                                : 'text-gray-700 font-medium hover:bg-gray-100 hover:text-gray-900'
                            } ${FOCUS_RING}`}
                          >
                            <svg
                              className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-brand-teal-dark' : 'text-gray-500'}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={item.icon} />
                            </svg>
                            <span className={`truncate ${hideWhenCollapsed}`}>{item.label}</span>
                          </Link>
                          {/* Tooltip for the collapsed rail */}
                          {collapsed && hoveredItem === item.href && (
                            <div
                              aria-hidden="true"
                              className="hidden lg:block absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md shadow-lg whitespace-nowrap z-50 pointer-events-none"
                            >
                              {item.label}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          {/* Subscription status */}
          {user && !loading && (
            <div className={`border-t border-gray-200 p-3 ${hideWhenCollapsed}`}>
              {subscription ? (
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${subscriptionTone.dot}`} aria-hidden="true" />
                    <p className="text-sm font-semibold text-gray-900">{subscriptionTone.label}</p>
                  </div>
                  <dl className="mt-2 pl-4 space-y-1 text-xs text-gray-600">
                    {subscription.plan && (
                      <div className="flex justify-between gap-2">
                        <dt>Plan</dt>
                        <dd className="font-medium text-gray-900 capitalize">{subscription.plan}</dd>
                      </div>
                    )}
                    {subscription.billingCycle && (
                      <div className="flex justify-between gap-2">
                        <dt>Billing</dt>
                        <dd className="font-medium text-gray-900">{subscription.billingCycle === 'monthly' ? 'Monthly' : 'Yearly'}</dd>
                      </div>
                    )}
                    {subscription.expiresAt && (
                      <div className="flex justify-between gap-2">
                        <dt>Expires</dt>
                        <dd className="font-mono font-medium text-gray-900 tabular-nums">
                          {new Date(subscription.expiresAt).toLocaleDateString()}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {subscription.status === 'active' && subscription.expiresAt && (
                    <p className="mt-2 pl-4 text-xs font-medium text-brand-teal-dark">
                      <span className="font-mono tabular-nums">{daysUntil(subscription.expiresAt)}</span> days remaining
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0 bg-gray-400" aria-hidden="true" />
                    <p className="text-sm font-semibold text-gray-900">No active plan</p>
                  </div>
                  <p className="mt-1 pl-4 text-xs text-gray-600">Upgrade to access premium features</p>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
