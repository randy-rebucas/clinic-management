'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSetting } from '../SettingsContext';

interface DashboardData {
  period: string;
  dateRange: {
    start: string;
    end: string;
  };
  overview: {
    totalPatients: number;
    totalDoctors: number;
    todayAppointments: number;
    periodAppointments: number;
    periodVisits: number;
    periodRevenue: number;
    periodBilled: number;
    totalOutstanding: number;
    outstandingInvoiceCount: number;
  };
  recentAppointments: Array<{
    _id: string;
    appointmentCode: string;
    patient: string;
    doctor: string;
    date: string;
    time: string;
    status: string;
  }>;
  upcomingAppointments: Array<{
    _id: string;
    appointmentCode: string;
    patient: string;
    doctor: string;
    date: string;
    time: string;
    status: string;
  }>;
  paymentMethodBreakdown: Record<string, number>;
}

export default function AdminDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const router = useRouter();
  const currency = useSetting('billingSettings.currency', 'USD');

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const res = await fetch(`/api/reports/dashboard/role-based?period=${period}`);

        if (res.status === 401) {
          router.push('/login');
          return;
        }

        if (!res.ok) {
          throw new Error(`Dashboard API error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch dashboard data');
        }

        setDashboardData(data.data);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [router, period]);

  if (loading || !dashboardData) {
    return (
      <section className="py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-3 min-h-[50vh] justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </section>
    );
  }
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const statCards = [
    {
      title: 'Total Patients',
      value: dashboardData.overview.totalPatients,
      href: '/patients',
      iconColor: 'blue',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      title: 'Today\'s Appointments',
      value: dashboardData.overview.todayAppointments,
      href: '/appointments',
      iconColor: 'amber',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: period === 'today' ? 'Today\'s Visits' : period === 'week' ? 'This Week\'s Visits' : 'This Month\'s Visits',
      value: dashboardData.overview.periodVisits,
      href: '/visits',
      iconColor: 'green',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      title: 'Active Doctors',
      value: dashboardData.overview.totalDoctors,
      href: '/doctors',
      iconColor: 'purple',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      title: period === 'today' ? 'Today\'s Revenue' : period === 'week' ? 'This Week\'s Revenue' : 'This Month\'s Revenue',
      value: formatCurrency(dashboardData.overview.periodRevenue),
      href: '/invoices',
      iconColor: 'emerald',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: 'Outstanding Invoices',
      value: dashboardData.overview.outstandingInvoiceCount,
      subtitle: formatCurrency(dashboardData.overview.totalOutstanding),
      href: '/invoices?status=unpaid',
      iconColor: 'red',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
  ];

  const quickActions = [
    {
      title: 'Manage Users',
      href: '/admin/users',
      description: 'Manage user accounts and roles',
      iconColor: 'blue',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      title: 'Roles & Permissions',
      href: '/admin/roles',
      description: 'Configure roles and permissions',
      iconColor: 'purple',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      title: 'System Settings',
      href: '/settings',
      description: 'Configure system settings',
      iconColor: 'gray',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        </svg>
      ),
    },
    {
      title: 'View Reports',
      href: '/reports',
      description: 'View system reports and analytics',
      iconColor: 'teal',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  const getBadgeColor = (status: string) => {
    if (status === 'scheduled' || status === 'confirmed') return 'bg-green-100 text-green-800';
    if (status === 'completed') return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getIconBgColor = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-600',
      amber: 'bg-amber-600',
      green: 'bg-green-600',
      purple: 'bg-purple-600',
      emerald: 'bg-emerald-600',
      red: 'bg-red-600',
      gray: 'bg-gray-600',
      teal: 'bg-teal-600',
    };
    return colors[color] || 'bg-gray-600';
  };

  const getIconBgLight = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-100 text-blue-700',
      amber: 'bg-amber-100 text-amber-700',
      green: 'bg-green-100 text-green-700',
      purple: 'bg-purple-100 text-purple-700',
      emerald: 'bg-emerald-100 text-emerald-700',
      red: 'bg-red-100 text-red-700',
      gray: 'bg-gray-100 text-gray-700',
      teal: 'bg-teal-100 text-teal-700',
    };
    return colors[color] || 'bg-gray-100 text-gray-700';
  };

  return (
    <section className="py-6">
      <div className="container mx-auto px-4">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex justify-between items-center flex-col sm:flex-row gap-3">
            <div>
              <h1 className="text-3xl font-bold mb-1">Admin Dashboard</h1>
              <p className="text-sm text-gray-500">Complete system overview and management</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPeriod('today')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  period === 'today' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setPeriod('week')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  period === 'week' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setPeriod('month')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  period === 'month' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Month
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="flex gap-3 flex-wrap">
            {statCards.map((card) => (
              <Link key={card.title} href={card.href} className="flex-1 min-w-[200px]">
                <div className="bg-white border border-gray-200 rounded-lg p-4 relative overflow-hidden hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-grow">
                      <p className="text-xs text-gray-500 mb-1">{card.title}</p>
                      <p className="text-2xl font-bold">{card.value}</p>
                      {card.subtitle && (
                        <p className="text-xs text-gray-500 mt-1">{card.subtitle}</p>
                      )}
                    </div>
                    <div className="rounded-md p-2 bg-gray-100">
                      <div className={`rounded-md p-1.5 flex items-center justify-center ${getIconBgColor(card.iconColor)} text-white`}>
                        {card.icon}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Recent and Upcoming Appointments */}
          <div className="flex gap-3 flex-col lg:flex-row">
            {/* Recent Appointments */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 flex-1">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold">Today's Appointments</h2>
                <Link href="/appointments" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                  View all
                </Link>
              </div>
              <div className="flex flex-col gap-2">
                {dashboardData.recentAppointments.length > 0 ? (
                  dashboardData.recentAppointments.slice(0, 5).map((apt) => (
                    <Link key={apt._id} href={`/appointments/${apt._id}`}>
                      <div className="bg-gray-50 border border-gray-200 rounded-md p-3 hover:bg-gray-100 transition-colors">
                        <div className="flex justify-between items-center">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{apt.patient}</p>
                            <p className="text-xs text-gray-500">{apt.doctor}</p>
                          </div>
                          <div className="text-right ml-2">
                            <p className="text-xs font-medium">{formatTime(apt.time)}</p>
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getBadgeColor(apt.status)}`}>
                              {apt.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No appointments today
                  </p>
                )}
              </div>
            </div>

            {/* Upcoming Appointments */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 flex-1">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold">Upcoming Appointments</h2>
                <Link href="/appointments" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                  View all
                </Link>
              </div>
              <div className="flex flex-col gap-2">
                {dashboardData.upcomingAppointments.length > 0 ? (
                  dashboardData.upcomingAppointments.slice(0, 5).map((apt) => (
                    <Link key={apt._id} href={`/appointments/${apt._id}`}>
                      <div className="bg-gray-50 border border-gray-200 rounded-md p-3 hover:bg-gray-100 transition-colors">
                        <div className="flex justify-between items-center">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{apt.patient}</p>
                            <p className="text-xs text-gray-500">{apt.doctor}</p>
                          </div>
                          <div className="text-right ml-2">
                            <p className="text-xs font-medium">{formatDate(apt.date)}</p>
                            <p className="text-xs text-gray-500">{formatTime(apt.time)}</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No upcoming appointments
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2">Quick Actions</h2>
            <div className="flex gap-3 flex-wrap">
              {quickActions.map((action) => (
                <Link key={action.title} href={action.href} className="flex-1 min-w-[150px]">
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-3 cursor-pointer transition-all hover:shadow-md">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-md p-2 flex items-center justify-center ${getIconBgLight(action.iconColor)}`}>
                        {action.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold mb-1">{action.title}</p>
                        <p className="text-xs text-gray-500">{action.description}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
