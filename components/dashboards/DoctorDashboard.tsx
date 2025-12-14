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
          // throw new Error(`Dashboard API error: ${res.status} ${res.statusText}`);
          console.log('Dashboard API response not ok:', res.status, res.statusText);
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
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-100 border-t-blue-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading dashboard...</p>
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
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Doctor Dashboard</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Your clinical overview and patient management</p>
                </div>
              </div>
              <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setPeriod('today')}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                    period === 'today' 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => setPeriod('week')}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                    period === 'week' 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setPeriod('month')}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                    period === 'month' 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Month
                </button>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {statCards.map((card: any) => {
              const gradientClasses: Record<string, string> = {
                blue: 'from-blue-50 to-blue-100',
                amber: 'from-amber-50 to-amber-100',
                green: 'from-emerald-50 to-emerald-100',
                purple: 'from-purple-50 to-purple-100',
                teal: 'from-teal-50 to-teal-100',
                orange: 'from-orange-50 to-orange-100',
              };
              const borderClasses: Record<string, string> = {
                blue: 'border-blue-200',
                amber: 'border-amber-200',
                green: 'border-emerald-200',
                purple: 'border-purple-200',
                teal: 'border-teal-200',
                orange: 'border-orange-200',
              };
              return (
                <Link key={card.title} href={card.href} className="group">
                  <div className={`bg-gradient-to-br ${gradientClasses[card.iconColor] || 'from-gray-50 to-gray-100'} rounded-xl border ${borderClasses[card.iconColor] || 'border-gray-200'} p-6 relative overflow-hidden hover:shadow-lg transition-all`}>
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-grow min-w-0">
                        <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">{card.title}</p>
                        <p className="text-3xl sm:text-4xl font-bold text-gray-900">{card.value}</p>
                      </div>
                      <div className={`rounded-xl p-3 bg-white/80 backdrop-blur-sm shadow-md group-hover:scale-110 transition-transform`}>
                        <div className={`rounded-lg p-2 flex items-center justify-center ${getIconBgColor(card.iconColor)} text-white`}>
                          {card.icon}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* My Appointments and Recent Visits */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* My Appointments */}
            {dashboardData.myAppointments && dashboardData.myAppointments.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-gray-200 bg-gray-50/50">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-100 rounded-lg">
                        <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900">My Today's Appointments</h2>
                    </div>
                    <Link href="/appointments" className="text-sm font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                      View all
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
                <div className="p-4 sm:p-6">
                  <div className="flex flex-col gap-3">
                    {dashboardData.myAppointments.map((apt) => (
                      <Link key={apt._id} href={`/appointments/${apt._id}`}>
                        <div className="bg-gradient-to-r from-gray-50 to-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-amber-300 transition-all">
                          <div className="flex justify-between items-center">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{apt.patient}</p>
                            </div>
                            <div className="text-right ml-3 flex-shrink-0">
                              <p className="text-xs font-semibold text-gray-900">{formatTime(apt.time)}</p>
                              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold mt-1 ${getBadgeColor(apt.status)}`}>
                                {apt.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* My Recent Visits */}
            {dashboardData.myVisits && dashboardData.myVisits.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-gray-200 bg-gray-50/50">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-emerald-100 rounded-lg">
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900">My Recent Visits</h2>
                    </div>
                    <Link href="/visits" className="text-sm font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                      View all
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
                <div className="p-4 sm:p-6">
                  <div className="flex flex-col gap-3">
                    {dashboardData.myVisits.map((visit) => (
                      <Link key={visit._id} href={`/visits/${visit._id}`}>
                        <div className="bg-gradient-to-r from-gray-50 to-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-emerald-300 transition-all">
                          <div className="flex justify-between items-center">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{visit.patient}</p>
                              <p className="text-xs text-gray-600 mt-0.5">{visit.diagnosis}</p>
                            </div>
                            <div className="text-right ml-3 flex-shrink-0">
                              <p className="text-xs font-semibold text-gray-900">{formatDate(visit.date)}</p>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-gray-200 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-teal-100 rounded-lg">
                  <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">Quick Actions</h2>
              </div>
            </div>
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {quickActions.map((action: any) => (
                  <Link key={action.title} href={action.href} className="group">
                    <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-5 cursor-pointer transition-all hover:shadow-lg hover:border-blue-300 h-full">
                      <div className="flex flex-col gap-3">
                        <div className={`rounded-xl p-3 w-fit ${getIconBgLight(action.iconColor)} group-hover:scale-110 transition-transform`}>
                          {action.icon}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900 mb-1">{action.title}</p>
                          <p className="text-xs text-gray-600 leading-relaxed">{action.description}</p>
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
