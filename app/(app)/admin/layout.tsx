'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const adminNavItems = [
  { label: 'Dashboard', href: '/app/admin', icon: '📊' },
  { label: 'Users', href: '/app/admin/users', icon: '👥' },
  { label: 'Roles', href: '/app/admin/roles', icon: '🔐' },
  { label: 'Audit Logs', href: '/app/admin/audit-logs', icon: '📋' },
  { label: 'Staff', href: '/app/admin/staff', icon: '👔' },
  { label: 'Medicines', href: '/app/admin/medicines', icon: '💊' },
  { label: 'Rooms', href: '/app/admin/rooms', icon: '🚪' },
  { label: 'Services', href: '/app/admin/services', icon: '⚙️' },
  { label: 'Subscriptions', href: '/app/admin/subscription', icon: '📱' },
  { label: 'Settings', href: '/app/admin/settings', icon: '⚡' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r-2 border-black flex flex-col">
        <div className="p-6 border-b-2 border-black">
          <h1 className="text-2xl font-black text-black">Admin</h1>
          <p className="text-xs font-bold text-gray-600 mt-1">System Management</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          {adminNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2 rounded-sm font-bold transition-colors ${
                  isActive
                    ? 'bg-black text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Back Button */}
        <div className="border-t-2 border-black p-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 w-full px-4 py-2 text-gray-700 border-2 border-black rounded-sm font-bold hover:bg-gray-100 transition-colors text-sm"
          >
            ← Back to App
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
