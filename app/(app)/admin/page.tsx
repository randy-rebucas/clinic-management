export default function AdminDashboard() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-black text-black mb-2">Admin Dashboard</h1>
        <p className="text-lg text-gray-700 font-semibold">System overview and management</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Users', value: '1,234', change: '+12% today' },
          { label: 'Active Sessions', value: '89', change: '+5% today' },
          { label: 'System Health', value: '99.9%', change: 'Optimal' },
          { label: 'Storage Used', value: '45.2 GB', change: '+2.1 GB this week' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border-2 border-black rounded-sm p-6 shadow-md hover:shadow-lg transition-shadow">
            <p className="text-sm font-bold text-gray-600 mb-2">{stat.label}</p>
            <p className="text-3xl font-black text-black mb-2">{stat.value}</p>
            <p className="text-xs font-semibold text-gray-700">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Quick Access */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="text-xl font-black text-black mb-4 pb-4 border-b-2 border-black">Quick Links</h2>
          <div className="space-y-2">
            {[
              { label: 'Manage Users', href: '/app/admin/users' },
              { label: 'View Audit Logs', href: '/app/admin/audit-logs' },
              { label: 'Edit Settings', href: '/app/admin/settings' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="block px-4 py-3 bg-white border-2 border-black rounded-sm font-bold text-black hover:bg-black hover:text-white transition-colors"
              >
                {link.label} →
              </a>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-black text-black mb-4 pb-4 border-b-2 border-black">System Status</h2>
          <div className="space-y-3">
            {[
              { service: 'Database', status: 'Healthy', color: 'green' },
              { service: 'API Server', status: 'Healthy', color: 'green' },
              { service: 'File Storage', status: 'Healthy', color: 'green' },
              { service: 'Email Service', status: 'Operational', color: 'green' },
            ].map((item) => (
              <div key={item.service} className="flex items-center justify-between p-3 bg-white border-2 border-black rounded-sm">
                <span className="font-semibold text-gray-900">{item.service}</span>
                <span className={`text-xs font-bold px-2 py-1 rounded border border-${item.color}-900 bg-${item.color}-100 text-${item.color}-900`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border-2 border-black rounded-sm p-6 shadow-md">
        <h2 className="text-xl font-black text-black mb-4 pb-4 border-b-2 border-black">Recent Activity</h2>
        <div className="space-y-3">
          {[
            { event: 'New user created by Admin User', time: '2 hours ago', type: 'info' },
            { event: 'Backup completed successfully', time: '4 hours ago', type: 'success' },
            { event: 'Settings updated', time: '1 day ago', type: 'info' },
            { event: 'User role changed', time: '2 days ago', type: 'info' },
          ].map((item, idx) => (
            <div key={idx} className="flex items-start justify-between py-3 border-b border-gray-200 last:border-b-0">
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">{item.event}</p>
              </div>
              <span className="text-xs text-gray-600 font-semibold ml-4">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
