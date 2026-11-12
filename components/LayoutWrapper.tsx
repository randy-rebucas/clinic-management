'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import ContentHeader from './ContentHeader';
import { useEffect, useState } from 'react';
import { useSidebar } from './SidebarContext';
import MessagingProvider from './messaging/MessagingProvider';
import ChatDock from './messaging/ChatDock';
import { ACCOUNT_UPDATED_EVENT } from './account/shared';

type HeaderUser = { id: string; name: string; role: string; email?: string };

interface LayoutWrapperProps {
  children: ReactNode;
  /** Read on the server by the (app) layout, so the header's controls are there from the first paint. */
  initialUser: HeaderUser;
}

export default function LayoutWrapper({ children, initialUser }: LayoutWrapperProps) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/book' || pathname === '/onboard';
  const { isCollapsed } = useSidebar();
  const [user, setUser] = useState<HeaderUser>(initialUser);

  // Follow the server if the signed-in account changes (e.g. after a platform "view as" switch).
  useEffect(() => {
    setUser(initialUser);
  }, [initialUser.id, initialUser.name, initialUser.role, initialUser.email]); // eslint-disable-line react-hooks/exhaustive-deps

  // The profile page reports a rename so the header's name and initials follow at once.
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const name = (e as CustomEvent<{ name?: string }>).detail?.name;
      if (name) setUser((prev) => ({ ...prev, name }));
    };
    window.addEventListener(ACCOUNT_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(ACCOUNT_UPDATED_EVENT, onUpdated);
  }, []);

  if (isAuthPage) {
    return <>{children}</>;
  }

  // Main content area with margin that adjusts based on sidebar state
  return (
    <MessagingProvider meId={user.id}>
      <div
        className={`min-h-screen bg-gray-50 transition-[margin] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isCollapsed ? 'lg:ml-20' : 'lg:ml-[280px]'
        }`}
      >
        <ContentHeader user={user} />
        <main id="main-content" tabIndex={-1} className="focus:outline-none">{children}</main>
      </div>
      <ChatDock />
    </MessagingProvider>
  );
}

