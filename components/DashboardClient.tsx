'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Stats {
  patients: number;
  appointments: number;
  doctors: number;
  todayAppointments: number;
}

export default function DashboardClient() {
  const [stats, setStats] = useState<Stats>({
    patients: 0,
    appointments: 0,
    doctors: 0,
    todayAppointments: 0,
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchStats() {
      try {
        const [patientsRes, appointmentsRes, doctorsRes] = await Promise.all([
          fetch('/api/patients'),
          fetch('/api/appointments'),
          fetch('/api/doctors'),
        ]);

        // Check for authentication errors
        if (patientsRes.status === 401 || appointmentsRes.status === 401 || doctorsRes.status === 401) {
          router.push('/login');
          return;
        }

        // Try to parse JSON responses (API routes return JSON even on errors)
        let patients, appointments, doctors;
        
        // Helper function to safely parse JSON or handle HTML errors
        const parseResponse = async (res: Response, name: string) => {
          try {
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              return await res.json();
            } else {
              // If not JSON, read as text to see the error
              const text = await res.text();
              console.error(`${name} API returned non-JSON response:`, text.substring(0, 500));
              return { success: false, error: `${name} API error: ${res.status} ${res.statusText}. Check server logs for details.` };
            }
          } catch (parseError: any) {
            console.error(`Error parsing ${name} response:`, parseError);
            return { success: false, error: `${name} API error: Failed to parse response` };
          }
        };
        
        patients = await parseResponse(patientsRes, 'Patients');
        appointments = await parseResponse(appointmentsRes, 'Appointments');
        doctors = await parseResponse(doctorsRes, 'Doctors');

        // Check if any API call failed
        if (!patients.success || !appointments.success || !doctors.success) {
          const errors = [];
          if (!patients.success) errors.push(`Patients: ${patients.error || 'Unknown error'}`);
          if (!appointments.success) errors.push(`Appointments: ${appointments.error || 'Unknown error'}`);
          if (!doctors.success) errors.push(`Doctors: ${doctors.error || 'Unknown error'}`);
          throw new Error(`API errors: ${errors.join(', ')}`);
        }

        const today = new Date().toISOString().split('T')[0];
        const todayAppointments = appointments.data?.filter((apt: any) => {
          const aptDate = new Date(apt.appointmentDate).toISOString().split('T')[0];
          return aptDate === today && apt.status === 'scheduled';
        }).length || 0;

        setStats({
          patients: patients.data?.length || 0,
          appointments: appointments.data?.length || 0,
          doctors: doctors.data?.length || 0,
          todayAppointments,
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Patients',
      value: stats.patients,
      href: '/patients',
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      title: 'Total Appointments',
      value: stats.appointments,
      href: '/appointments',
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-50',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      title: 'Today\'s Appointments',
      value: stats.todayAppointments,
      href: '/appointments',
      color: 'from-amber-500 to-amber-600',
      bgColor: 'bg-amber-50',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: 'Doctors',
      value: stats.doctors,
      href: '/doctors',
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
  ];

  const quickActions = [
    {
      title: 'Add New Patient',
      href: '/patients',
      description: 'Register a new patient',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      ),
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      hoverColor: 'hover:bg-blue-100',
    },
    {
      title: 'Schedule Appointment',
      href: '/appointments',
      description: 'Book a new appointment',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      hoverColor: 'hover:bg-green-100',
    },
    {
      title: 'Add Doctor',
      href: '/doctors',
      description: 'Register a new doctor',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      hoverColor: 'hover:bg-purple-100',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
            Dashboard
          </h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Welcome back! Here's an overview of your clinic.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          {statCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="group relative bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-200 overflow-hidden"
            >
              {/* Gradient Accent */}
              <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${card.color} opacity-10 rounded-bl-full transform translate-x-4 -translate-y-4 group-hover:opacity-20 transition-opacity`} />
              
              <div className="relative flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">{card.title}</p>
                  <p className="text-3xl font-bold text-gray-900">{card.value}</p>
                </div>
                <div className={`${card.bgColor} rounded-lg p-3 group-hover:scale-110 transition-transform duration-200`}>
                  <div className={`text-white bg-gradient-to-br ${card.color} rounded-lg p-2`}>
                    {card.icon}
                  </div>
                </div>
              </div>
              
              {/* Hover Arrow */}
              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {quickActions.map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className={`flex items-start space-x-4 p-4 rounded-lg border border-gray-200 ${action.hoverColor} transition-all duration-200 group`}
              >
                <div className={`${action.bgColor} ${action.color} rounded-lg p-3 group-hover:scale-110 transition-transform duration-200`}>
                  {action.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 mb-1">{action.title}</h3>
                  <p className="text-sm text-gray-600">{action.description}</p>
                </div>
                <svg className="w-5 h-5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
