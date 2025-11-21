'use client';

import { logout } from '@/app/actions/auth';

interface LogoutButtonProps {
  collapsed?: boolean;
}

export default function LogoutButton({ collapsed = false }: LogoutButtonProps) {
  return (
    <form action={logout} className="w-full">
      <button
        type="submit"
        className={`w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors border border-red-200 hover:border-red-300 ${
          collapsed ? 'px-1.5' : ''
        }`}
        title={collapsed ? 'Logout' : undefined}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        {!collapsed && <span className="truncate">Logout</span>}
      </button>
    </form>
  );
}

