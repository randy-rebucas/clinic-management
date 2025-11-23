'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppointmentCalendar from './AppointmentCalendar';
import { Modal } from './ui/Modal';
import { useSetting } from './SettingsContext';

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
  room?: string;
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

export default function AppointmentsPageClient({ patientId }: { patientId?: string } = {}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'list' | 'queue'>('calendar');
  const defaultDuration = useSetting('appointmentSettings.defaultDuration', 30);
  
  const [formData, setFormData] = useState({
    patient: '',
    doctor: '',
    room: '',
    appointmentDate: '',
    appointmentTime: '',
    duration: defaultDuration,
    reason: '',
    notes: '',
    status: 'scheduled' as const,
    isWalkIn: false,
  });
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [filterDoctor, setFilterDoctor] = useState<string>('');
  const [filterRoom, setFilterRoom] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  // Handle patientId prop - open form and pre-select patient
  useEffect(() => {
    if (patientId && patients.length > 0 && !showForm && !showWalkInForm) {
      // Check if patient exists in the list
      const patientExists = patients.some(p => p._id === patientId);
      if (patientExists) {
        const patient = patients.find(p => p._id === patientId);
        setFormData(prev => ({
          ...prev,
          patient: patientId,
          appointmentDate: selectedDate.toISOString().split('T')[0],
        }));
        if (patient) {
          setSelectedPatient(patient);
          setPatientSearch(`${patient.firstName} ${patient.lastName}`);
        }
        setShowForm(true);
        setShowWalkInForm(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, patients.length]);

  useEffect(() => {
    if (formData.patient) {
      const patient = patients.find((p) => p._id === formData.patient);
      setSelectedPatient(patient || null);
      if (patient) {
        setPatientSearch(`${patient.firstName} ${patient.lastName}`);
      }
    }
  }, [formData.patient, patients]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.patient-search-container')) {
        setShowPatientSearch(false);
      }
    };

    if (showPatientSearch) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPatientSearch]);

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

  const filteredPatients = patients.filter((patient) => {
    if (!patientSearch.trim()) return true;
    const searchLower = patientSearch.toLowerCase();
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    return fullName.includes(searchLower);
  });

  const selectPatient = (patient: Patient) => {
    setFormData({ ...formData, patient: patient._id });
    setSelectedPatient(patient);
    setPatientSearch(`${patient.firstName} ${patient.lastName}`);
    setShowPatientSearch(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patient || !selectedPatient) {
      setError('Please select a valid patient');
      setTimeout(() => setError(null), 3000);
      setShowPatientSearch(true);
      return;
    }
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
        setError('Failed to create appointment: API error');
        setTimeout(() => setError(null), 5000);
        return;
      }

      if (data.success) {
        setShowForm(false);
        setShowWalkInForm(false);
        setFormData({
          patient: '',
          doctor: '',
          room: '',
          appointmentDate: '',
          appointmentTime: '',
          duration: 30,
          reason: '',
          notes: '',
          status: 'scheduled',
          isWalkIn: false,
        });
        setPatientSearch('');
        setSelectedPatient(null);
        fetchAppointmentsForDate(selectedDate);
        setSuccess(isWalkIn ? `Walk-in appointment created! Queue number: ${queueNumber}` : 'Appointment scheduled successfully!');
        setTimeout(() => setSuccess(null), 5000);
      } else {
        setError('Error: ' + data.error);
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error('Failed to create appointment:', error);
      setError('Failed to create appointment');
      setTimeout(() => setError(null), 5000);
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
        setError('Failed to update appointment: API error');
        setTimeout(() => setError(null), 5000);
        return;
      }

      if (data.success) {
        fetchAppointmentsForDate(selectedDate);
        setSuccess('Appointment updated successfully!');
        setTimeout(() => setSuccess(null), 3000);
        // Send reminder if status is confirmed
        if (status === 'confirmed') {
          // Trigger reminder (will be implemented)
          console.log('Sending confirmation reminder...');
        }
      } else {
        setError('Error: ' + data.error);
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error('Failed to update appointment:', error);
      setError('Failed to update appointment');
      setTimeout(() => setError(null), 5000);
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

  const getStatusColor = (status: string): 'green' | 'blue' | 'gray' | 'red' | 'yellow' | 'purple' | 'orange' => {
    switch (status) {
      case 'confirmed':
        return 'green';
      case 'scheduled':
        return 'blue';
      case 'completed':
        return 'gray';
      case 'cancelled':
        return 'red';
      case 'no-show':
        return 'yellow';
      case 'pending':
        return 'purple';
      case 'rescheduled':
        return 'orange';
      default:
        return 'gray';
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
      <section className="py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-3" style={{ minHeight: '50vh', justifyContent: 'center' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p>Loading appointments...</p>
          </div>
        </div>
      </section>
    );
  }

  const selectedDateAppointments = getSelectedDateAppointments();
  const walkInQueue = getWalkInQueue();

  return (
    <section className="py-6">
      <div className="container mx-auto px-4">
        <div className="flex flex-col gap-4">
          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
              <p>{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md">
              <p>{success}</p>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold mb-1">Appointments</h1>
              <p className="text-sm text-gray-600">Manage appointments and walk-in queue</p>
            </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              setFormData({ ...formData, isWalkIn: false, appointmentDate: selectedDate.toISOString().split('T')[0] });
              setShowWalkInForm(false);
              setShowForm(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center"
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
            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors flex items-center"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Add Walk-In
          </button>
        </div>
      </div>

          {/* View Mode Tabs */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="border-b border-gray-200">
              <div className="flex">
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    viewMode === 'calendar'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Calendar View
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    viewMode === 'list'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  List View
                </button>
                <button
                  onClick={() => setViewMode('queue')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center ${
                    viewMode === 'queue'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Walk-In Queue
                  {walkInQueue.length > 0 && (
                    <span className="ml-1.5 px-2 py-0.5 bg-orange-600 text-white text-xs rounded-full">
                      {walkInQueue.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
      </div>

          {/* Calendar View */}
          {viewMode === 'calendar' && (
            <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-none" style={{ width: '350px' }}>
            <AppointmentCalendar
              appointments={appointments}
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
            />
            {/* Filters */}
            <div className="bg-white border border-gray-200 rounded-lg mt-4">
              <div className="p-3">
                <h3 className="text-lg font-semibold mb-3">Filters</h3>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Doctor</label>
                    <select
                      value={filterDoctor || ''}
                      onChange={(e) => setFilterDoctor(e.target.value === 'all' ? '' : e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                    >
                      <option value="all">All Doctors</option>
                      {doctors.map((doctor) => (
                        <option key={doctor._id} value={doctor._id}>
                          {doctor.firstName} {doctor.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Room</label>
                    <input
                      type="text"
                      placeholder="Filter by room..."
                      value={filterRoom}
                      onChange={(e) => setFilterRoom(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                    />
                  </div>
                  {(filterDoctor || filterRoom) && (
                    <button
                      onClick={() => {
                        setFilterDoctor('');
                        setFilterRoom('');
                      }}
                      className="w-full px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1">
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-3">
                <h3 className="text-lg font-semibold mb-3">
                  Appointments for {formatDate(selectedDate.toISOString())}
                  {(filterDoctor || filterRoom) && (
                    <span className="text-sm text-gray-600 ml-2">
                      (Filtered{filterDoctor ? ' by doctor' : ''}{filterRoom ? ' by room' : ''})
                    </span>
                  )}
                </h3>
                {selectedDateAppointments.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="mb-3">
                      <svg className="w-12 h-12 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-gray-600">No appointments scheduled for this date</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {selectedDateAppointments.map((appointment) => (
                      <div key={appointment._id} className="bg-white border border-gray-200 rounded-lg p-3">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                getStatusColor(appointment.status) === 'green' ? 'bg-green-100 text-green-800' :
                                getStatusColor(appointment.status) === 'blue' ? 'bg-blue-100 text-blue-800' :
                                getStatusColor(appointment.status) === 'red' ? 'bg-red-100 text-red-800' :
                                getStatusColor(appointment.status) === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                                getStatusColor(appointment.status) === 'purple' ? 'bg-purple-100 text-purple-800' :
                                getStatusColor(appointment.status) === 'orange' ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {appointment.status}
                              </span>
                              {appointment.isWalkIn && (
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded-full">
                                  Walk-In #{appointment.queueNumber}
                                </span>
                              )}
                              {appointment.appointmentCode && (
                                <span className="text-xs text-gray-600">#{appointment.appointmentCode}</span>
                              )}
                            </div>
                            <div className="text-sm font-bold mb-1">
                              {appointment.patient.firstName} {appointment.patient.lastName}
                            </div>
                            <div className="text-sm text-gray-600 mb-1">
                              {appointment.doctor
                                ? `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName} - ${appointment.doctor.specialization}`
                                : appointment.provider
                                ? appointment.provider.name
                                : 'No provider assigned'}
                            </div>
                            <div className="text-sm text-gray-600 mb-1">
                              {formatTime(appointment.appointmentTime)} ({appointment.duration} min)
                              {appointment.room && (
                                <span className="text-blue-600 ml-2">
                                  • Room: {appointment.room}
                                </span>
                              )}
                            </div>
                            {appointment.reason && (
                              <div className="text-sm text-gray-600 mt-1">Reason: {appointment.reason}</div>
                            )}
                            {appointment.estimatedWaitTime && (
                              <div className="text-xs text-orange-600 mt-1">
                                Estimated wait: {appointment.estimatedWaitTime} minutes
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2">
                            {appointment.status === 'scheduled' && (
                              <>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'confirmed')}
                                  className="px-2 py-1 bg-green-50 text-green-700 rounded-md hover:bg-green-100 transition-colors text-xs"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'cancelled')}
                                  className="px-2 py-1 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors text-xs"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {appointment.status === 'confirmed' && (
                              <>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'completed')}
                                  className="px-2 py-1 bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100 transition-colors text-xs"
                                >
                                  Complete
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'no-show')}
                                  className="px-2 py-1 bg-yellow-50 text-yellow-700 rounded-md hover:bg-yellow-100 transition-colors text-xs"
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
            </div>
          )}

          {/* List View */}
          {viewMode === 'list' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Provider</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Date & Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {appointments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <p className="text-gray-600">No appointments found</p>
                    </td>
                  </tr>
                ) : (
                  appointments.map((appointment) => (
                    <tr key={appointment._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium">
                          {appointment.patient.firstName} {appointment.patient.lastName}
                        </div>
                        {appointment.isWalkIn && (
                          <span className="inline-block mt-1 px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded">
                            Walk-In #{appointment.queueNumber}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-600">
                          {appointment.doctor
                            ? `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}`
                            : appointment.provider
                            ? appointment.provider.name
                            : 'N/A'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-600">
                          {formatDate(appointment.appointmentDate)} at {formatTime(appointment.appointmentTime)}
                        </div>
                        {appointment.room && (
                          <div className="text-xs text-blue-600 mt-1">Room: {appointment.room}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          getStatusColor(appointment.status) === 'green' ? 'bg-green-100 text-green-800' :
                          getStatusColor(appointment.status) === 'blue' ? 'bg-blue-100 text-blue-800' :
                          getStatusColor(appointment.status) === 'red' ? 'bg-red-100 text-red-800' :
                          getStatusColor(appointment.status) === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                          getStatusColor(appointment.status) === 'purple' ? 'bg-purple-100 text-purple-800' :
                          getStatusColor(appointment.status) === 'orange' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {appointment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {appointment.status === 'scheduled' && (
                            <>
                              <button
                                onClick={() => handleStatusUpdate(appointment._id, 'confirmed')}
                                className="px-2 py-1 text-green-700 hover:bg-green-50 rounded transition-colors text-xs"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(appointment._id, 'cancelled')}
                                className="px-2 py-1 text-red-700 hover:bg-red-50 rounded transition-colors text-xs"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {appointment.status === 'confirmed' && (
                            <>
                              <button
                                onClick={() => handleStatusUpdate(appointment._id, 'completed')}
                                className="px-2 py-1 text-gray-700 hover:bg-gray-50 rounded transition-colors text-xs"
                              >
                                Complete
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(appointment._id, 'no-show')}
                                className="px-2 py-1 text-yellow-700 hover:bg-yellow-50 rounded transition-colors text-xs"
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
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-3">
                <h2 className="text-xl font-semibold mb-3">Today&apos;s Walk-In Queue</h2>
            {walkInQueue.length === 0 ? (
              <div className="text-center py-12">
                <div className="mb-3">
                  <svg className="w-12 h-12 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-gray-600">No walk-in patients in queue</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {walkInQueue.map((appointment) => (
                  <div key={appointment._id} className="bg-orange-50 border border-orange-300 rounded-lg p-3">
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-full bg-orange-600 flex items-center justify-center text-white text-lg font-bold"
                        >
                          {appointment.queueNumber}
                        </div>
                        <div>
                          <div className="text-sm font-bold">
                            {appointment.patient.firstName} {appointment.patient.lastName}
                          </div>
                          <div className="text-xs text-gray-600">{appointment.patient.phone}</div>
                          {appointment.estimatedWaitTime && (
                            <div className="text-xs text-orange-600 mt-1">
                              Est. wait: {appointment.estimatedWaitTime} minutes
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          getStatusColor(appointment.status) === 'red' ? 'bg-red-100 text-red-800' :
                          getStatusColor(appointment.status) === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                          getStatusColor(appointment.status) === 'green' ? 'bg-green-100 text-green-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {appointment.status}
                        </span>
                        <button
                          onClick={() => handleStatusUpdate(appointment._id, 'confirmed')}
                          className="px-2 py-1 bg-green-50 text-green-700 rounded-md hover:bg-green-100 transition-colors text-xs"
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
            </div>
          )}

          {/* Appointment Form Modal */}
          <Modal open={showForm || showWalkInForm} onOpenChange={(open) => {
        if (!open) {
          setShowForm(false);
          setShowWalkInForm(false);
          setPatientSearch('');
          setSelectedPatient(null);
          setFormData({ ...formData, patient: '' });
        }
      }} className="max-w-3xl">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            {showWalkInForm ? 'Add Walk-In Patient' : 'Schedule Appointment'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-3 mt-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Patient <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={patientSearch}
                      onChange={(e) => {
                        setPatientSearch(e.target.value);
                        setShowPatientSearch(true);
                        if (!e.target.value) {
                          setFormData({ ...formData, patient: '' });
                          setSelectedPatient(null);
                        }
                      }}
                      onFocus={() => setShowPatientSearch(true)}
                      placeholder="Type to search patients..."
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    {showPatientSearch && (
                      <div
                        className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
                      >
                      {filteredPatients.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {filteredPatients.map((patient) => (
                            <button
                              key={patient._id}
                              type="button"
                              onClick={() => {
                                selectPatient(patient);
                                setShowPatientSearch(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded transition-colors"
                            >
                              <span className="font-medium text-sm">{patient.firstName} {patient.lastName}</span>
                            </button>
                          ))}
                        </div>
                      ) : patientSearch ? (
                        <div className="p-2">
                          <p className="text-sm text-gray-600">No patients found</p>
                        </div>
                      ) : (
                        <div className="p-2">
                          <p className="text-sm text-gray-600">Start typing to search...</p>
                        </div>
                      )}
                      </div>
                    )}
                  </div>
                  {formData.patient && !selectedPatient && (
                    <p className="text-xs text-red-600 mt-1">Please select a valid patient from the list</p>
                  )}
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Doctor/Provider <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={formData.doctor || ''}
                    onChange={(e) => setFormData({ ...formData, doctor: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">Select a doctor</option>
                    {doctors.map((doctor) => (
                      <option key={doctor._id} value={doctor._id}>
                        {doctor.firstName} {doctor.lastName} - {doctor.specialization}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    required
                    value={formData.appointmentDate}
                    onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Time <span className="text-red-500">*</span></label>
                  <input
                    type="time"
                    required
                    value={formData.appointmentTime}
                    onChange={(e) => setFormData({ ...formData, appointmentTime: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    min="15"
                    max="240"
                    step="15"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 30 })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Room (Optional)</label>
                  <input
                    type="text"
                    value={formData.room}
                    onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                    placeholder="e.g., Room 101, Consultation Room A"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reason</label>
                <input
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Appointment reason"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setShowWalkInForm(false);
                    setPatientSearch('');
                    setSelectedPatient(null);
                    setFormData({ ...formData, patient: '' });
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                  {showWalkInForm ? 'Add Walk-In' : 'Schedule Appointment'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </Modal>
        </div>
      </div>
    </section>
  );
}
