'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppointmentCalendar from './AppointmentCalendar';

interface Appointment {
  _id: string;
  appointmentCode?: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  doctor?: {
    _id: string;
    firstName: string;
    lastName: string;
    specialization: string;
  };
  provider?: {
    _id: string;
    name: string;
  };
  appointmentDate: string;
  appointmentTime: string;
  scheduledAt?: string;
  duration: number;
  status: 'pending' | 'scheduled' | 'confirmed' | 'rescheduled' | 'no-show' | 'completed' | 'cancelled';
  reason?: string;
  notes?: string;
  isWalkIn?: boolean;
  queueNumber?: number;
  estimatedWaitTime?: number;
}

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  specialization: string;
}

export default function AppointmentsPageClient() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'list' | 'queue'>('calendar');
  const [formData, setFormData] = useState({
    patient: '',
    doctor: '',
    room: '',
    appointmentDate: '',
    appointmentTime: '',
    duration: 30,
    reason: '',
    notes: '',
    status: 'scheduled' as const,
    isWalkIn: false,
  });
  const [filterDoctor, setFilterDoctor] = useState<string>('');
  const [filterRoom, setFilterRoom] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchAppointmentsForDate(selectedDate);
    }
  }, [selectedDate]);

  const fetchData = async () => {
    try {
      const [patientsRes, doctorsRes] = await Promise.all([
        fetch('/api/patients'),
        fetch('/api/doctors'),
      ]);

      if (patientsRes.status === 401 || doctorsRes.status === 401) {
        router.push('/login');
        return;
      }

      const parseResponse = async (res: Response) => {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await res.json();
        }
        return { success: false, error: `API error: ${res.status}` };
      };

      const patientsData = await parseResponse(patientsRes);
      const doctorsData = await parseResponse(doctorsRes);

      if (patientsData.success) setPatients(patientsData.data);
      if (doctorsData.success) setDoctors(doctorsData.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointmentsForDate = async (date: Date) => {
    try {
      const dateStr = date.toISOString().split('T')[0];
      let url = `/api/appointments?date=${dateStr}`;
      if (filterDoctor) {
        url += `&doctorId=${filterDoctor}`;
      }
      if (filterRoom) {
        url += `&room=${encodeURIComponent(filterRoom)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAppointments(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
    }
  };

  useEffect(() => {
    if (selectedDate) {
      fetchAppointmentsForDate(selectedDate);
    }
  }, [selectedDate, filterDoctor, filterRoom]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isWalkIn = formData.isWalkIn;
      
      // For walk-ins, get next queue number
      let queueNumber;
      if (isWalkIn) {
        const today = new Date().toISOString().split('T')[0];
        const todayRes = await fetch(`/api/appointments?date=${today}&status=scheduled,confirmed`);
        if (todayRes.ok) {
          const todayData = await todayRes.json();
          if (todayData.success) {
            const todayWalkIns = todayData.data.filter((apt: Appointment) => apt.isWalkIn);
            queueNumber = todayWalkIns.length > 0 
              ? Math.max(...todayWalkIns.map((apt: Appointment) => apt.queueNumber || 0)) + 1
              : 1;
          }
        }
      }

      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          appointmentDate: new Date(formData.appointmentDate),
          queueNumber: isWalkIn ? queueNumber : undefined,
          estimatedWaitTime: isWalkIn ? 30 : undefined, // Default 30 min wait for walk-ins
        }),
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
        alert('Failed to create appointment: API error');
        return;
      }

      if (data.success) {
        setShowForm(false);
        setShowWalkInForm(false);
        setFormData({
          patient: '',
          doctor: '',
          appointmentDate: '',
          appointmentTime: '',
          duration: 30,
          reason: '',
          notes: '',
          status: 'scheduled',
          isWalkIn: false,
        });
        fetchAppointmentsForDate(selectedDate);
        alert(isWalkIn ? `Walk-in appointment created! Queue number: ${queueNumber}` : 'Appointment scheduled successfully!');
      } else {
        alert('Error: ' + data.error);
      }
    } catch (error) {
      console.error('Failed to create appointment:', error);
      alert('Failed to create appointment');
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
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
        alert('Failed to update appointment: API error');
        return;
      }

      if (data.success) {
        fetchAppointmentsForDate(selectedDate);
        // Send reminder if status is confirmed
        if (status === 'confirmed') {
          // Trigger reminder (will be implemented)
          console.log('Sending confirmation reminder...');
        }
      } else {
        alert('Error: ' + data.error);
      }
    } catch (error) {
      console.error('Failed to update appointment:', error);
      alert('Failed to update appointment');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'no-show':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending':
        return 'bg-purple-100 text-purple-800';
      case 'rescheduled':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getSelectedDateAppointments = () => {
    const dateStr = selectedDate.toISOString().split('T')[0];
    return appointments.filter((apt) => {
      const aptDate = new Date(apt.appointmentDate).toISOString().split('T')[0];
      return aptDate === dateStr;
    }).sort((a, b) => {
      const timeA = a.appointmentTime || '00:00';
      const timeB = b.appointmentTime || '00:00';
      return timeA.localeCompare(timeB);
    });
  };

  const getWalkInQueue = () => {
    const today = new Date().toISOString().split('T')[0];
    return appointments
      .filter((apt) => {
        const aptDate = new Date(apt.appointmentDate).toISOString().split('T')[0];
        return apt.isWalkIn && aptDate === today && ['scheduled', 'confirmed'].includes(apt.status);
      })
      .sort((a, b) => (a.queueNumber || 0) - (b.queueNumber || 0));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading appointments...</p>
        </div>
      </div>
    );
  }

  const selectedDateAppointments = getSelectedDateAppointments();
  const walkInQueue = getWalkInQueue();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-3">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Appointments</h1>
            <p className="text-gray-600 text-sm">Manage appointments and walk-in queue</p>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
            <button
              onClick={() => {
                setFormData({ ...formData, isWalkIn: false, appointmentDate: selectedDate.toISOString().split('T')[0] });
                setShowWalkInForm(false);
                setShowForm(true);
              }}
              className="inline-flex items-center px-3 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-md shadow-sm hover:shadow hover:from-blue-700 hover:to-blue-800 transition-all"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Schedule Appointment
            </button>
            <button
              onClick={() => {
                setFormData({ ...formData, isWalkIn: true, appointmentDate: new Date().toISOString().split('T')[0] });
                setShowForm(false);
                setShowWalkInForm(true);
              }}
              className="inline-flex items-center px-3 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-700 rounded-md shadow-sm hover:shadow hover:from-orange-700 hover:to-orange-800 transition-all"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Add Walk-In
            </button>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-3">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setViewMode('calendar')}
                className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
                  viewMode === 'calendar'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Calendar View
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
                  viewMode === 'list'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                List View
              </button>
              <button
                onClick={() => setViewMode('queue')}
                className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
                  viewMode === 'queue'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Walk-In Queue ({walkInQueue.length})
              </button>
            </nav>
          </div>
        </div>

        {/* Calendar View */}
        {viewMode === 'calendar' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <AppointmentCalendar
                appointments={appointments}
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
              />
              {/* Filters */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mt-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Filters</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Doctor</label>
                    <select
                      value={filterDoctor}
                      onChange={(e) => setFilterDoctor(e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    >
                      <option value="">All Doctors</option>
                      {doctors.map((doctor) => (
                        <option key={doctor._id} value={doctor._id}>
                          {doctor.firstName} {doctor.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Room</label>
                    <input
                      type="text"
                      value={filterRoom}
                      onChange={(e) => setFilterRoom(e.target.value)}
                      placeholder="Filter by room..."
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  {(filterDoctor || filterRoom) && (
                    <button
                      onClick={() => {
                        setFilterDoctor('');
                        setFilterRoom('');
                      }}
                      className="w-full px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Appointments for {formatDate(selectedDate.toISOString())}
                  {(filterDoctor || filterRoom) && (
                    <span className="text-sm font-normal text-gray-500 ml-2">
                      (Filtered{filterDoctor ? ' by doctor' : ''}{filterRoom ? ' by room' : ''})
                    </span>
                  )}
                </h3>
                {selectedDateAppointments.length === 0 ? (
                  <div className="text-center py-12">
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-gray-600">No appointments scheduled for this date</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDateAppointments.map((appointment) => (
                      <div
                        key={appointment._id}
                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(appointment.status)}`}>
                                {appointment.status}
                              </span>
                              {appointment.isWalkIn && (
                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                                  Walk-In #{appointment.queueNumber}
                                </span>
                              )}
                              {appointment.appointmentCode && (
                                <span className="text-xs text-gray-500">#{appointment.appointmentCode}</span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-gray-900">
                              {appointment.patient.firstName} {appointment.patient.lastName}
                            </p>
                            <p className="text-sm text-gray-600">
                              {appointment.doctor
                                ? `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName} - ${appointment.doctor.specialization}`
                                : appointment.provider
                                ? appointment.provider.name
                                : 'No provider assigned'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {formatTime(appointment.appointmentTime)} ({appointment.duration} min)
                              {appointment.room && (
                                <span className="ml-2 text-blue-600">• Room: {appointment.room}</span>
                              )}
                            </p>
                            {appointment.reason && (
                              <p className="text-sm text-gray-500 mt-1">Reason: {appointment.reason}</p>
                            )}
                            {appointment.estimatedWaitTime && (
                              <p className="text-xs text-orange-600 mt-1">
                                Estimated wait: {appointment.estimatedWaitTime} minutes
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col space-y-2 ml-4">
                            {appointment.status === 'scheduled' && (
                              <>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'confirmed')}
                                  className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'cancelled')}
                                  className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {appointment.status === 'confirmed' && (
                              <>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'completed')}
                                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100"
                                >
                                  Complete
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'no-show')}
                                  className="px-3 py-1.5 text-xs font-medium text-yellow-700 bg-yellow-50 rounded-lg hover:bg-yellow-100"
                                >
                                  No-Show
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Patient</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Provider</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date & Time</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {appointments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        No appointments found
                      </td>
                    </tr>
                  ) : (
                    appointments.map((appointment) => (
                      <tr key={appointment._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {appointment.patient.firstName} {appointment.patient.lastName}
                          </div>
                          {appointment.isWalkIn && (
                            <div className="text-xs text-orange-600">Walk-In #{appointment.queueNumber}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {appointment.doctor
                            ? `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}`
                            : appointment.provider
                            ? appointment.provider.name
                            : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatDate(appointment.appointmentDate)} at {formatTime(appointment.appointmentTime)}
                          {appointment.room && (
                            <div className="text-xs text-blue-600 mt-1">Room: {appointment.room}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(appointment.status)}`}>
                            {appointment.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            {appointment.status === 'scheduled' && (
                              <>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'confirmed')}
                                  className="text-green-600 hover:text-green-700"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'cancelled')}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {appointment.status === 'confirmed' && (
                              <>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'completed')}
                                  className="text-gray-600 hover:text-gray-700"
                                >
                                  Complete
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'no-show')}
                                  className="text-yellow-600 hover:text-yellow-700"
                                >
                                  No-Show
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Walk-In Queue View */}
        {viewMode === 'queue' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Today's Walk-In Queue</h3>
            {walkInQueue.length === 0 ? (
              <div className="text-center py-12">
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-600">No walk-in patients in queue</p>
              </div>
            ) : (
              <div className="space-y-3">
                {walkInQueue.map((appointment) => (
                  <div
                    key={appointment._id}
                    className="border border-orange-200 rounded-lg p-4 bg-orange-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {appointment.queueNumber}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {appointment.patient.firstName} {appointment.patient.lastName}
                          </p>
                          <p className="text-xs text-gray-600">{appointment.patient.phone}</p>
                          {appointment.estimatedWaitTime && (
                            <p className="text-xs text-orange-600 mt-1">
                              Est. wait: {appointment.estimatedWaitTime} minutes
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(appointment.status)}`}>
                          {appointment.status}
                        </span>
                        <button
                          onClick={() => handleStatusUpdate(appointment._id, 'confirmed')}
                          className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Appointment Form Modal */}
        {(showForm || showWalkInForm) && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="fixed inset-0 bg-black/30 backdrop-blur-md" onClick={() => {
                setShowForm(false);
                setShowWalkInForm(false);
              }} />
              <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-2xl w-full z-10">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-base font-semibold text-gray-900">
                    {showWalkInForm ? 'Add Walk-In Patient' : 'Schedule Appointment'}
                  </h2>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setShowWalkInForm(false);
                    }}
                    className="text-gray-400 hover:text-gray-500 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Patient *</label>
                      <select
                        required
                        value={formData.patient}
                        onChange={(e) => setFormData({ ...formData, patient: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Select a patient</option>
                        {patients.map((patient) => (
                          <option key={patient._id} value={patient._id}>
                            {patient.firstName} {patient.lastName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Doctor/Provider *</label>
                      <select
                        required
                        value={formData.doctor}
                        onChange={(e) => setFormData({ ...formData, doctor: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Select a doctor</option>
                        {doctors.map((doctor) => (
                          <option key={doctor._id} value={doctor._id}>
                            {doctor.firstName} {doctor.lastName} - {doctor.specialization}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Date *</label>
                      <input
                        type="date"
                        required
                        value={formData.appointmentDate}
                        onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
                        min={new Date().toISOString().split('T')[0]}
                        className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Time *</label>
                      <input
                        type="time"
                        required
                        value={formData.appointmentTime}
                        onChange={(e) => setFormData({ ...formData, appointmentTime: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Duration (minutes)</label>
                      <input
                        type="number"
                        min="15"
                        max="240"
                        step="15"
                        value={formData.duration}
                        onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                        className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Room (Optional)</label>
                      <input
                        type="text"
                        value={formData.room}
                        onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                        placeholder="e.g., Room 101, Consultation Room A"
                        className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                        className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Reason</label>
                    <input
                      type="text"
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Appointment reason"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setShowWalkInForm(false);
                      }}
                      className="px-3 py-1.5 border border-gray-200 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 border border-transparent rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                    >
                      {showWalkInForm ? 'Add Walk-In' : 'Schedule Appointment'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
