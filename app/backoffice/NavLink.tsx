'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
}

export default function NavLink({ href, children }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={`text-sm font-medium transition-colors ${
        isActive
          ? 'text-purple-600 border-b-2 border-purple-600 pb-1'
          : 'text-gray-700 hover:text-purple-600'
      }`}
    >
      {children}
    </Link>
  );
}

