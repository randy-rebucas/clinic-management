'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, AlertDialog, Flex } from '@radix-ui/themes';

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
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-3 text-sm text-gray-600">Loading doctor...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Doctor not found</h2>
            <Link href="/doctors" className="text-blue-600 hover:text-blue-800 hover:underline text-sm">
              Back to Doctors
            </Link>
          </div>
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
            <div className="flex items-center space-x-2 mb-0.5">
              <Link href="/doctors" className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
            </div>
            <p className="text-gray-600 text-xs ml-7">{doctor.specialization}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-2">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('profile')}
                className={`py-1.5 px-2.5 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === 'profile'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`py-1.5 px-2.5 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === 'schedule'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Schedule & Availability
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`py-1.5 px-2.5 text-xs font-medium border-b-2 transition-colors ${
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
                className={`py-1.5 px-2.5 text-xs font-medium border-b-2 transition-colors ${
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
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Basic Information</h3>
                    <dl className="space-y-2">
                      <div>
                        <dt className="text-xs font-medium text-gray-500">Full Name</dt>
                        <dd className="text-sm text-gray-900">{fullName}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-gray-500">Specialization</dt>
                        <dd className="text-sm text-gray-900">{doctor.specialization}</dd>
                      </div>
                      {doctor.department && (
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Department</dt>
                          <dd className="text-sm text-gray-900">{doctor.department}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-xs font-medium text-gray-500">License Number</dt>
                        <dd className="text-sm text-gray-900">{doctor.licenseNumber}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-gray-500">Status</dt>
                        <dd className="text-sm text-gray-900 capitalize">{doctor.status || 'active'}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Contact Information</h3>
                    <dl className="space-y-2">
                      <div>
                        <dt className="text-xs font-medium text-gray-500">Email</dt>
                        <dd className="text-sm text-gray-900">{doctor.email}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-gray-500">Phone</dt>
                        <dd className="text-sm text-gray-900">{doctor.phone}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
                {doctor.qualifications && doctor.qualifications.length > 0 && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Qualifications</h3>
                    <ul className="list-disc list-inside space-y-0.5">
                      {doctor.qualifications.map((qual, idx) => (
                        <li key={idx} className="text-sm text-gray-900">{qual}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {doctor.bio && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Bio</h3>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{doctor.bio}</p>
                  </div>
                )}
              </div>
            )}

            {/* Schedule Tab */}
            {activeTab === 'schedule' && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">Weekly Schedule</h3>
                  <button
                    onClick={() => setShowScheduleForm(true)}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    + Add/Edit Schedule
                  </button>
                </div>
                {doctor.schedule && doctor.schedule.length > 0 ? (
                  <div className="space-y-1.5">
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                      const schedule = doctor.schedule?.find((s) => s.dayOfWeek === day);
                      return (
                        <div key={day} className="flex items-center justify-between p-2 border border-gray-200 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-20 text-xs font-medium text-gray-900">{getDayName(day)}</div>
                            {schedule && schedule.isAvailable ? (
                              <div className="text-xs text-gray-600">
                                {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-400">Not available</div>
                            )}
                          </div>
                          {schedule && schedule.isAvailable && (
                            <span className="px-1 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              Available
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-xs text-gray-600">No schedule set. Click &quot;Add/Edit Schedule&quot; to set availability.</p>
                  </div>
                )}

                {/* Schedule Form Modal */}
                {showScheduleForm && (
                  <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4">
                      <div className="fixed inset-0 bg-black/30 backdrop-blur-md transition-opacity" onClick={() => setShowScheduleForm(false)} />
                      <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-md w-full z-10">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-base font-semibold text-gray-900">Edit Schedule</h3>
                          <button
                            onClick={() => setShowScheduleForm(false)}
                            className="text-gray-400 hover:text-gray-500 transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Day of Week</label>
                            <select
                              value={scheduleForm.dayOfWeek}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, dayOfWeek: parseInt(e.target.value) })}
                              className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            >
                              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                                <option key={day} value={day}>
                                  {getDayName(day)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Start Time</label>
                              <input
                                type="time"
                                value={scheduleForm.startTime}
                                onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                                className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">End Time</label>
                              <input
                                type="time"
                                value={scheduleForm.endTime}
                                onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                                className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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
                          <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
                            <button
                              onClick={() => setShowScheduleForm(false)}
                              className="px-2.5 py-1 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleUpdateSchedule}
                              className="px-2.5 py-1 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700"
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
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">Internal Notes</h3>
                  <button
                    onClick={() => setShowNoteForm(true)}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    + Add Note
                  </button>
                </div>
                {doctor.internalNotes && doctor.internalNotes.length > 0 ? (
                  <div className="space-y-2">
                    {doctor.internalNotes.map((note, index) => (
                      <div
                        key={index}
                        className={`p-2.5 border rounded-lg ${
                          note.isImportant ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1.5">
                          <div className="flex items-center space-x-2">
                            {note.isImportant && (
                              <span className="px-1 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                Important
                              </span>
                            )}
                            <span className="text-xs text-gray-500">
                              {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteNoteClick(index)}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            Delete
                          </button>
                        </div>
                        <p className="text-xs text-gray-900 whitespace-pre-wrap">{note.note}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-xs text-gray-600">No internal notes. Click &quot;Add Note&quot; to add one.</p>
                  </div>
                )}

                {/* Note Form Modal */}
                {showNoteForm && (
                  <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4">
                      <div className="fixed inset-0 bg-black/30 backdrop-blur-md transition-opacity" onClick={() => setShowNoteForm(false)} />
                      <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-md w-full z-10">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-base font-semibold text-gray-900">Add Internal Note</h3>
                          <button
                            onClick={() => setShowNoteForm(false)}
                            className="text-gray-400 hover:text-gray-500 transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <form onSubmit={handleAddNote} className="space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
                            <textarea
                              required
                              value={newNote.note}
                              onChange={(e) => setNewNote({ ...newNote, note: e.target.value })}
                              rows={4}
                              className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
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
                          <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
                            <button
                              type="button"
                              onClick={() => setShowNoteForm(false)}
                              className="px-2.5 py-1 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="px-2.5 py-1 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700"
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
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">Performance Metrics</h3>
                  <button
                    onClick={handleRefreshPerformance}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    Refresh Data
                  </button>
                </div>
                {metrics ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <div className="bg-blue-50 rounded-lg p-2.5">
                        <div className="text-lg font-bold text-blue-600">{total}</div>
                        <div className="text-xs text-gray-600">Total Appointments</div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-2.5">
                        <div className="text-lg font-bold text-green-600">{completed}</div>
                        <div className="text-xs text-gray-600">Completed</div>
                        <div className="text-xs text-gray-500 mt-0.5">{Math.round(completionRate)}% completion rate</div>
                      </div>
                      <div className="bg-red-50 rounded-lg p-2.5">
                        <div className="text-lg font-bold text-red-600">{cancelled}</div>
                        <div className="text-xs text-gray-600">Cancelled</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {total > 0 ? Math.round((cancelled / total) * 100) : 0}% cancellation rate
                        </div>
                      </div>
                      <div className="bg-yellow-50 rounded-lg p-2.5">
                        <div className="text-lg font-bold text-yellow-600">{noShow}</div>
                        <div className="text-xs text-gray-600">No-Show</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {total > 0 ? Math.round((noShow / total) * 100) : 0}% no-show rate
                        </div>
                      </div>
                    </div>
                    {metrics.lastUpdated && (
                      <p className="text-xs text-gray-500">
                        Last updated: {new Date(metrics.lastUpdated).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-xs text-gray-600">No performance data available. Click &quot;Refresh Data&quot; to calculate metrics.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Delete Note Alert Dialog */}
        <AlertDialog.Root open={deleteNoteDialogOpen} onOpenChange={setDeleteNoteDialogOpen}>
          <AlertDialog.Content>
            <AlertDialog.Title>Delete Note</AlertDialog.Title>
            <AlertDialog.Description>
              Are you sure you want to delete this note? This action cannot be undone.
            </AlertDialog.Description>
            <Flex gap="3" mt="4" justify="end">
              <AlertDialog.Cancel>
                <Button variant="soft" color="gray" onClick={() => {
                  setDeleteNoteDialogOpen(false);
                  setNoteToDelete(null);
                }}>
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action>
                <Button variant="solid" color="red" onClick={handleDeleteNote}>
                  Delete
                </Button>
              </AlertDialog.Action>
            </Flex>
          </AlertDialog.Content>
        </AlertDialog.Root>
      </div>
    </div>
  );
}

