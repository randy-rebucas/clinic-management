'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Modal } from './ui/Modal';

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

interface User {
  name: string;
  role: string;
  _id?: string;
  tenantId?: string;
}

interface MobileMenuProps {
  navItems: NavItem[];
  user: User | null;
}

/**
 * MobileMenu Component
 * 
 * Client-side mobile navigation menu component.
 * 
 * Tenant-scoped behavior:
 * - Receives pre-filtered navItems from Navigation.tsx (server component)
 * - Navigation.tsx already filters items based on tenant-scoped permissions
 * - This component adds defensive client-side filtering as a safety layer
 * - All permission checks are tenant-scoped at the server level
 */
export default function MobileMenu({ navItems, user }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  /**
   * Filter navigation items based on permissions (defensive client-side check)
   * 
   * Note: The Navigation component (server component) already filters items based on
   * tenant-scoped permissions using server-side permission checks. This client-side 
   * filtering is primarily for defensive programming and handling edge cases.
   * 
   * The server-side filtering in Navigation.tsx:
   * - Checks adminOnly items (tenant-scoped)
   * - Checks requiresPermission using hasPermission() with tenantId
   * - Only passes authorized items to this component
   */
  const filteredItems = navItems.filter(item => {
    // Double-check admin-only items (defensive programming)
    // Note: Admin role is tenant-scoped - if user.role === 'admin', they are admin for their tenant
    if (item.adminOnly) {
      if (!user || user.role !== 'admin') {
        return false;
      }
    }

    // If item requires permission but no user is present, hide it
    // (This should rarely happen as Navigation already filters, but safety first)
    if (item.requiresPermission && !user) {
      return false;
    }

    // All items passed from Navigation are already permission-checked (tenant-scoped)
    // This filter just adds an extra safety layer
    return true;
  });

  // Group items by category for better organization
  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = item.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  return (
    <>
      {/* Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
        aria-expanded={isOpen}
        className="p-2 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors"
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile Menu Overlay */}
      <Modal
        open={isOpen}
        onOpenChange={setIsOpen}
        className="max-w-full m-0 fixed top-16 left-0 right-0 bottom-0 rounded-none"
      >
        <div className="flex flex-col gap-2 p-4 h-full overflow-y-auto">
          {/* User Info */}
          {user && (
            <>
              <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold block overflow-hidden text-ellipsis whitespace-nowrap">
                      {user.name}
                    </p>
                    <p className="text-xs text-gray-500 block overflow-hidden text-ellipsis whitespace-nowrap capitalize">
                      {user.role}
                    </p>
                  </div>
                </div>
              </div>
              <hr className="border-gray-300" />
            </>
          )}

          {/* Navigation Items - Grouped by Category */}
          <div className="flex flex-col gap-1">
            {Object.entries(groupedItems).map(([category, items]) => (
              <div key={category}>
                {items.length > 0 && category !== 'Other' && (
                  <div className="px-2 py-1.5 mb-1">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      {category}
                    </span>
                  </div>
                )}
                {items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                    >
                      <div
                        className={`p-2 rounded-lg border transition-colors ${
                          isActive
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-transparent border-transparent hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                          </svg>
                          <span className={`text-sm flex-1 ${isActive ? 'font-bold text-blue-700' : 'font-normal text-gray-600'}`}>
                            {item.label}
                          </span>
                          {isActive && (
                            <div className="ml-auto w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
