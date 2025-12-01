'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Modal } from './ui/Modal';

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
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; doctorId: string | null; doctorName: string }>({
    show: false,
    doctorId: null,
    doctorName: '',
  });
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
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch('/api/user/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          console.log(data.user.role);
          setCurrentUserRole(data.user.role);
        }
      }
    } catch (error) {
      console.error('Failed to fetch current user:', error);
    }
  };

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

  const handleDelete = async (doctorId: string) => {
    try {
      const res = await fetch(`/api/doctors/${doctorId}`, {
        method: 'DELETE',
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setDeleteConfirm({ show: false, doctorId: null, doctorName: '' });
        setSuccess('Doctor deleted successfully!');
        setTimeout(() => setSuccess(null), 3000);
        fetchDoctors();
      } else {
        setError('Error: ' + data.error);
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error('Failed to delete doctor:', error);
      setError('Failed to delete doctor');
      setTimeout(() => setError(null), 5000);
    }
  };

  const canDelete = currentUserRole === 'doctor' || currentUserRole === 'admin';


  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: '256px' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p>Loading doctors...</p>
          </div>
        </div>
      </section>
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

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Notifications */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">{success}</p>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold mb-1">Doctors & Staff</h1>
              <p className="text-sm text-gray-600">Manage doctor profiles, schedules, and performance</p>
            </div>
            <button 
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Add Doctor
            </button>
          </div>

          {/* View Mode Tabs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-1">
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Doctor Profiles
              </button>
              <button
                onClick={() => setViewMode('roster')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'roster'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Duty Roster
              </button>
              <button
                onClick={() => setViewMode('performance')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'performance'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Performance Reports
              </button>
            </div>
          </div>

      {/* Delete Confirmation Modal */}
      <Modal open={deleteConfirm.show} onOpenChange={(open) => {
        if (!open) setDeleteConfirm({ show: false, doctorId: null, doctorName: '' });
      }} className="max-w-md">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Doctor</h2>
          <p className="text-sm text-gray-700 mb-4">
            Are you sure you want to delete <strong>{deleteConfirm.doctorName}</strong>? This action cannot be undone and will also delete the associated user account.
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
            <button 
              type="button" 
              onClick={() => setDeleteConfirm({ show: false, doctorId: null, doctorName: '' })}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button 
              type="button"
              onClick={() => deleteConfirm.doctorId && handleDelete(deleteConfirm.doctorId)}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>

      {/* Form Modal */}
      <Modal open={showForm} onOpenChange={(open) => {
        if (!open) setShowForm(false);
      }} className="max-w-2xl">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Add New Doctor</h2>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-3 py-4">
              <div className="flex flex-col md:flex-row gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium mb-1">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Dr., Prof., etc."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium mb-1">First Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium mb-1">Last Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium mb-1">Email <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium mb-1">Phone <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium mb-1">Specialization <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.specialization}
                    onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium mb-1">License Number <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium mb-1">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="on-leave">On Leave</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  Add Doctor
                </button>
              </div>
            </div>
          </form>
        </div>
      </Modal>

      {/* List View */}
      {viewMode === 'list' && (
        <>
          {/* Search and Filters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="flex flex-col gap-2 p-3">
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search by name, specialization, or email..."
                  value={searchQuery || ''}
                  onChange={(e) => setSearchQuery(e.target.value || '')}
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <select
                  value={filterStatus || 'all'}
                  onChange={(e) => setFilterStatus(e.target.value || 'all')}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
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
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-center p-2 border-b border-gray-200">
              <h3 className="text-lg font-semibold">Doctors</h3>
              <p className="text-sm text-gray-600">
                {filteredDoctors.length} {filteredDoctors.length === 1 ? 'doctor' : 'doctors'}
              </p>
            </div>
            {filteredDoctors.length === 0 ? (
              <div className="p-6 text-center">
                <div className="text-4xl mb-2">👨‍⚕️</div>
                <h4 className="text-lg font-semibold mb-1">
                  {searchQuery || filterStatus !== 'all' ? 'No doctors match your filters' : 'No doctors found'}
                </h4>
                <p className="text-sm text-gray-600 mb-2">
                  {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Get started by adding your first doctor'}
                </p>
                {!searchQuery && filterStatus === 'all' && (
                  <button 
                    onClick={() => setShowForm(true)}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    Add First Doctor
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col">
                {filteredDoctors.map((doctor) => (
                  <div key={doctor._id} className="border-t border-gray-200 first:border-t-0">
                    <div className="flex justify-between items-start p-3 hover:bg-gray-50">
                      <div className="flex items-start gap-2 flex-1">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {doctor.firstName.charAt(0)}{doctor.lastName.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-bold">
                              {doctor.title || 'Dr.'} {doctor.firstName} {doctor.lastName}
                            </p>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                              doctor.status === 'active'
                                ? 'bg-green-100 text-green-800 border-green-200'
                                : doctor.status === 'inactive'
                                ? 'bg-gray-100 text-gray-800 border-gray-200'
                                : 'bg-yellow-100 text-yellow-800 border-yellow-200'
                            }`}>
                              {doctor.status || 'active'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">{doctor.specialization}</p>
                          {doctor.department && (
                            <p className="text-xs text-gray-600">{doctor.department}</p>
                          )}
                          <div className="flex flex-col gap-0.5 mt-1">
                            <p className="text-xs text-gray-600">{doctor.email}</p>
                            <p className="text-xs text-gray-600">{doctor.phone}</p>
                            <p className="text-xs text-gray-600">License: {doctor.licenseNumber}</p>
                            {doctor.schedule && doctor.schedule.length > 0 && (
                              <div className="mt-1">
                                <p className="text-xs font-medium mb-1">Schedule:</p>
                                <div className="flex gap-1 flex-wrap">
                                  {doctor.schedule
                                    .filter((s) => s.isAvailable)
                                    .map((s, idx) => (
                                      <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-blue-100 text-blue-800 border-blue-200">
                                        {getDayName(s.dayOfWeek).substring(0, 3)} {formatTime(s.startTime)}-{formatTime(s.endTime)}
                                      </span>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link 
                          href={`/doctors/${doctor._id}`}
                          className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors text-xs font-medium"
                        >
                          View →
                        </Link>
                        {canDelete && (
                          <button
                            onClick={() => setDeleteConfirm({
                              show: true,
                              doctorId: doctor._id,
                              doctorName: `${doctor.firstName} ${doctor.lastName}`,
                            })}
                            className="px-2.5 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors text-xs font-medium"
                          >
                            Delete
                          </button>
                        )}
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
      {viewMode === 'roster' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Doctor</th>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <th key={day} className="text-center py-2 px-3 text-sm font-semibold text-gray-700">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doctors.filter(d => d.status === 'active').map((doctor) => (
                  <tr key={doctor._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3">
                      <p className="text-sm font-medium">
                        {doctor.title || 'Dr.'} {doctor.firstName} {doctor.lastName}
                      </p>
                      <p className="text-xs text-gray-600">{doctor.specialization}</p>
                    </td>
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                      const schedule = doctor.schedule?.find((s) => s.dayOfWeek === day);
                      return (
                        <td key={day} className="text-center py-2 px-3">
                          {schedule && schedule.isAvailable ? (
                            <p className="text-xs text-green-600 font-medium">
                              {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-600">—</p>
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
      )}

      {/* Performance View */}
      {viewMode === 'performance' && (
        <div className="flex flex-col gap-2">
          {doctors.map((doctor) => {
            const metrics = doctor.performanceMetrics;
            const total = metrics?.totalAppointments || 0;
            const completed = metrics?.completedAppointments || 0;
            const cancellationRate = total > 0 ? ((metrics?.cancelledAppointments || 0) / total) * 100 : 0;
            const noShowRate = total > 0 ? ((metrics?.noShowAppointments || 0) / total) * 100 : 0;
            const completionRate = total > 0 ? (completed / total) * 100 : 0;

            return (
              <div key={doctor._id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {doctor.title || 'Dr.'} {doctor.firstName} {doctor.lastName}
                    </h3>
                    <p className="text-sm text-gray-600">{doctor.specialization}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link 
                      href={`/doctors/${doctor._id}`}
                      className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors text-xs font-medium"
                    >
                      View →
                    </Link>
                    {canDelete && (
                      <button
                        onClick={() => setDeleteConfirm({
                          show: true,
                          doctorId: doctor._id,
                          doctorName: `${doctor.firstName} ${doctor.lastName}`,
                        })}
                        className="px-2.5 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors text-xs font-medium"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <div>
                    <p className="text-xl font-bold">{total}</p>
                    <p className="text-xs text-gray-600">Total</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold">{completed}</p>
                    <p className="text-xs text-gray-600">Completed</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold">{completionRate.toFixed(1)}%</p>
                    <p className="text-xs text-gray-600">Completion Rate</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold">{cancellationRate.toFixed(1)}%</p>
                    <p className="text-xs text-gray-600">Cancellation Rate</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold">{noShowRate.toFixed(1)}%</p>
                    <p className="text-xs text-gray-600">No-Show Rate</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </div>
      </div>
    </section>
  );
}
