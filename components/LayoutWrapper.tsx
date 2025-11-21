'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { useSidebar } from './SidebarContext';

interface LayoutWrapperProps {
  children: ReactNode;
}

export default function LayoutWrapper({ children }: LayoutWrapperProps) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname === '/book';
  const { isCollapsed } = useSidebar();

  if (isAuthPage) {
    return <>{children}</>;
  }

  // Main content area with left margin for sidebar (w-56 = 224px when expanded, w-14 = 56px when collapsed)
  return (
    <main className={`min-h-screen bg-gray-50 transition-all duration-300 ${isCollapsed ? 'ml-14' : 'ml-56'}`}>
      {children}
    </main>
  );
}

