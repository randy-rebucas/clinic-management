'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface DashboardData {
  period: string;
  overview: {
    totalPatients: number;
    todayAppointments: number;
    periodVisits: number;
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
  permissions: {
    canViewPatients: boolean;
    canViewAppointments: boolean;
    canViewVisits: boolean;
    canViewLabResults: boolean;
  };
}

export default function NurseDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const router = useRouter();

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
      <section className="py-4 px-4 sm:px-6 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-3 min-h-[50vh] justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-100 border-t-blue-600"></div>
            <p className="text-sm text-gray-500">Loading dashboard...</p>
          </div>
        </div>
      </section>
    );
  }

  const formatTime = (timeString: string) => {
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const statCards = [
    dashboardData.permissions.canViewPatients && {
      title: 'Patients',
      value: dashboardData.overview.totalPatients,
      href: '/patients',
      iconColor: 'blue',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    dashboardData.permissions.canViewAppointments && {
      title: 'Today&apos;s Appointments',
      value: dashboardData.overview.todayAppointments,
      href: '/appointments',
      iconColor: 'amber',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    dashboardData.permissions.canViewVisits && {
      title: period === 'today' ? 'Today&apos;s Visits' : period === 'week' ? 'This Week&apos;s Visits' : 'This Month&apos;s Visits',
      value: dashboardData.overview.periodVisits,
      href: '/visits',
      iconColor: 'green',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ].filter(Boolean);

  const quickActions = [
    dashboardData.permissions.canViewPatients && {
      title: 'New Patient',
      href: '/patients/new',
      description: 'Register a new patient',
      iconColor: 'blue',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      ),
    },
    dashboardData.permissions.canViewAppointments && {
      title: 'Schedule Appointment',
      href: '/appointments/new',
      description: 'Book a new appointment',
      iconColor: 'green',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    dashboardData.permissions.canViewVisits && {
      title: 'New Visit',
      href: '/visits/new',
      description: 'Create a new visit record',
      iconColor: 'teal',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    dashboardData.permissions.canViewLabResults && {
      title: 'Lab Results',
      href: '/lab-results',
      description: 'View and update lab results',
      iconColor: 'orange',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
  ].filter(Boolean);

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
      teal: 'bg-teal-600',
      orange: 'bg-orange-600',
    };
    return colors[color] || 'bg-gray-600';
  };

  const getIconBgLight = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-100 text-blue-700',
      amber: 'bg-amber-100 text-amber-700',
      green: 'bg-green-100 text-green-700',
      teal: 'bg-teal-100 text-teal-700',
      orange: 'bg-orange-100 text-orange-700',
    };
    return colors[color] || 'bg-gray-100 text-gray-700';
  };

  return (
    <section className="py-4 px-4 sm:px-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-pink-600 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-base font-semibold text-gray-900">Nurse Dashboard</h1>
                  <p className="text-xs text-gray-500">Patient care and clinical support overview</p>
                </div>
              </div>
              <div className="flex gap-1 bg-gray-100 p-0.5 rounded-md">
                <button
                  onClick={() => setPeriod('today')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                    period === 'today'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => setPeriod('week')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                    period === 'week'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setPeriod('month')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                    period === 'month'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Month
                </button>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {statCards.map((card: any) => {
              const accentClasses: Record<string, string> = {
                blue: 'border-l-blue-500',
                amber: 'border-l-amber-500',
                green: 'border-l-emerald-500',
                teal: 'border-l-teal-500',
                orange: 'border-l-orange-500',
              };
              return (
                <Link key={card.title} href={card.href} className="group">
                  <div className={`bg-white rounded-lg border border-gray-200 border-l-4 ${accentClasses[card.iconColor] || 'border-l-gray-400'} p-3.5 hover:shadow-md transition-all`}>
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex-grow min-w-0">
                        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">{card.title}</p>
                        <p className="text-2xl font-bold text-gray-900 mt-0.5">{card.value}</p>
                      </div>
                      <div className={`rounded-lg p-2 flex-shrink-0 ${getIconBgColor(card.iconColor)} text-white group-hover:scale-110 transition-transform`}>
                        {card.icon}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Today's Appointments */}
          {dashboardData.permissions.canViewAppointments && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="p-1 bg-blue-100 rounded">
                    <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-semibold text-gray-800">Today&apos;s Appointments</h2>
                </div>
                <Link href="/appointments" className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-0.5">
                  View all
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
              <div className="p-3">
                <div className="flex flex-col gap-1.5">
                  {dashboardData.recentAppointments.length > 0 ? (
                    dashboardData.recentAppointments.slice(0, 5).map((apt) => (
                      <Link key={apt._id} href={`/appointments/${apt._id}`}>
                        <div className="border border-gray-100 rounded-md px-3 py-2 hover:bg-blue-50 hover:border-blue-200 transition-all">
                          <div className="flex justify-between items-center">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{apt.patient}</p>
                              <p className="text-xs text-gray-500">{apt.doctor}</p>
                            </div>
                            <div className="text-right ml-2 flex-shrink-0">
                              <p className="text-xs font-medium text-gray-700">{formatTime(apt.time)}</p>
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium mt-0.5 ${getBadgeColor(apt.status)}`}>
                                {apt.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="text-center py-6">
                      <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-xs text-gray-500">No appointments today</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
              <div className="p-1 bg-teal-100 rounded">
                <svg className="w-3.5 h-3.5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-800">Quick Actions</h2>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {quickActions.map((action: any) => (
                  <Link key={action.title} href={action.href} className="group">
                    <div className="border border-gray-200 rounded-lg p-3 transition-all hover:border-blue-300 hover:bg-blue-50 h-full">
                      <div className="flex flex-col gap-2">
                        <div className={`rounded-md p-1.5 w-fit ${getIconBgLight(action.iconColor)} group-hover:scale-110 transition-transform`}>
                          {action.icon}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-800">{action.title}</p>
                          <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{action.description}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
