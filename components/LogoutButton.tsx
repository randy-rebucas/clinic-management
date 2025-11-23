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
        className={`w-full bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
          collapsed ? 'p-2' : 'py-2 px-3'
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

