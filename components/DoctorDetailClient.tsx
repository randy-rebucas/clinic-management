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
  const [activeTab, setActiveTab] = useState<'profile' | 'schedule' | 'notes' | 'performance'>('profile');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [newNote, setNewNote] = useState({ note: '', isImportant: false });
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
        }
      }
    } catch (error) {
      console.error('Failed to add note:', error);
      alert('Failed to add note');
    }
  };

  const handleDeleteNote = async (index: number) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const res = await fetch(`/api/doctors/${doctorId}/notes?index=${index}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDoctor(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('Failed to delete note');
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
        }
      }
    } catch (error) {
      console.error('Failed to update schedule:', error);
      alert('Failed to update schedule');
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading doctor...</p>
        </div>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Doctor not found</h2>
          <Link href="/doctors" className="text-blue-600 hover:text-blue-700">
            Back to Doctors
          </Link>
        </div>
      </div>
    );
  }

  const fullName = `${doctor.title || 'Dr.'} ${doctor.firstName} ${doctor.lastName}`;
  const metrics = doctor.performanceMetrics;
  const total = metrics?.totalAppointments || 0;
  const completed = metrics?.completedAppointments || 0;
  const cancelled = metrics?.cancelledAppointments || 0;
  const noShow = metrics?.noShowAppointments || 0;
  const completionRate = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
          <div className="mb-4 sm:mb-0">
            <div className="flex items-center space-x-3 mb-2">
              <Link href="/doctors" className="text-gray-500 hover:text-gray-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">{fullName}</h1>
            </div>
            <p className="text-gray-600 text-sm sm:text-base ml-9">{doctor.specialization}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-3">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('profile')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'profile'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'schedule'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Schedule & Availability
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'notes'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Internal Notes ({doctor.internalNotes?.length || 0})
              </button>
              <button
                onClick={() => {
                  setActiveTab('performance');
                  handleRefreshPerformance();
                }}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'performance'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Performance
              </button>
            </nav>
          </div>

          <div className="p-3">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                    <dl className="space-y-3">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Full Name</dt>
                        <dd className="text-sm text-gray-900">{fullName}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Specialization</dt>
                        <dd className="text-sm text-gray-900">{doctor.specialization}</dd>
                      </div>
                      {doctor.department && (
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Department</dt>
                          <dd className="text-sm text-gray-900">{doctor.department}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-sm font-medium text-gray-500">License Number</dt>
                        <dd className="text-sm text-gray-900">{doctor.licenseNumber}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Status</dt>
                        <dd className="text-sm text-gray-900 capitalize">{doctor.status || 'active'}</dd>
                      </div>
                    </dl>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
                    <dl className="space-y-3">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Email</dt>
                        <dd className="text-sm text-gray-900">{doctor.email}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Phone</dt>
                        <dd className="text-sm text-gray-900">{doctor.phone}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
                {doctor.qualifications && doctor.qualifications.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Qualifications</h3>
                    <ul className="list-disc list-inside space-y-1">
                      {doctor.qualifications.map((qual, idx) => (
                        <li key={idx} className="text-sm text-gray-900">{qual}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {doctor.bio && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Bio</h3>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{doctor.bio}</p>
                  </div>
                )}
              </div>
            )}

            {/* Schedule Tab */}
            {activeTab === 'schedule' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Weekly Schedule</h3>
                  <button
                    onClick={() => setShowScheduleForm(true)}
                    className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
                  >
                    + Add/Edit Schedule
                  </button>
                </div>
                {doctor.schedule && doctor.schedule.length > 0 ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                      const schedule = doctor.schedule?.find((s) => s.dayOfWeek === day);
                      return (
                        <div key={day} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                          <div className="flex items-center space-x-4">
                            <div className="w-24 font-medium text-gray-900">{getDayName(day)}</div>
                            {schedule && schedule.isAvailable ? (
                              <div className="text-sm text-gray-600">
                                {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400">Not available</div>
                            )}
                          </div>
                          {schedule && schedule.isAvailable && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              Available
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-600">No schedule set. Click "Add/Edit Schedule" to set availability.</p>
                  </div>
                )}

                {/* Schedule Form Modal */}
                {showScheduleForm && (
                  <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4">
                      <div className="fixed inset-0 bg-black/30 backdrop-blur-md" onClick={() => setShowScheduleForm(false)} />
                      <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-md w-full z-10">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Edit Schedule</h3>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700">Day of Week</label>
                            <select
                              value={scheduleForm.dayOfWeek}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, dayOfWeek: parseInt(e.target.value) })}
                              className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            >
                              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                                <option key={day} value={day}>
                                  {getDayName(day)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-700">Start Time</label>
                              <input
                                type="time"
                                value={scheduleForm.startTime}
                                onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                                className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700">End Time</label>
                              <input
                                type="time"
                                value={scheduleForm.endTime}
                                onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                                className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={scheduleForm.isAvailable}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, isAvailable: e.target.checked })}
                              className="rounded border-gray-200 text-blue-600 focus:ring-1 focus:ring-blue-500"
                            />
                            <label className="ml-2 text-xs text-gray-700">Available on this day</label>
                          </div>
                          <div className="flex justify-end space-x-3 pt-4">
                            <button
                              onClick={() => setShowScheduleForm(false)}
                              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleUpdateSchedule}
                              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notes Tab */}
            {activeTab === 'notes' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Internal Notes</h3>
                  <button
                    onClick={() => setShowNoteForm(true)}
                    className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
                  >
                    + Add Note
                  </button>
                </div>
                {doctor.internalNotes && doctor.internalNotes.length > 0 ? (
                  <div className="space-y-3">
                    {doctor.internalNotes.map((note, index) => (
                      <div
                        key={index}
                        className={`p-4 border rounded-lg ${
                          note.isImportant ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center space-x-2">
                            {note.isImportant && (
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                Important
                              </span>
                            )}
                            <span className="text-xs text-gray-500">
                              {new Date(note.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteNote(index)}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{note.note}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-600">No internal notes. Click "Add Note" to add one.</p>
                  </div>
                )}

                {/* Note Form Modal */}
                {showNoteForm && (
                  <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4">
                      <div className="fixed inset-0 bg-black/30 backdrop-blur-md" onClick={() => setShowNoteForm(false)} />
                      <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-md w-full z-10">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Add Internal Note</h3>
                        <form onSubmit={handleAddNote} className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700">Note</label>
                            <textarea
                              required
                              value={newNote.note}
                              onChange={(e) => setNewNote({ ...newNote, note: e.target.value })}
                              rows={4}
                              className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={newNote.isImportant}
                              onChange={(e) => setNewNote({ ...newNote, isImportant: e.target.checked })}
                              className="rounded border-gray-200 text-blue-600 focus:ring-1 focus:ring-blue-500"
                            />
                            <label className="ml-2 text-xs text-gray-700">Mark as important</label>
                          </div>
                          <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200">
                            <button
                              type="button"
                              onClick={() => setShowNoteForm(false)}
                              className="px-3 py-1.5 border border-gray-200 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition-colors"
                            >
                              Add Note
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Performance Tab */}
            {activeTab === 'performance' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Performance Metrics</h3>
                  <button
                    onClick={handleRefreshPerformance}
                    className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
                  >
                    Refresh Data
                  </button>
                </div>
                {metrics ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="bg-blue-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-blue-600">{total}</div>
                        <div className="text-sm text-gray-600">Total Appointments</div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-green-600">{completed}</div>
                        <div className="text-sm text-gray-600">Completed</div>
                        <div className="text-xs text-gray-500 mt-1">{Math.round(completionRate)}% completion rate</div>
                      </div>
                      <div className="bg-red-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-red-600">{cancelled}</div>
                        <div className="text-sm text-gray-600">Cancelled</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {total > 0 ? Math.round((cancelled / total) * 100) : 0}% cancellation rate
                        </div>
                      </div>
                      <div className="bg-yellow-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-yellow-600">{noShow}</div>
                        <div className="text-sm text-gray-600">No-Show</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {total > 0 ? Math.round((noShow / total) * 100) : 0}% no-show rate
                        </div>
                      </div>
                    </div>
                    {metrics.lastUpdated && (
                      <p className="text-xs text-gray-500">
                        Last updated: {new Date(metrics.lastUpdated).toLocaleString()}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-600">No performance data available. Click "Refresh Data" to calculate metrics.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

