'use client';

import { superAdminLogout } from '@/app/actions/super-admin-auth';

export default function LogoutButton() {
  return (
    <form action={superAdminLogout}>
      <button
        type="submit"
        className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
      >
        Logout
      </button>
    </form>
  );
}

