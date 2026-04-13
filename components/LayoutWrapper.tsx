'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import ContentHeader from './ContentHeader';
import { useEffect, useState } from 'react';
import { useSidebar } from './SidebarContext';

interface LayoutWrapperProps {
  children: ReactNode;
}

export default function LayoutWrapper({ children }: LayoutWrapperProps) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/book' || pathname === '/onboard' || pathname === '/patient/login';
  const { isCollapsed } = useSidebar();
  const [user, setUser] = useState<{ name: string; role: string; email?: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isAuthPage) {
      // Fetch user info for header
      fetch('/api/user/me')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.user) {
            // Handle role - can be object with name or string
            let roleName = 'user';
            if (typeof data.user.role === 'object' && data.user.role?.name) {
              roleName = data.user.role.name;
            } else if (typeof data.user.role === 'string') {
              roleName = data.user.role;
            }
            
            setUser({
              name: data.user.name,
              role: roleName,
              email: data.user.email,
            });
          }
        })
        .catch(err => console.error('Error fetching user:', err));
    }
  }, [isAuthPage]);

  if (isAuthPage) {
    return <>{children}</>;
  }

  // Main content area with margin that adjusts based on sidebar state
  return (
    <div
      className="min-h-screen bg-gray-50 transition-all duration-300"
      style={{
        marginLeft: mounted && isCollapsed ? '80px' : '280px',
      }}
    >
      <ContentHeader user={user} />
      <main>{children}</main>
    </div>
  );
}

