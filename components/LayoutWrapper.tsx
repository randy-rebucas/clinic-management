'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import ContentHeader from './ContentHeader';
import { useEffect, useState } from 'react';

interface LayoutWrapperProps {
  children: ReactNode;
}

export default function LayoutWrapper({ children }: LayoutWrapperProps) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/book' || pathname === '/setup' || pathname === '/onboard' || pathname === '/patient/login';
  const [user, setUser] = useState<{ name: string; role: string; email?: string } | null>(null);

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

  // Main content area with left margin for sidebar (always expanded at 280px)
  return (
    <div
      className="min-h-screen bg-gray-50"
      style={{
        marginLeft: '280px',
      }}
    >
      <ContentHeader user={user} />
      <main>{children}</main>
    </div>
  );
}

