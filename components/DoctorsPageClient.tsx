'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization: string;
  licenseNumber: string;
  title?: string;
  department?: string;
  status?: 'active' | 'inactive' | 'on-leave';
  schedule?: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }>;
  performanceMetrics?: {
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
    averageRating?: number;
  };
}

export default function DoctorsPageClient() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'roster' | 'performance'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    specialization: '',
    licenseNumber: '',
    title: '',
    department: '',
    status: 'active' as const,
    schedule: [] as Array<{ dayOfWeek: number; startTime: string; endTime: string; isAvailable: boolean }>,
  });
  const router = useRouter();

  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    try {
      const res = await fetch('/api/doctors');
      
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      
      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        data = { success: false, error: `API error: ${res.status} ${res.statusText}` };
      }
      if (data.success) {
        setDoctors(data.data);
      } else {
        console.error('Failed to fetch doctors:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch doctors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/doctors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        setError('Failed to create doctor: API error');
        setTimeout(() => setError(null), 5000);
        return;
      }
      if (data.success) {
        setShowForm(false);
        setFormData({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          specialization: '',
          licenseNumber: '',
          title: '',
          department: '',
          status: 'active',
          schedule: [],
        });
        setSuccess('Doctor added successfully!');
        setTimeout(() => setSuccess(null), 3000);
        fetchDoctors();
      } else {
        setError('Error: ' + data.error);
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error('Failed to create doctor:', error);
      setError('Failed to create doctor');
      setTimeout(() => setError(null), 5000);
    }
  };

  const getDayName = (dayOfWeek: number) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek];
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      case 'on-leave':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-3 text-sm text-gray-600">Loading doctors...</p>
          </div>
        </div>
      </div>
    );
  }

  const filteredDoctors = doctors.filter(doctor => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const name = `${doctor.firstName} ${doctor.lastName}`.toLowerCase();
      const specialization = (doctor.specialization || '').toLowerCase();
      const email = (doctor.email || '').toLowerCase();
      if (!name.includes(query) && !specialization.includes(query) && !email.includes(query)) return false;
    }
    if (filterStatus !== 'all' && doctor.status !== filterStatus) return false;
    return true;
  });

  // Duty Roster View
  const renderRosterView = () => {
    const daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left text-xs font-semibold text-gray-700 uppercase">Doctor</th>
                {dayNames.map((day, index) => (
                  <th key={index} className="px-2 py-1 text-center text-xs font-semibold text-gray-700 uppercase">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {doctors.filter(d => d.status === 'active').map((doctor) => (
                <tr key={doctor._id} className="hover:bg-gray-50">
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <div className="text-xs font-medium text-gray-900">
                      {doctor.title || 'Dr.'} {doctor.firstName} {doctor.lastName}
                    </div>
                    <div className="text-xs text-gray-500">{doctor.specialization}</div>
                  </td>
                  {daysOfWeek.map((day) => {
                    const schedule = doctor.schedule?.find((s) => s.dayOfWeek === day);
                    return (
                      <td key={day} className="px-2 py-1.5 text-center">
                        {schedule && schedule.isAvailable ? (
                          <div className="text-xs">
                            <div className="text-green-600 font-medium">
                              {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Performance View
  const renderPerformanceView = () => {
    return (
      <div className="space-y-2">
        {doctors.map((doctor) => {
          const metrics = doctor.performanceMetrics;
          const total = metrics?.totalAppointments || 0;
          const completed = metrics?.completedAppointments || 0;
          const cancelled = metrics?.cancelledAppointments || 0;
          const noShow = metrics?.noShowAppointments || 0;
          const completionRate = total > 0 ? (completed / total) * 100 : 0;
          const cancellationRate = total > 0 ? (cancelled / total) * 100 : 0;
          const noShowRate = total > 0 ? (noShow / total) * 100 : 0;

          return (
            <div key={doctor._id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-2.5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-xs font-semibold text-gray-900">
                    {doctor.title || 'Dr.'} {doctor.firstName} {doctor.lastName}
                  </h3>
                  <p className="text-xs text-gray-600">{doctor.specialization}</p>
                </div>
                <Link
                  href={`/doctors/${doctor._id}`}
                  className="text-blue-600 hover:text-blue-800 text-xs font-medium hover:underline"
                >
                  View →
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div>
                  <div className="text-sm font-bold text-gray-900">{total}</div>
                  <div className="text-xs text-gray-600">Total</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-green-600">{completed}</div>
                  <div className="text-xs text-gray-600">Completed</div>
                  <div className="text-xs text-gray-500">{Math.round(completionRate)}%</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-red-600">{cancelled}</div>
                  <div className="text-xs text-gray-600">Cancelled</div>
                  <div className="text-xs text-gray-500">{Math.round(cancellationRate)}%</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-yellow-600">{noShow}</div>
                  <div className="text-xs text-gray-600">No-Show</div>
                  <div className="text-xs text-gray-500">{Math.round(noShowRate)}%</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-3">
        {/* Notifications */}
        {error && (
          <div className="mb-2 bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-lg flex items-center justify-between">
            <span className="text-xs">{error}</span>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {success && (
          <div className="mb-2 bg-green-50 border border-green-200 text-green-800 px-3 py-2 rounded-lg flex items-center justify-between">
            <span className="text-xs">{success}</span>
            <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-800">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-0.5">Doctors & Staff</h1>
            <p className="text-gray-600 text-xs">Manage doctor profiles, schedules, and performance</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors mt-1.5 sm:mt-0"
          >
            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Doctor
          </button>
        </div>

        {/* View Mode Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-2">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setViewMode('list')}
                className={`py-1.5 px-2.5 text-xs font-medium border-b-2 transition-colors ${
                  viewMode === 'list'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Doctor Profiles
              </button>
              <button
                onClick={() => setViewMode('roster')}
                className={`py-1.5 px-2.5 text-xs font-medium border-b-2 transition-colors ${
                  viewMode === 'roster'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Duty Roster
              </button>
              <button
                onClick={() => setViewMode('performance')}
                className={`py-1.5 px-2.5 text-xs font-medium border-b-2 transition-colors ${
                  viewMode === 'performance'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Performance Reports
              </button>
            </nav>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowForm(false)} />
              <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-3 max-w-2xl w-full z-10 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-sm font-semibold text-gray-900">Add New Doctor</h2>
                  <button
                    onClick={() => setShowForm(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Dr., Prof., etc."
                        className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">First Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Last Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Phone *</label>
                      <input
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Specialization *</label>
                      <input
                        type="text"
                        required
                        value={formData.specialization}
                        onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                        className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">License Number *</label>
                      <input
                        type="text"
                        required
                        value={formData.licenseNumber}
                        onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                        className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                      <input
                        type="text"
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                        className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="on-leave">On Leave</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-2.5 py-1 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-2.5 py-1 border border-transparent rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                    >
                      Add Doctor
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <>
            {/* Search and Filters */}
            <div className="mb-2 space-y-1.5">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by name, specialization, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full px-2.5 py-1 pl-8 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
                <svg className="absolute left-2 top-1 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="block px-2 py-1 text-xs border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on-leave">On Leave</option>
                </select>
                {(searchQuery || filterStatus !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setFilterStatus('all');
                    }}
                    className="text-xs text-gray-600 hover:text-gray-900 font-medium inline-flex items-center gap-1 px-2 py-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-2.5 py-1.5 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xs font-semibold text-gray-900">Doctors</h2>
                <span className="text-xs text-gray-500">
                  {filteredDoctors.length} {filteredDoctors.length === 1 ? 'doctor' : 'doctors'}
                </span>
              </div>
              {filteredDoctors.length === 0 ? (
                <div className="px-2 py-6 text-center">
                  <svg className="mx-auto w-8 h-8 text-gray-400 mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p className="text-xs font-medium text-gray-900 mb-0.5">
                    {searchQuery || filterStatus !== 'all' ? 'No doctors match your filters' : 'No doctors found'}
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Get started by adding your first doctor'}
                  </p>
                  {!searchQuery && filterStatus === 'all' && (
                    <button
                      onClick={() => setShowForm(true)}
                      className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add First Doctor
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredDoctors.map((doctor) => (
                    <div key={doctor._id} className="p-2.5 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-semibold">
                              {doctor.firstName.charAt(0)}{doctor.lastName.charAt(0)}
                            </div>
                            <div className="flex-1">
                              <h3 className="text-sm font-semibold text-gray-900">
                                {doctor.title || 'Dr.'} {doctor.firstName} {doctor.lastName}
                              </h3>
                              <p className="text-xs text-gray-600">{doctor.specialization}</p>
                              {doctor.department && (
                                <p className="text-xs text-gray-500">{doctor.department}</p>
                              )}
                            </div>
                            <span className={`px-1 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(doctor.status)}`}>
                              {doctor.status || 'active'}
                            </span>
                          </div>
                          <div className="ml-10 space-y-0.5">
                            <p className="text-xs text-gray-600">{doctor.email}</p>
                            <p className="text-xs text-gray-600">{doctor.phone}</p>
                            <p className="text-xs text-gray-500">License: {doctor.licenseNumber}</p>
                            {doctor.schedule && doctor.schedule.length > 0 && (
                              <div className="mt-1">
                                <p className="text-xs font-medium text-gray-700 mb-0.5">Schedule:</p>
                                <div className="flex flex-wrap gap-1">
                                  {doctor.schedule
                                    .filter((s) => s.isAvailable)
                                    .map((s, idx) => (
                                      <span key={idx} className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                                        {getDayName(s.dayOfWeek).substring(0, 3)} {formatTime(s.startTime)}-{formatTime(s.endTime)}
                                      </span>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="ml-2">
                          <Link
                            href={`/doctors/${doctor._id}`}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
                          >
                            View →
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Roster View */}
        {viewMode === 'roster' && renderRosterView()}

        {/* Performance View */}
        {viewMode === 'performance' && renderPerformanceView()}
      </div>
    </div>
  );
}
