'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  category?: string;
  adminOnly?: boolean;
}

interface SidebarProps {
  navItems: NavItem[];
  user: {
    name: string;
    role: string;
  } | null;
}

export default function Sidebar({ navItems, user }: SidebarProps) {
  const pathname = usePathname();

  // Filter items based on user role (admin-only items)
  const filteredItems = navItems.filter(item => {
    if (item.adminOnly && user?.role !== 'admin') {
      return false;
    }
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

  // If no user, don't render sidebar (will redirect to login)
  if (!user) {
    return null;
  }

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
                ClinicHub
              </span>
            </div>
          </Link>
        </div>

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
      </div>
    </div>
  );
}
