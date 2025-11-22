'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { useSidebar } from './SidebarContext';
import { Box } from '@radix-ui/themes';

interface LayoutWrapperProps {
  children: ReactNode;
}

export default function LayoutWrapper({ children }: LayoutWrapperProps) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname === '/book' || pathname === '/setup';
  const { isCollapsed } = useSidebar();

  if (isAuthPage) {
    return <>{children}</>;
  }

  // Main content area with left margin for sidebar using Radix layout
  // 224px (14rem) when expanded, 56px (3.5rem) when collapsed
  return (
    <Box
      minHeight="100vh"
      style={{
        marginLeft: isCollapsed ? '56px' : '224px',
        backgroundColor: 'var(--gray-2)',
        transition: 'margin-left 300ms ease',
      }}
    >
      {children}
    </Box>
  );
}

