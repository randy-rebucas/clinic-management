'use client';

import { logout } from '@/app/actions/auth';
import { Button } from '@radix-ui/themes';

interface LogoutButtonProps {
  collapsed?: boolean;
}

export default function LogoutButton({ collapsed = false }: LogoutButtonProps) {
  return (
    <form action={logout} className="w-full">
      <Button
        type="submit"
        variant="soft"
        color="red"
        size={collapsed ? "1" : "2"}
        className="w-full"
        title={collapsed ? 'Logout' : undefined}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        {!collapsed && <span className="truncate">Logout</span>}
      </Button>
    </form>
  );
}

