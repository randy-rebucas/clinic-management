'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The administration area's sections, as one bar under the app header. The app sidebar
 * leaves administration out, so this bar is how admins move between these pages.
 */
const SECTIONS = [
  { label: 'Overview', href: '/admin' },
  { label: 'Users', href: '/admin/users' },
  { label: 'Roles', href: '/admin/roles' },
  { label: 'Staff', href: '/admin/staff' },
  { label: 'Services', href: '/admin/services' },
  { label: 'Rooms', href: '/admin/rooms' },
  { label: 'Medicines', href: '/admin/medicines' },
  { label: 'Clinic settings', href: '/admin/settings' },
  { label: 'Subscription', href: '/admin/subscription' },
  { label: 'Backups', href: '/admin/backups' },
  { label: 'Audit log', href: '/admin/audit-logs' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <nav aria-label="Administration" className="border-b border-gray-200 bg-white">
        <ul className="flex gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((section) => {
            const active =
              section.href === '/admin' ? pathname === '/admin' : pathname === section.href || pathname.startsWith(`${section.href}/`);
            return (
              <li key={section.href} className="shrink-0">
                <Link
                  href={section.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative inline-flex items-center h-11 px-3 text-sm whitespace-nowrap transition-colors duration-150 rounded-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${
                    active ? 'font-semibold text-brand-teal-deep' : 'font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {section.label}
                  {active && <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-teal-dark" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">{children}</div>
    </div>
  );
}
