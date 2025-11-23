'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

interface LayoutWrapperProps {
  children: ReactNode;
}

export default function LayoutWrapper({ children }: LayoutWrapperProps) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname === '/book' || pathname === '/setup';

  if (isAuthPage) {
    return <>{children}</>;
  }

  // Main content area with left margin for sidebar (always expanded at 280px)
  return (
    <div
      className="min-h-screen bg-gray-50"
      style={{
        marginLeft: '280px',
      }}
    >
      {children}
    </div>
  );
}

