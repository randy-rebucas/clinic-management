import { requireSuperAdmin } from '@/app/lib/auth-helpers';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function TenantsPage() {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch {
    redirect('/backoffice/signin');
  }

  await connectDB();

  const tenants = await Tenant.find({})
    .sort({ createdAt: -1 })
    .lean();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tenants Management</h1>
          <p className="text-sm text-gray-600 mt-2">Manage all tenants in the system</p>
        </div>
        <Link
          href="/backoffice/tenants/new"
          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-purple-700"
        >
          Create Tenant
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Subdomain
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                    No tenants found
                  </td>
                </tr>
              ) : (
                tenants.map((tenant: any) => (
                  <tr key={tenant._id.toString()} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-semibold text-gray-900">{tenant.name}</div>
                      {tenant.displayName && tenant.displayName !== tenant.name && (
                        <div className="text-sm text-gray-500">{tenant.displayName}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {tenant.subdomain}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          tenant.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : tenant.status === 'suspended'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(tenant.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link
                        href={`/backoffice/tenants/${tenant._id}`}
                        className="text-purple-600 hover:text-purple-700"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

