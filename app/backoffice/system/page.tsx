import { requireSuperAdmin } from '@/app/lib/auth-helpers';
import { redirect } from 'next/navigation';

export default async function SystemPage() {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch {
    redirect('/signin');
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">System Settings</h1>
        <p className="text-sm text-gray-600 mt-2">Manage system-wide configuration and settings</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">System Information</h2>
        <div className="space-y-4">
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-600">Environment</span>
            <span className="text-sm text-gray-900">{process.env.NODE_ENV || 'development'}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-600">Super Admin Email</span>
            <span className="text-sm text-gray-900">{session.email}</span>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-yellow-900 mb-2">Coming Soon</h3>
        <p className="text-sm text-yellow-800">
          System configuration, audit logs, and advanced settings will be available here.
        </p>
      </div>
    </div>
  );
}

