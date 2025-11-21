'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from './LogoutButton';
import { useSidebar } from './SidebarContext';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  category?: string;
}

interface SidebarProps {
  navItems: NavItem[];
  user: {
    name: string;
    role: string;
  } | null;
}

export default function Sidebar({ navItems, user }: SidebarProps) {
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const pathname = usePathname();

  // Group items by category
  const groupedItems = navItems.reduce((acc, item) => {
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
    <aside
      className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 transition-all duration-300 z-40 flex flex-col ${
        isCollapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Logo and Toggle */}
      <div className="flex items-center justify-between h-12 px-2.5 border-b border-gray-200">
        {!isCollapsed && (
          <Link href="/" className="flex items-center space-x-1.5 group flex-1 min-w-0">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-600 rounded-md flex items-center justify-center shadow-sm group-hover:shadow transition-shadow flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <span className="text-base font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent truncate">
              ClinicHub
            </span>
          </Link>
        )}
        {isCollapsed && (
          <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-600 rounded-md flex items-center justify-center shadow-sm mx-auto">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={isCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}
            />
          </svg>
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto py-2">
        <div className="space-y-0.5 px-1.5">
          {Object.entries(groupedItems).map(([category, items]) => (
            <div key={category}>
              {!isCollapsed && items.length > 0 && (
                <div className="px-2.5 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {category}
                </div>
              )}
              {items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md transition-colors group ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <svg
                      className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-500 group-hover:text-gray-700'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={item.icon}
                      />
                    </svg>
                    {!isCollapsed && (
                      <>
                        <span className="flex-1 text-sm truncate">{item.label}</span>
                        {isActive && (
                          <div className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0" />
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      {/* User Info and Logout - Redesigned Footer */}
      <div className="border-t border-gray-200 bg-gray-50">
        {!isCollapsed ? (
          <div className="p-2.5">
            <div className="flex items-center space-x-2 mb-2 p-2 rounded-md bg-white border border-gray-200">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm flex-shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate leading-tight">
                  {user.name}
                </p>
                <p className="text-[10px] text-gray-500 truncate leading-tight">
                  {user.role}
                </p>
              </div>
            </div>
            <LogoutButton collapsed={false} />
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-2 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <LogoutButton collapsed={true} />
          </div>
        )}
      </div>
    </aside>
  );
}

