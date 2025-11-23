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
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: '256px' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p>Loading doctor...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!doctor) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: '256px' }}>
            <h2 className="text-xl font-semibold mb-2">Doctor not found</h2>
            <Link 
              href="/doctors"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Back to Doctors
            </Link>
          </div>
        </div>
      </section>
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
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Notifications */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">{success}</p>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Link 
                href="/doctors"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-3xl font-bold">{fullName}</h1>
            </div>
            <p className="text-sm text-gray-600 ml-9">{doctor.specialization}</p>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="border-b border-gray-200 overflow-x-auto">
              <nav className="flex -mb-px min-w-max">
                {[
                  { value: 'profile', label: 'Profile' },
                  { value: 'schedule', label: 'Schedule & Availability' },
                  { value: 'notes', label: `Internal Notes (${doctor.internalNotes?.length || 0})` },
                  { value: 'performance', label: 'Performance' }
                ].map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => {
                      if (tab.value === 'performance') {
                        handleRefreshPerformance();
                      }
                      setActiveTab(tab.value as any);
                    }}
                    className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === tab.value
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="pt-3">
              {activeTab === 'profile' && (
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex gap-3 flex-wrap">
                    <div className="bg-gray-50 rounded-lg border border-gray-200 flex-1 min-w-[300px]" style={{ flex: '1 1 300px' }}>
                      <div className="flex flex-col gap-3 p-3">
                        <h3 className="text-lg font-semibold">Basic Information</h3>
                        <div className="flex flex-col gap-2">
                          <div>
                            <p className="text-xs font-medium text-gray-600 mb-1">Full Name</p>
                            <p className="text-sm">{fullName}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-600 mb-1">Specialization</p>
                            <p className="text-sm">{doctor.specialization}</p>
                          </div>
                          {doctor.department && (
                            <div>
                              <p className="text-xs font-medium text-gray-600 mb-1">Department</p>
                              <p className="text-sm">{doctor.department}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-medium text-gray-600 mb-1">License Number</p>
                            <p className="text-sm">{doctor.licenseNumber}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-600 mb-1">Status</p>
                            <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                              doctor.status === 'active' ? 'bg-green-100 text-green-800' :
                              doctor.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {doctor.status || 'active'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg border border-gray-200 flex-1 min-w-[300px]" style={{ flex: '1 1 300px' }}>
                      <div className="flex flex-col gap-3 p-3">
                        <h3 className="text-lg font-semibold">Contact Information</h3>
                        <div className="flex flex-col gap-2">
                          <div>
                            <p className="text-xs font-medium text-gray-600 mb-1">Email</p>
                            <p className="text-sm">{doctor.email}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-600 mb-1">Phone</p>
                            <p className="text-sm">{doctor.phone}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {doctor.qualifications && doctor.qualifications.length > 0 && (
                    <div className="bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex flex-col gap-3 p-3">
                        <h3 className="text-lg font-semibold">Qualifications</h3>
                        <ul className="list-disc list-inside flex flex-col gap-1 pl-6">
                          {doctor.qualifications.map((qual, idx) => (
                            <li key={idx} className="text-sm">{qual}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                  {doctor.bio && (
                    <div className="bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex flex-col gap-3 p-3">
                        <h3 className="text-lg font-semibold">Bio</h3>
                        <p className="text-sm whitespace-pre-wrap">{doctor.bio}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'schedule' && (
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Weekly Schedule</h3>
                    <button 
                      onClick={() => setShowScheduleForm(true)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      + Add/Edit Schedule
                    </button>
                  </div>
                  {doctor.schedule && doctor.schedule.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                        const schedule = doctor.schedule?.find((s) => s.dayOfWeek === day);
                        return (
                          <div key={day} className="bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-center p-2">
                              <div className="flex items-center gap-3">
                                <p className="text-sm font-medium w-20">{getDayName(day)}</p>
                                {schedule && schedule.isAvailable ? (
                                  <p className="text-sm text-gray-600">
                                    {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                                  </p>
                                ) : (
                                  <p className="text-sm text-gray-600">Not available</p>
                                )}
                              </div>
                              {schedule && schedule.isAvailable && (
                                <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800">
                                  Available
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex justify-center items-center" style={{ minHeight: '150px' }}>
                      <p className="text-sm text-gray-600">No schedule set. Click &quot;Add/Edit Schedule&quot; to set availability.</p>
                    </div>
                  )}

                  {/* Schedule Form Modal */}
                  <Modal open={showScheduleForm} onOpenChange={setShowScheduleForm} className="max-w-md">
                    <div className="p-6">
                      <h2 className="text-xl font-semibold mb-4">Edit Schedule</h2>
                      <div className="flex flex-col gap-3 py-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Day of Week</label>
                          <select
                            value={scheduleForm.dayOfWeek.toString()}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, dayOfWeek: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                          >
                            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                              <option key={day} value={day.toString()}>
                                {getDayName(day)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="block text-sm font-medium mb-2">Start Time</label>
                            <input
                              type="time"
                              value={scheduleForm.startTime}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-sm font-medium mb-2">End Time</label>
                            <input
                              type="time"
                              value={scheduleForm.endTime}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={scheduleForm.isAvailable}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, isAvailable: e.target.checked })}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm">Available on this day</span>
                        </label>
                        <hr className="border-gray-200" />
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => setShowScheduleForm(false)}
                            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={handleUpdateSchedule}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  </Modal>
                </div>
              )}

              {activeTab === 'notes' && (
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Internal Notes</h3>
                    <button 
                      onClick={() => setShowNoteForm(true)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      + Add Note
                    </button>
                  </div>
                  {doctor.internalNotes && doctor.internalNotes.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {doctor.internalNotes.map((note, index) => (
                        <div
                          key={index}
                          className={`rounded-lg border p-3 ${
                            note.isImportant 
                              ? 'border-red-300 bg-red-50' 
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-2">
                                {note.isImportant && (
                                  <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-800">
                                    Important
                                  </span>
                                )}
                                <p className="text-xs text-gray-600">
                                  {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                              <button
                                onClick={() => handleDeleteNoteClick(index)}
                                className="px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 rounded transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex justify-center items-center" style={{ minHeight: '150px' }}>
                      <p className="text-sm text-gray-600">No internal notes. Click &quot;Add Note&quot; to add one.</p>
                    </div>
                  )}

                  {/* Note Form Modal */}
                  <Modal open={showNoteForm} onOpenChange={setShowNoteForm} className="max-w-md">
                    <div className="p-6">
                      <h2 className="text-xl font-semibold mb-4">Add Internal Note</h2>
                      <form onSubmit={handleAddNote}>
                        <div className="flex flex-col gap-3 py-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">Note</label>
                            <textarea
                              required
                              value={newNote.note}
                              onChange={(e) => setNewNote({ ...newNote, note: e.target.value })}
                              rows={4}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-y"
                            />
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newNote.isImportant}
                              onChange={(e) => setNewNote({ ...newNote, isImportant: e.target.checked })}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm">Mark as important</span>
                          </label>
                          <hr className="border-gray-200" />
                          <div className="flex justify-end gap-2">
                            <button 
                              type="button"
                              onClick={() => setShowNoteForm(false)}
                              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                            >
                              Cancel
                            </button>
                            <button 
                              type="submit"
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
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
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Performance Metrics</h3>
                    <button 
                      onClick={handleRefreshPerformance}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      Refresh Data
                    </button>
                  </div>
                  {metrics ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-2 flex-wrap">
                        <div className="bg-blue-50 rounded-lg border border-blue-200 flex-1 min-w-[200px]" style={{ flex: '1 1 200px' }}>
                          <div className="flex flex-col gap-1 p-3">
                            <p className="text-3xl font-bold text-blue-700">{total}</p>
                            <p className="text-xs text-gray-600">Total Appointments</p>
                          </div>
                        </div>
                        <div className="bg-green-50 rounded-lg border border-green-200 flex-1 min-w-[200px]" style={{ flex: '1 1 200px' }}>
                          <div className="flex flex-col gap-1 p-3">
                            <p className="text-3xl font-bold text-green-700">{completed}</p>
                            <p className="text-xs text-gray-600">Completed</p>
                            <p className="text-xs text-gray-600">{Math.round(completionRate)}% completion rate</p>
                          </div>
                        </div>
                        <div className="bg-red-50 rounded-lg border border-red-200 flex-1 min-w-[200px]" style={{ flex: '1 1 200px' }}>
                          <div className="flex flex-col gap-1 p-3">
                            <p className="text-3xl font-bold text-red-700">{cancelled}</p>
                            <p className="text-xs text-gray-600">Cancelled</p>
                            <p className="text-xs text-gray-600">
                              {total > 0 ? Math.round((cancelled / total) * 100) : 0}% cancellation rate
                            </p>
                          </div>
                        </div>
                        <div className="bg-yellow-50 rounded-lg border border-yellow-200 flex-1 min-w-[200px]" style={{ flex: '1 1 200px' }}>
                          <div className="flex flex-col gap-1 p-3">
                            <p className="text-3xl font-bold text-yellow-700">{noShow}</p>
                            <p className="text-xs text-gray-600">No-Show</p>
                            <p className="text-xs text-gray-600">
                              {total > 0 ? Math.round((noShow / total) * 100) : 0}% no-show rate
                            </p>
                          </div>
                        </div>
                      </div>
                      {metrics.lastUpdated && (
                        <p className="text-xs text-gray-600">
                          Last updated: {new Date(metrics.lastUpdated).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex justify-center items-center" style={{ minHeight: '150px' }}>
                      <p className="text-sm text-gray-600">No performance data available. Click &quot;Refresh Data&quot; to calculate metrics.</p>
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
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteNote}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              Delete
            </button>
          </AlertDialog>
        </div>
      </div>
    </section>
  );
}

