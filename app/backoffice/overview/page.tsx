import { requireSuperAdmin } from '@/app/lib/auth-helpers';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function BackofficeOverview() {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch {
    redirect('/signin');
  }

  await connectDB();

  // Get system-wide statistics
  const [tenantCount, userCount, activeTenants] = await Promise.all([
    Tenant.countDocuments({}),
    User.countDocuments({}),
    Tenant.countDocuments({ status: 'active' }),
  ]);

  const recentTenants = await Tenant.find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .select('name subdomain status createdAt')
    .lean();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Super Admin Overview</h1>
        <p className="text-sm text-gray-600 mt-2">System-wide overview and management</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Tenants</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{tenantCount}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Tenants</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{activeTenants}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Users</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{userCount}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Tenants */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Recent Tenants</h2>
          <Link
            href="/tenants"
            className="text-sm font-medium text-purple-600 hover:text-purple-700"
          >
            View All →
          </Link>
        </div>
        <div className="p-6">
          {recentTenants.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No tenants found</p>
          ) : (
            <div className="space-y-4">
              {recentTenants.map((tenant: any) => (
                <div
                  key={tenant._id.toString()}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div>
                    <h3 className="font-semibold text-gray-900">{tenant.name}</h3>
                    <p className="text-sm text-gray-600">{tenant.subdomain}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        tenant.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {tenant.status}
                    </span>
                    <Link
                      href={`/tenants/${tenant._id.toString()}`}
                      className="text-sm font-medium text-purple-600 hover:text-purple-700"
                    >
                      View →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

