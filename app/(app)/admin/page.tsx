'use client';

import { useEffect, useState } from 'react';

interface Stat {
  label: string;
  value: string;
  change: string;
}

interface Service {
  service: string;
  status: 'Healthy' | 'Operational' | 'Error';
  color: 'green' | 'yellow' | 'red';
}

interface Activity {
  event: string;
  time: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stat[]>([
    { label: 'Total Users', value: '0', change: 'Loading...' },
    { label: 'Active Sessions', value: '0', change: 'Loading...' },
    { label: 'System Health', value: '0%', change: 'Loading...' },
    { label: 'Storage Used', value: '0 GB', change: 'Loading...' },
  ]);
  const [services, setServices] = useState<Service[]>([
    { service: 'Database', status: 'Healthy', color: 'green' },
    { service: 'API Server', status: 'Healthy', color: 'green' },
    { service: 'File Storage', status: 'Healthy', color: 'green' },
    { service: 'Email Service', status: 'Operational', color: 'green' },
  ]);
  const [activities, setActivities] = useState<Activity[]>([
    { event: 'Loading recent activity...', time: '', type: 'info' },
  ]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Fetch admin stats
        const statsRes = await fetch('/api/admin/stats');
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData.success && statsData.data) {
            setStats(statsData.data.stats || stats);
          }
        }

        // Fetch system health
        const healthRes = await fetch('/api/admin/health');
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          if (healthData.success) {
            setServices(healthData.data?.services || services);
          }
        }

        // Fetch recent activity
        const activityRes = await fetch('/api/admin/activity?limit=4');
        if (activityRes.ok) {
          const activityData = await activityRes.json();
          if (activityData.success && Array.isArray(activityData.data?.activities)) {
            setActivities(activityData.data.activities);
          }
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };

    fetchDashboardData();
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-base text-gray-600">System overview and management</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <p className="text-sm font-semibold text-gray-600 mb-3">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-900 mb-2">{stat.value}</p>
            <p className="text-xs font-medium text-gray-500">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Quick Access */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4 pb-3 border-b border-gray-200">Quick Links</h2>
          <div className="space-y-2">
            {[
              { label: 'Manage Users', href: '/admin/users' },
              { label: 'View Audit Logs', href: '/admin/audit-logs' },
              { label: 'Edit Settings', href: '/admin/settings' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="block px-4 py-3 bg-white border border-gray-200 rounded-lg font-semibold text-gray-900 hover:bg-gray-50 hover:border-gray-300 hover:text-blue-600 transition-all"
              >
                {link.label} →
              </a>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4 pb-3 border-b border-gray-200">System Status</h2>
          <div className="space-y-3">
            {services.map((item) => (
              <div key={item.service} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg">
                <span className="font-semibold text-gray-900 text-sm">{item.service}</span>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  item.color === 'green' ? 'bg-green-100 text-green-700' :
                  item.color === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-4 pb-3 border-b border-gray-200">Recent Activity</h2>
        <div className="space-y-3">
          {activities.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 px-2 -mx-2 rounded transition-colors">
              <div className="flex-1">
                <p className="font-medium text-gray-900 text-sm">{item.event}</p>
              </div>
              {item.time && (
                <span className="text-xs text-gray-500 font-medium ml-4 flex-shrink-0">{item.time}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
