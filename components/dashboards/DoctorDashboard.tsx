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
  myAppointments?: Array<{
    _id: string;
    appointmentCode: string;
    patient: string;
    date: string;
    time: string;
    status: string;
  }>;
  myVisits?: Array<{
    _id: string;
    patient: string;
    date: string;
    diagnosis: string;
  }>;
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
    canViewPrescriptions: boolean;
    canViewLabResults: boolean;
  };
}

export default function DoctorDashboard() {
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
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-3 min-h-[50vh] justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </section>
    );
  }

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
    dashboardData.permissions.canViewPatients && {
      title: 'My Patients',
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
    dashboardData.permissions.canViewVisits && {
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
    dashboardData.permissions.canViewPrescriptions && {
      title: 'New Prescription',
      href: '/prescriptions/new',
      description: 'Create a new prescription',
      iconColor: 'purple',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-2.387a1 1 0 00-1.414 0l-3.293 3.293a1 1 0 01-1.414 0l-3.293-3.293a1 1 0 00-1.414 0L4.547 15.428a2 2 0 00-.547 1.022v4.55a2 2 0 002 2h12a2 2 0 002-2v-4.55a2 2 0 00-.547-1.022zM9 7h6m-6 4h6m-2 4h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    dashboardData.permissions.canViewLabResults && {
      title: 'Lab Results',
      href: '/lab-results',
      description: 'View lab test results',
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
      purple: 'bg-purple-600',
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
      purple: 'bg-purple-100 text-purple-700',
      teal: 'bg-teal-100 text-teal-700',
      orange: 'bg-orange-100 text-orange-700',
    };
    return colors[color] || 'bg-gray-100 text-gray-700';
  };

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex justify-between items-center flex-col sm:flex-row gap-3">
            <div>
              <h1 className="text-3xl font-bold mb-1">Doctor Dashboard</h1>
              <p className="text-sm text-gray-500">Your clinical overview and patient management</p>
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
            {statCards.map((card: any) => (
              <Link key={card.title} href={card.href} className="flex-1 min-w-[250px]">
                <div className="bg-white border border-gray-200 rounded-lg p-4 relative overflow-hidden hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-grow">
                      <p className="text-xs text-gray-500 mb-1">{card.title}</p>
                      <p className="text-2xl font-bold">{card.value}</p>
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

          {/* My Appointments and Recent Visits */}
          <div className="flex gap-3 flex-col lg:flex-row">
            {/* My Appointments */}
            {dashboardData.myAppointments && dashboardData.myAppointments.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 flex-1">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-semibold">My Today's Appointments</h2>
                  <Link href="/appointments" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                    View all
                  </Link>
                </div>
                <div className="flex flex-col gap-2">
                  {dashboardData.myAppointments.map((apt) => (
                    <Link key={apt._id} href={`/appointments/${apt._id}`}>
                      <div className="bg-gray-50 border border-gray-200 rounded-md p-3 hover:bg-gray-100 transition-colors">
                        <div className="flex justify-between items-center">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{apt.patient}</p>
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
                  ))}
                </div>
              </div>
            )}

            {/* My Recent Visits */}
            {dashboardData.myVisits && dashboardData.myVisits.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 flex-1">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-semibold">My Recent Visits</h2>
                  <Link href="/visits" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                    View all
                  </Link>
                </div>
                <div className="flex flex-col gap-2">
                  {dashboardData.myVisits.map((visit) => (
                    <Link key={visit._id} href={`/visits/${visit._id}`}>
                      <div className="bg-gray-50 border border-gray-200 rounded-md p-3 hover:bg-gray-100 transition-colors">
                        <div className="flex justify-between items-center">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{visit.patient}</p>
                            <p className="text-xs text-gray-500">{visit.diagnosis}</p>
                          </div>
                          <div className="text-right ml-2">
                            <p className="text-xs font-medium">{formatDate(visit.date)}</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2">Quick Actions</h2>
            <div className="flex gap-3 flex-wrap">
              {quickActions.map((action: any) => (
                <Link key={action.title} href={action.href} className="flex-1 min-w-[200px]">
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
