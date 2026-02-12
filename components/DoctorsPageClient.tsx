'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Modal } from './ui/Modal';
import { MEDICAL_SPECIALIZATIONS } from '@/lib/constants/specializations';

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization?: string; // Fallback for legacy data
  specializationId?: {
    _id: string;
    name: string;
    description?: string;
    category?: string;
  };
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
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showCustomSpecialization, setShowCustomSpecialization] = useState(false);
  const [specializations, setSpecializations] = useState<string[]>([]);
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
    department: 'No Department',
    status: 'active' as const,
    schedule: [] as Array<{ dayOfWeek: number; startTime: string; endTime: string; isAvailable: boolean }>,
  });
  const router = useRouter();

  useEffect(() => {
    fetchDoctors();
    fetchCurrentUser();
    fetchSpecializations();
  }, []);
  
  const fetchSpecializations = async () => {
    try {
      const res = await fetch('/api/specializations');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          // Extract names from specialization objects, fallback to hardcoded list
          const specNames = data.data.map((s: any) => s.name);
          setSpecializations(specNames.length > 0 ? specNames : MEDICAL_SPECIALIZATIONS);
        }
      } else {
        // Fallback to hardcoded list if API fails
        setSpecializations([]);
      }
    } catch (err) {
      console.error('Failed to fetch specializations:', err);
      // Fallback to hardcoded list
      setSpecializations([]);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch('/api/user/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          console.log(data.user.role);
          setCurrentUserRole(data.user.role);
          setCurrentUser(data.user);
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
        console.log('API response:', data);
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
          department: 'No Department',
          status: 'active',
          schedule: [],
        });
        setShowCustomSpecialization(false);
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

  const handleAddSelfAsDoctor = async () => {
    try {
      // Ensure doctors list is loaded
      if (loading) {
        await fetchDoctors();
      }

      // Fetch current user info if not already loaded
      let userData = currentUser;
      if (!userData) {
        const res = await fetch('/api/user/me');
        if (!res.ok) {
          setError('Failed to fetch user information');
          setTimeout(() => setError(null), 5000);
          return;
        }
        const data = await res.json();
        if (!data.success || !data.user) {
          setError('User information not available');
          setTimeout(() => setError(null), 5000);
          return;
        }
        userData = data.user;
        setCurrentUser(userData);
      }

      // Check if user already has a doctor profile
      if (userData.doctorProfile) {
        setError('You already have a doctor profile linked to your account');
        setTimeout(() => setError(null), 5000);
        return;
      }

      // Check if a doctor with this email already exists
      const existingDoctor = doctors.find(d => d.email.toLowerCase() === (userData.email || '').toLowerCase());
      if (existingDoctor) {
        setError('A doctor profile with your email already exists');
        setTimeout(() => setError(null), 5000);
        return;
      }

      // Pre-fill form with user information
      const nameParts = (userData.name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      setFormData({
        firstName: firstName,
        lastName: lastName,
        email: userData.email || '',
        phone: userData.phone || '',
        specialization: '',
        licenseNumber: '',
        title: 'Dr.',
        department: 'No Department',
        status: 'active',
        schedule: [],
      });
      setShowCustomSpecialization(false);

      setShowForm(true);
    } catch (error) {
      console.error('Failed to add self as doctor:', error);
      setError('Failed to add self as doctor');
      setTimeout(() => setError(null), 5000);
    }
  };


  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-4" style={{ minHeight: '400px' }}>
            <div className="relative">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-100 border-t-blue-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading doctors...</p>
          </div>
        </div>
      </section>
    );
  }

  const filteredDoctors = doctors.filter(doctor => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const name = `${doctor.firstName} ${doctor.lastName}`.toLowerCase();
      // Handle both specializationId (populated) and specialization (legacy)
      const specialization = (typeof doctor.specializationId === 'object' && doctor.specializationId?.name
        ? doctor.specializationId.name
        : doctor.specialization || '').toLowerCase();
      const email = (doctor.email || '').toLowerCase();
      if (!name.includes(query) && !specialization.includes(query) && !email.includes(query)) return false;
    }
    if (filterStatus !== 'all' && doctor.status !== filterStatus) return false;
    return true;
  });

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Notifications */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-green-800">{success}</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Doctors & Staff</h1>
                    <p className="text-sm sm:text-base text-gray-600 mt-1">Manage doctor profiles, schedules, and performance metrics</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button 
                  onClick={handleAddSelfAsDoctor}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 inline-flex items-center gap-2 shadow-md hover:shadow-lg font-medium text-sm"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Add Self as Doctor
                </button>
                <button 
                  onClick={() => setShowForm(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 inline-flex items-center gap-2 shadow-md hover:shadow-lg font-medium text-sm"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Doctor
                </button>
              </div>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-200 bg-gray-50/50">
              <button
                onClick={() => setViewMode('list')}
                className={`px-6 py-3 text-sm font-semibold transition-all duration-200 relative ${
                  viewMode === 'list'
                    ? 'text-blue-600 bg-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {viewMode === 'list' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600"></span>
                )}
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Doctor Profiles
                </span>
              </button>
              <button
                onClick={() => setViewMode('roster')}
                className={`px-6 py-3 text-sm font-semibold transition-all duration-200 relative ${
                  viewMode === 'roster'
                    ? 'text-blue-600 bg-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {viewMode === 'roster' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600"></span>
                )}
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Duty Roster
                </span>
              </button>
              <button
                onClick={() => setViewMode('performance')}
                className={`px-6 py-3 text-sm font-semibold transition-all duration-200 relative ${
                  viewMode === 'performance'
                    ? 'text-blue-600 bg-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {viewMode === 'performance' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600"></span>
                )}
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Performance Reports
                </span>
              </button>
            </div>
          </div>

      {/* Delete Confirmation Modal */}
      <Modal open={deleteConfirm.show} onOpenChange={(open) => {
        if (!open) setDeleteConfirm({ show: false, doctorId: null, doctorName: '' });
      }} className="max-w-md">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-100 rounded-full">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">Delete Doctor</h2>
          </div>
          <p className="text-sm text-gray-600 mb-6 leading-relaxed">
            Are you sure you want to delete <strong className="text-gray-900">{deleteConfirm.doctorName}</strong>? This action cannot be undone and will also delete the associated user account.
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button 
              type="button" 
              onClick={() => setDeleteConfirm({ show: false, doctorId: null, doctorName: '' })}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
            >
              Cancel
            </button>
            <button 
              type="button"
              onClick={() => deleteConfirm.doctorId && handleDelete(deleteConfirm.doctorId)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold shadow-md"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>

      {/* Form Modal */}
      <Modal open={showForm} onOpenChange={(open) => {
        if (!open) {
          setShowForm(false);
          setShowCustomSpecialization(false);
        }
      }} className="max-w-3xl">
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Add New Doctor</h2>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Dr., Prof., etc."
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">First Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Last Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Specialization <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={showCustomSpecialization ? 'Other' : formData.specialization}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'Other') {
                        setShowCustomSpecialization(true);
                        setFormData({ ...formData, specialization: '' });
                      } else {
                        setShowCustomSpecialization(false);
                        setFormData({ ...formData, specialization: value });
                      }
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white transition-all"
                  >
                    <option value="">Select Specialization</option>
                    {specializations.map((spec) => (
                      <option key={spec} value={spec}>
                        {spec}
                      </option>
                    ))}
                  </select>
                  {showCustomSpecialization && (
                    <input
                      type="text"
                      required
                      placeholder="Enter specialization"
                      value={formData.specialization}
                      onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                      className="w-full mt-2 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">License Number <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="No Department"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white transition-all"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="on-leave">On Leave</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-2">
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md"
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex flex-col gap-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search by name, specialization, or email..."
                  value={searchQuery || ''}
                  onChange={(e) => setSearchQuery(e.target.value || '')}
                  className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <select
                  value={filterStatus || 'all'}
                  onChange={(e) => setFilterStatus(e.target.value || 'all')}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white font-medium transition-all"
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
                    className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">Doctor Profiles</h3>
              <div className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                {filteredDoctors.length} {filteredDoctors.length === 1 ? 'doctor' : 'doctors'}
              </div>
            </div>
            {filteredDoctors.length === 0 ? (
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h4 className="text-lg font-bold text-gray-900 mb-2">
                  {searchQuery || filterStatus !== 'all' ? 'No doctors match your filters' : 'No doctors found'}
                </h4>
                <p className="text-sm text-gray-600 mb-4">
                  {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Get started by adding your first doctor'}
                </p>
                {!searchQuery && filterStatus === 'all' && (
                  <button 
                    onClick={() => setShowForm(true)}
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md"
                  >
                    Add First Doctor
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredDoctors.map((doctor) => (
                  <div key={doctor._id} className="p-4 sm:p-6 hover:bg-gray-50/50 transition-colors">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0 shadow-md">
                          {doctor.firstName.charAt(0)}{doctor.lastName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="text-lg font-bold text-gray-900">
                              {doctor.title || 'Dr.'} {doctor.firstName} {doctor.lastName}
                            </h4>
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                              doctor.status === 'active'
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : doctor.status === 'inactive'
                                ? 'bg-gray-100 text-gray-700 border border-gray-200'
                                : 'bg-amber-100 text-amber-700 border border-amber-200'
                            }`}>
                              {doctor.status || 'active'}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-700 mb-1">
                            {typeof doctor.specializationId === 'object' && doctor.specializationId?.name
                              ? doctor.specializationId.name
                              : doctor.specialization || 'Not specified'}
                          </p>
                          {doctor.department && doctor.department !== 'No Department' && (
                            <p className="text-xs text-gray-600 mb-2">{doctor.department}</p>
                          )}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-3 text-xs text-gray-600">
                            <div className="flex items-center gap-1.5">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              <span className="truncate">{doctor.email}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              <span>{doctor.phone}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span>License: {doctor.licenseNumber}</span>
                            </div>
                          </div>
                          {doctor.schedule && doctor.schedule.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold text-gray-700 mb-2">Schedule:</p>
                              <div className="flex flex-wrap gap-2">
                                {doctor.schedule
                                  .filter((s) => s.isAvailable)
                                  .map((s, idx) => (
                                    <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                      {getDayName(s.dayOfWeek).substring(0, 3)} {formatTime(s.startTime)}-{formatTime(s.endTime)}
                                    </span>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Link 
                          href={`/doctors/${doctor._id}`}
                          className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-semibold inline-flex items-center gap-1.5"
                        >
                          <span>View</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                        {/* // edit button */}
                        <Link
                          href={`/doctors/${doctor._id}/edit`}
                          className="px-4 py-2 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors text-sm font-semibold inline-flex items-center gap-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Edit</span>
                        </Link>
                        {/* // delete button */}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteConfirm({
                              show: true,
                              doctorId: doctor._id,
                              doctorName: `${doctor.firstName} ${doctor.lastName}`,
                            })}
                            className="px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-semibold inline-flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span>Delete</span>
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-200 bg-gray-50/50">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">Duty Roster</h3>
            <p className="text-sm text-gray-600 mt-1">Weekly schedule overview for active doctors</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-4 px-4 sm:px-6 text-sm font-bold text-gray-900 sticky left-0 bg-gray-50 z-10">Doctor</th>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <th key={day} className="text-center py-4 px-3 sm:px-4 text-sm font-bold text-gray-900 min-w-[100px]">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {doctors.filter(d => d.status === 'active').length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-sm font-medium text-gray-900">No active doctors</p>
                        <p className="text-xs text-gray-600">Add doctors to see their schedules</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  doctors.filter(d => d.status === 'active').map((doctor) => (
                    <tr key={doctor._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-4 sm:px-6 sticky left-0 bg-white z-10">
                        <p className="text-sm font-bold text-gray-900">
                          {doctor.title || 'Dr.'} {doctor.firstName} {doctor.lastName}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {typeof doctor.specializationId === 'object' && doctor.specializationId?.name
                            ? doctor.specializationId.name
                            : doctor.specialization || 'Not specified'}
                        </p>
                      </td>
                      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                        const schedule = doctor.schedule?.find((s) => s.dayOfWeek === day);
                        return (
                          <td key={day} className="text-center py-4 px-3 sm:px-4">
                            {schedule && schedule.isAvailable ? (
                              <div className="inline-flex flex-col items-center gap-1 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-200">
                                <p className="text-xs font-semibold text-emerald-700">
                                  {formatTime(schedule.startTime)}
                                </p>
                                <p className="text-xs font-semibold text-emerald-700">-</p>
                                <p className="text-xs font-semibold text-emerald-700">
                                  {formatTime(schedule.endTime)}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Performance View */}
      {viewMode === 'performance' && (
        <div className="grid grid-cols-1 gap-4">
          {doctors.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-2">No performance data available</h4>
              <p className="text-sm text-gray-600">Performance metrics will appear here once doctors have appointments</p>
            </div>
          ) : (
            doctors.map((doctor) => {
              const metrics = doctor.performanceMetrics;
              const total = metrics?.totalAppointments || 0;
              const completed = metrics?.completedAppointments || 0;
              const cancelled = metrics?.cancelledAppointments || 0;
              const noShow = metrics?.noShowAppointments || 0;
              const cancellationRate = total > 0 ? ((cancelled) / total) * 100 : 0;
              const noShowRate = total > 0 ? ((noShow) / total) * 100 : 0;
              const completionRate = total > 0 ? (completed / total) * 100 : 0;

              return (
                <div key={doctor._id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold shadow-md">
                        {doctor.firstName.charAt(0)}{doctor.lastName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          {doctor.title || 'Dr.'} {doctor.firstName} {doctor.lastName}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {typeof doctor.specializationId === 'object' && doctor.specializationId?.name
                            ? doctor.specializationId.name
                            : doctor.specialization || 'Not specified'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link 
                        href={`/doctors/${doctor._id}`}
                        className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-semibold inline-flex items-center gap-1.5"
                      >
                        <span>View</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                      {canDelete && (
                        <button
                          onClick={() => setDeleteConfirm({
                            show: true,
                            doctorId: doctor._id,
                            doctorName: `${doctor.firstName} ${doctor.lastName}`,
                          })}
                          className="px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-semibold inline-flex items-center gap-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200">
                      <p className="text-2xl sm:text-3xl font-bold text-blue-700 mb-1">{total}</p>
                      <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Total</p>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border border-emerald-200">
                      <p className="text-2xl sm:text-3xl font-bold text-emerald-700 mb-1">{completed}</p>
                      <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Completed</p>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200">
                      <p className="text-2xl sm:text-3xl font-bold text-purple-700 mb-1">{completionRate.toFixed(1)}%</p>
                      <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Completion</p>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl border border-amber-200">
                      <p className="text-2xl sm:text-3xl font-bold text-amber-700 mb-1">{cancellationRate.toFixed(1)}%</p>
                      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Cancelled</p>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-xl border border-red-200">
                      <p className="text-2xl sm:text-3xl font-bold text-red-700 mb-1">{noShowRate.toFixed(1)}%</p>
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">No-Show</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
        </div>
      </div>
    </section>
  );
}
