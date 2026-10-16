'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions/auth';
import Link from 'next/link';
import { useSidebar } from './SidebarContext';
import { UNREAD_EVENT } from '@/lib/notification-kinds';

interface ContentHeaderProps {
  user: {
    name: string;
    role: string;
    email?: string;
  } | null;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-1';

const MENU_ITEM =
  'w-full px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 rounded-md transition-colors flex items-center gap-2.5 focus-visible:outline-none focus-visible:bg-gray-50 focus-visible:text-gray-900';

const OBJECT_ID = /^[a-f0-9]{24}$/i;

function segmentLabel(segment: string) {
  if (OBJECT_ID.test(segment)) return 'Details';
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

export default function ContentHeader({ user }: ContentHeaderProps) {
  const pathname = usePathname();
  const { isMobileOpen, setIsMobileOpen } = useSidebar();
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const isNotificationsActive = pathname === '/notifications';

  useEffect(() => {
    if (!user) return;

    const controller = new AbortController();

    const fetchUnreadCount = async () => {
      try {
        const response = await fetch('/api/notifications/unread-count', { signal: controller.signal });
        const data = await response.json();
        if (data.success) {
          setUnreadCount(data.data.unreadCount || 0);
        }
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Error fetching unread count:', error);
        }
      }
    };

    fetchUnreadCount();
    // Refresh every 30 seconds while the tab is visible, and at once when it becomes visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchUnreadCount();
    }, 30000);
    const onVisible = () => document.visibilityState === 'visible' && fetchUnreadCount();
    // The notifications page reports changes it makes, so the count follows at once.
    const onUnread = (e: Event) => {
      const n = (e as CustomEvent<number>).detail;
      if (typeof n === 'number') setUnreadCount(n);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(UNREAD_EVENT, onUnread);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(UNREAD_EVENT, onUnread);
      controller.abort();
    };
  }, [user]);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!dropdownOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDropdownOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  const segments = (pathname || '').split('/').filter(Boolean);
  const onDashboard = segments.length === 0 || (segments.length === 1 && segments[0] === 'dashboard');

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200">
      <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
        {/* Left side - menu toggle + breadcrumb */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            aria-label="Open navigation"
            aria-expanded={isMobileOpen}
            aria-controls="app-sidebar"
            className={`lg:hidden -ml-1.5 p-2 rounded-md text-gray-700 hover:bg-gray-100 transition-colors shrink-0 ${FOCUS_RING}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex items-center gap-1.5 text-sm min-w-0">
              <li className="shrink-0">
                {onDashboard ? (
                  <span className="font-semibold text-gray-900" aria-current="page">Dashboard</span>
                ) : (
                  <Link href="/" className={`text-gray-500 hover:text-brand-teal-dark font-medium transition-colors rounded ${FOCUS_RING}`}>
                    Dashboard
                  </Link>
                )}
              </li>
              {!onDashboard &&
                segments.map((segment, index) => {
                  const href = '/' + segments.slice(0, index + 1).join('/');
                  const isLast = index === segments.length - 1;
                  return (
                    <li key={href} className={`flex items-center gap-1.5 min-w-0 ${isLast ? '' : 'hidden sm:flex'}`}>
                      <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5l7 7-7 7" />
                      </svg>
                      {isLast ? (
                        <span className="font-semibold text-gray-900 truncate" aria-current="page">
                          {segmentLabel(segment)}
                        </span>
                      ) : (
                        <Link
                          href={href}
                          className={`text-gray-500 hover:text-brand-teal-dark font-medium transition-colors truncate rounded ${FOCUS_RING}`}
                        >
                          {segmentLabel(segment)}
                        </Link>
                      )}
                    </li>
                  );
                })}
            </ol>
          </nav>
        </div>

        {/* Right side - notifications, user menu */}
        {user && (
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Link
              href="/notifications"
              className={`relative p-2 rounded-md transition-colors ${FOCUS_RING} ${
                isNotificationsActive
                  ? 'text-brand-teal-dark bg-brand-teal-light'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
              title="Notifications"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              aria-current={isNotificationsActive ? 'page' : undefined}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[1.25rem] h-5 px-1 font-mono text-xs font-semibold text-white bg-red-600 rounded-full ring-2 ring-white tabular-nums"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>

            <div className="w-px h-6 bg-gray-200 mx-1" aria-hidden="true" />

            {/* User menu */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-label={`User menu for ${user.name}`}
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
                className={`flex items-center gap-3 p-1 sm:pl-3 rounded-md hover:bg-gray-100 transition-colors ${FOCUS_RING}`}
              >
                <span className="text-right hidden sm:block">
                  <span className="block text-sm font-semibold text-gray-900 leading-tight">{user.name}</span>
                  <span className="block text-xs text-gray-500 capitalize leading-tight mt-0.5">{user.role}</span>
                </span>
                <span
                  aria-hidden="true"
                  className="w-9 h-9 rounded-md bg-brand-teal-dark flex items-center justify-center text-white text-sm font-semibold shrink-0"
                >
                  {initials(user.name)}
                </span>
              </button>

              {dropdownOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-60 bg-white rounded-lg border border-gray-200 shadow-[0_8px_30px_rgb(15,23,42,0.1)] z-50 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{user.email || user.role}</p>
                  </div>

                  <div className="p-1.5">
                    <Link href="/profile" role="menuitem" onClick={() => setDropdownOpen(false)} className={MENU_ITEM}>
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Profile
                    </Link>

                    <Link href="/settings" role="menuitem" onClick={() => setDropdownOpen(false)} className={MENU_ITEM}>
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Settings
                    </Link>

                    {isAdmin && (
                      <Link href="/admin" role="menuitem" onClick={() => setDropdownOpen(false)} className={MENU_ITEM}>
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        Admin
                      </Link>
                    )}
                  </div>

                  <form action={logout} className="p-1.5 border-t border-gray-100">
                    <button
                      type="submit"
                      role="menuitem"
                      className="w-full px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 rounded-md transition-colors flex items-center gap-2.5 focus-visible:outline-none focus-visible:bg-red-50 focus-visible:text-red-700"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
