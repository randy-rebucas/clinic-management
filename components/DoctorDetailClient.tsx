'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Modal, AlertDialog } from './ui/Modal';

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization?: string;
  specializationId?: { _id: string; name: string };
  licenseNumber: string;
  title?: string;
  department?: string;
  status?: 'active' | 'inactive' | 'on-leave';
  bio?: string;
  qualifications?: string[];
  schedule?: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }>;
  availabilityOverrides?: Array<{
    date: string;
    isAvailable: boolean;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }>;
  internalNotes?: Array<{
    note: string;
    createdBy: {
      _id: string;
      name: string;
    };
    createdAt: string;
    isImportant: boolean;
  }>;
  performanceMetrics?: {
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
    averageRating?: number;
    lastUpdated: string;
  };
}

export default function DoctorDetailClient({ doctorId }: { doctorId: string }) {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteNoteDialogOpen, setDeleteNoteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'schedule' | 'notes' | 'performance'>('profile');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [newNote, setNewNote] = useState({ note: '', isImportant: false });
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    dayOfWeek: 0,
    startTime: '09:00',
    endTime: '17:00',
    isAvailable: true,
  });
  const router = useRouter();

  useEffect(() => {
    fetchDoctor();
  }, [doctorId]);

  const fetchDoctor = async () => {
    try {
      const res = await fetch(`/api/doctors/${doctorId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setDoctor(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch doctor:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/doctors/${doctorId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNote),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDoctor(data.data);
          setNewNote({ note: '', isImportant: false });
          setShowNoteForm(false);
          setSuccess('Note added successfully!');
          setTimeout(() => setSuccess(null), 3000);
        }
      }
    } catch (error) {
      console.error('Failed to add note:', error);
      setError('Failed to add note');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleDeleteNoteClick = (index: number) => {
    setNoteToDelete(index);
    setDeleteNoteDialogOpen(true);
  };

  const handleDeleteNote = async () => {
    if (noteToDelete === null) return;

    try {
      const res = await fetch(`/api/doctors/${doctorId}/notes?index=${noteToDelete}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDoctor(data.data);
          setSuccess('Note deleted successfully!');
          setTimeout(() => setSuccess(null), 3000);
        }
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
      setError('Failed to delete note');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleUpdateSchedule = async () => {
    if (!doctor) return;

    try {
      const updatedSchedule = [...(doctor.schedule || [])];
      const existingIndex = updatedSchedule.findIndex((s) => s.dayOfWeek === scheduleForm.dayOfWeek);
      
      if (existingIndex >= 0) {
        updatedSchedule[existingIndex] = scheduleForm;
      } else {
        updatedSchedule.push(scheduleForm);
      }

      const res = await fetch(`/api/doctors/${doctorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: updatedSchedule }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDoctor(data.data);
          setShowScheduleForm(false);
          setSuccess('Schedule updated successfully!');
          setTimeout(() => setSuccess(null), 3000);
        }
      }
    } catch (error) {
      console.error('Failed to update schedule:', error);
      setError('Failed to update schedule');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleRefreshPerformance = async () => {
    try {
      const res = await fetch(`/api/doctors/${doctorId}/performance`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // Update doctor's performance metrics
          fetchDoctor();
        }
      }
    } catch (error) {
      console.error('Failed to refresh performance:', error);
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

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-4" style={{ minHeight: '400px' }}>
            <div className="relative">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-100 border-t-blue-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading doctor...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!doctor) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-4" style={{ minHeight: '400px' }}>
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Doctor not found</h2>
            <Link 
              href="/doctors"
              className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md"
            >
              Back to Doctors
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const fullName = `${doctor.title || 'Dr.'} ${doctor.firstName} ${doctor.lastName}`;
  const specializationName = (typeof doctor.specializationId === 'object' && doctor.specializationId?.name)
    ? doctor.specializationId.name
    : doctor.specialization || '';
  const metrics = doctor.performanceMetrics;
  const total = metrics?.totalAppointments || 0;
  const completed = metrics?.completedAppointments || 0;
  const cancelled = metrics?.cancelledAppointments || 0;
  const noShow = metrics?.noShowAppointments || 0;
  const completionRate = total > 0 ? (completed / total) * 100 : 0;

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
            <div className="flex items-start gap-4">
              <Link 
                href="/doctors"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 mt-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold shadow-md flex-shrink-0">
                    {doctor.firstName.charAt(0)}{doctor.lastName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-1">{fullName}</h1>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-base text-gray-600">{doctor.specializationId?.name}</p>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                        doctor.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : doctor.status === 'inactive'
                          ? 'bg-gray-100 text-gray-700 border border-gray-200'
                          : 'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}>
                        {doctor.status || 'active'}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/doctors/${doctorId}/edit`}
                    className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md inline-flex items-center gap-2 flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 bg-gray-50/50 overflow-x-auto">
              <nav className="flex -mb-px min-w-max">
                {[
                  { value: 'profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                  { value: 'schedule', label: 'Schedule & Availability', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                  { value: 'notes', label: `Internal Notes (${doctor.internalNotes?.length || 0})`, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                  { value: 'performance', label: 'Performance', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' }
                ].map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => {
                      if (tab.value === 'performance') {
                        handleRefreshPerformance();
                      }
                      setActiveTab(tab.value as any);
                    }}
                    className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all duration-200 whitespace-nowrap relative ${
                      activeTab === tab.value
                        ? 'text-blue-600 bg-white'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {activeTab === tab.value && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600"></span>
                    )}
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                      </svg>
                      {tab.label}
                    </span>
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'profile' && (
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl border border-blue-200 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-500 rounded-lg">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Basic Information</h3>
                      </div>
                      <div className="flex flex-col gap-4">
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Full Name</p>
                          <p className="text-sm font-medium text-gray-900">{fullName}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Specialization</p>
                          <p className="text-sm font-medium text-gray-900">{specializationName}</p>
                        </div>
                        {doctor.department && doctor.department !== 'No Department' && (
                          <div>
                            <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Department</p>
                            <p className="text-sm font-medium text-gray-900">{doctor.department}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">License Number</p>
                          <p className="text-sm font-medium text-gray-900">{doctor.licenseNumber}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Status</p>
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold mt-1 ${
                            doctor.status === 'active'
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : doctor.status === 'inactive'
                              ? 'bg-gray-100 text-gray-700 border border-gray-200'
                              : 'bg-amber-100 text-amber-700 border border-amber-200'
                          }`}>
                            {doctor.status || 'active'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl border border-purple-200 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-purple-500 rounded-lg">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Contact Information</h3>
                      </div>
                      <div className="flex flex-col gap-4">
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Email</p>
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <p className="text-sm font-medium text-gray-900">{doctor.email}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Phone</p>
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <p className="text-sm font-medium text-gray-900">{doctor.phone}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {doctor.qualifications && doctor.qualifications.length > 0 && (
                    <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl border border-emerald-200 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-emerald-500 rounded-lg">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Qualifications</h3>
                      </div>
                      <ul className="flex flex-col gap-3">
                        {doctor.qualifications.map((qual, idx) => (
                          <li key={idx} className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-sm font-medium text-gray-900">{qual}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {doctor.bio && (
                    <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl border border-amber-200 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-amber-500 rounded-lg">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Bio</h3>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{doctor.bio}</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'schedule' && (
                <div className="flex flex-col gap-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Weekly Schedule</h3>
                      <p className="text-sm text-gray-600 mt-1">Manage doctor availability throughout the week</p>
                    </div>
                    <button 
                      onClick={() => setShowScheduleForm(true)}
                      className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md inline-flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add/Edit Schedule
                    </button>
                  </div>
                  {doctor.schedule && doctor.schedule.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                        const schedule = doctor.schedule?.find((s) => s.dayOfWeek === day);
                        return (
                          <div key={day} className={`rounded-xl border p-4 transition-all ${
                            schedule && schedule.isAvailable
                              ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200'
                              : 'bg-gray-50 border-gray-200'
                          }`}>
                            <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-bold text-gray-900">{getDayName(day)}</p>
                              {schedule && schedule.isAvailable && (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                  Available
                                </span>
                              )}
                            </div>
                            {schedule && schedule.isAvailable ? (
                              <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-sm font-semibold text-gray-900">
                                  {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                                </p>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">Not available</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col justify-center items-center py-12 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-gray-900 mb-1">No schedule set</p>
                      <p className="text-xs text-gray-600 text-center max-w-sm">Click &quot;Add/Edit Schedule&quot; to set availability for this doctor</p>
                    </div>
                  )}

                  {/* Schedule Form Modal */}
                  <Modal open={showScheduleForm} onOpenChange={setShowScheduleForm} className="max-w-md">
                    <div className="p-6 sm:p-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">Edit Schedule</h2>
                      </div>
                      <div className="flex flex-col gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Day of Week</label>
                          <select
                            value={scheduleForm.dayOfWeek.toString()}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, dayOfWeek: parseInt(e.target.value) })}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white transition-all"
                          >
                            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                              <option key={day} value={day.toString()}>
                                {getDayName(day)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Start Time</label>
                            <input
                              type="time"
                              value={scheduleForm.startTime}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">End Time</label>
                            <input
                              type="time"
                              value={scheduleForm.endTime}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                            />
                          </div>
                        </div>
                        <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={scheduleForm.isAvailable}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, isAvailable: e.target.checked })}
                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700">Available on this day</span>
                        </label>
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                          <button 
                            onClick={() => setShowScheduleForm(false)}
                            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={handleUpdateSchedule}
                            className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md"
                          >
                            Save Schedule
                          </button>
                        </div>
                      </div>
                    </div>
                  </Modal>
                </div>
              )}

              {activeTab === 'notes' && (
                <div className="flex flex-col gap-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Internal Notes</h3>
                      <p className="text-sm text-gray-600 mt-1">Private notes visible only to staff members</p>
                    </div>
                    <button 
                      onClick={() => setShowNoteForm(true)}
                      className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md inline-flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Note
                    </button>
                  </div>
                  {doctor.internalNotes && doctor.internalNotes.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      {doctor.internalNotes.map((note, index) => (
                        <div
                          key={index}
                          className={`rounded-xl border p-5 transition-all ${
                            note.isImportant 
                              ? 'border-red-300 bg-gradient-to-br from-red-50 to-red-100/50' 
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-2 flex-wrap">
                                {note.isImportant && (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    Important
                                  </span>
                                )}
                                <p className="text-xs text-gray-600 font-medium">
                                  {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                              <button
                                onClick={() => handleDeleteNoteClick(index)}
                                className="px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1.5"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete
                              </button>
                            </div>
                            <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">{note.note}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col justify-center items-center py-12 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-gray-900 mb-1">No internal notes</p>
                      <p className="text-xs text-gray-600 text-center max-w-sm">Click &quot;Add Note&quot; to create a private note for this doctor</p>
                    </div>
                  )}

                  {/* Note Form Modal */}
                  <Modal open={showNoteForm} onOpenChange={setShowNoteForm} className="max-w-md">
                    <div className="p-6 sm:p-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">Add Internal Note</h2>
                      </div>
                      <form onSubmit={handleAddNote}>
                        <div className="flex flex-col gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Note</label>
                            <textarea
                              required
                              value={newNote.note}
                              onChange={(e) => setNewNote({ ...newNote, note: e.target.value })}
                              rows={5}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-y transition-all"
                              placeholder="Enter your note here..."
                            />
                          </div>
                          <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                            <input
                              type="checkbox"
                              checked={newNote.isImportant}
                              onChange={(e) => setNewNote({ ...newNote, isImportant: e.target.checked })}
                              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">Mark as important</span>
                          </label>
                          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                            <button 
                              type="button"
                              onClick={() => setShowNoteForm(false)}
                              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
                            >
                              Cancel
                            </button>
                            <button 
                              type="submit"
                              className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md"
                            >
                              Add Note
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  </Modal>
                </div>
              )}

              {activeTab === 'performance' && (
                <div className="flex flex-col gap-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Performance Metrics</h3>
                      <p className="text-sm text-gray-600 mt-1">Appointment statistics and completion rates</p>
                    </div>
                    <button 
                      onClick={handleRefreshPerformance}
                      className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md inline-flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh Data
                    </button>
                  </div>
                  {metrics ? (
                    <div className="flex flex-col gap-6">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200">
                          <p className="text-3xl sm:text-4xl font-bold text-blue-700 mb-2">{total}</p>
                          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Total Appointments</p>
                        </div>
                        <div className="p-6 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border border-emerald-200">
                          <p className="text-3xl sm:text-4xl font-bold text-emerald-700 mb-2">{completed}</p>
                          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Completed</p>
                          <p className="text-xs text-emerald-600 font-medium">{Math.round(completionRate)}% completion rate</p>
                        </div>
                        <div className="p-6 bg-gradient-to-br from-red-50 to-red-100 rounded-xl border border-red-200">
                          <p className="text-3xl sm:text-4xl font-bold text-red-700 mb-2">{cancelled}</p>
                          <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Cancelled</p>
                          <p className="text-xs text-red-600 font-medium">
                            {total > 0 ? Math.round((cancelled / total) * 100) : 0}% cancellation rate
                          </p>
                        </div>
                        <div className="p-6 bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl border border-amber-200">
                          <p className="text-3xl sm:text-4xl font-bold text-amber-700 mb-2">{noShow}</p>
                          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">No-Show</p>
                          <p className="text-xs text-amber-600 font-medium">
                            {total > 0 ? Math.round((noShow / total) * 100) : 0}% no-show rate
                          </p>
                        </div>
                      </div>
                      {metrics.lastUpdated && (
                        <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-medium">Last updated:</span>
                          <span>{new Date(metrics.lastUpdated).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col justify-center items-center py-12 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-gray-900 mb-1">No performance data available</p>
                      <p className="text-xs text-gray-600 text-center max-w-sm">Click &quot;Refresh Data&quot; to calculate metrics from appointments</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Delete Note Alert Dialog */}
          <AlertDialog 
            open={deleteNoteDialogOpen} 
            onOpenChange={setDeleteNoteDialogOpen}
            title="Delete Note"
            description="Are you sure you want to delete this note? This action cannot be undone."
          >
            <button
              onClick={() => {
                setDeleteNoteDialogOpen(false);
                setNoteToDelete(null);
              }}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteNote}
              className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold shadow-md"
            >
              Delete
            </button>
          </AlertDialog>
        </div>
      </div>
    </section>
  );
}

