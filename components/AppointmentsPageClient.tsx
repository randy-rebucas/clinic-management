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
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
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
        const selectedDateStr = selectedDate.toISOString().split('T')[0];
        const todayStr = new Date().toISOString().split('T')[0];
        setFormData(prev => ({
          ...prev,
          patient: patientId,
          appointmentDate: selectedDateStr,
          appointmentTime: selectedDateStr === todayStr ? getCurrentTime() : '',
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
        setHighlightedIndex(-1);
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
    const email = (patient.email || '').toLowerCase();
    const phone = (patient.phone || '').toLowerCase();
    return fullName.includes(searchLower) || email.includes(searchLower) || phone.includes(searchLower);
  });

  const selectPatient = (patient: Patient) => {
    setFormData({ ...formData, patient: patient._id });
    setSelectedPatient(patient);
    setPatientSearch(`${patient.firstName} ${patient.lastName}`);
    setShowPatientSearch(false);
    setHighlightedIndex(-1);
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
        setHighlightedIndex(-1);
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

  const getCurrentTime = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
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
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-100 border-t-blue-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading appointments...</p>
          </div>
        </div>
      </section>
    );
  }

  const selectedDateAppointments = getSelectedDateAppointments();
  const walkInQueue = getWalkInQueue();

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 mb-1">Error</h3>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-green-800 mb-1">Success</h3>
                  <p className="text-sm text-green-700">{success}</p>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Appointments</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Manage appointments and walk-in queue</p>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => {
                    const selectedDateStr = selectedDate.toISOString().split('T')[0];
                    const todayStr = new Date().toISOString().split('T')[0];
                    setFormData({ 
                      ...formData, 
                      isWalkIn: false, 
                      appointmentDate: selectedDateStr,
                      appointmentTime: selectedDateStr === todayStr ? getCurrentTime() : ''
                    });
                    setShowWalkInForm(false);
                    setShowForm(true);
                  }}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Schedule Appointment
                </button>
                <button
                  onClick={() => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    setFormData({ 
                      ...formData, 
                      isWalkIn: true, 
                      appointmentDate: todayStr,
                      appointmentTime: getCurrentTime()
                    });
                    setShowForm(false);
                    setShowWalkInForm(true);
                  }}
                  className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Add Walk-In
                </button>
              </div>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="border-b border-gray-200 bg-gray-50/50">
              <div className="flex">
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all relative ${
                    viewMode === 'calendar'
                      ? 'text-blue-600 bg-white'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {viewMode === 'calendar' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600"></span>
                  )}
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Calendar View
                  </span>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all relative ${
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    List View
                  </span>
                </button>
                <button
                  onClick={() => setViewMode('queue')}
                  className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all relative flex items-center ${
                    viewMode === 'queue'
                      ? 'text-blue-600 bg-white'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {viewMode === 'queue' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600"></span>
                  )}
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Walk-In Queue
                    {walkInQueue.length > 0 && (
                      <span className="ml-1 px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full font-bold border border-orange-600">
                        {walkInQueue.length}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Calendar View */}
          {viewMode === 'calendar' && (
            <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-none w-full lg:w-[380px]">
            <AppointmentCalendar
              appointments={appointments}
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
            />
            {/* Filters */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm mt-4">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Filters</h3>
                </div>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Doctor</label>
                    <select
                      value={filterDoctor || ''}
                      onChange={(e) => setFilterDoctor(e.target.value === 'all' ? '' : e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all bg-white"
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
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Room</label>
                    <input
                      type="text"
                      placeholder="Filter by room..."
                      value={filterRoom}
                      onChange={(e) => setFilterRoom(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all"
                    />
                  </div>
                  {(filterDoctor || filterRoom) && (
                    <button
                      onClick={() => {
                        setFilterDoctor('');
                        setFilterRoom('');
                      }}
                      className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Appointments for {formatDate(selectedDate.toISOString())}
                    </h3>
                    {(filterDoctor || filterRoom) && (
                      <p className="text-sm text-gray-600 mt-0.5">
                        Filtered{filterDoctor ? ' by doctor' : ''}{filterRoom ? ' by room' : ''}
                      </p>
                    )}
                  </div>
                </div>
                {selectedDateAppointments.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">No appointments scheduled</h3>
                    <p className="text-sm text-gray-600">No appointments found for this date</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {selectedDateAppointments.map((appointment) => (
                      <div key={appointment._id} className="bg-gradient-to-r from-white to-gray-50 border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-blue-300 transition-all">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              <span className={`px-2.5 py-1 text-xs rounded-full font-semibold border ${
                                getStatusColor(appointment.status) === 'green' ? 'bg-green-100 text-green-700 border-green-200' :
                                getStatusColor(appointment.status) === 'blue' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                getStatusColor(appointment.status) === 'red' ? 'bg-red-100 text-red-700 border-red-200' :
                                getStatusColor(appointment.status) === 'yellow' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                getStatusColor(appointment.status) === 'purple' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                getStatusColor(appointment.status) === 'orange' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                'bg-gray-100 text-gray-700 border-gray-200'
                              }`}>
                                {appointment.status}
                              </span>
                              {appointment.isWalkIn && (
                                <span className="px-2.5 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-semibold border border-orange-200">
                                  Walk-In #{appointment.queueNumber}
                                </span>
                              )}
                              {appointment.appointmentCode && (
                                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-semibold border border-gray-200">
                                  #{appointment.appointmentCode}
                                </span>
                              )}
                            </div>
                            <div className="text-base font-bold text-gray-900 mb-2">
                              {appointment.patient.firstName} {appointment.patient.lastName}
                            </div>
                            <div className="text-sm text-gray-600 mb-2 flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              {appointment.doctor
                                ? `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName} - ${appointment.doctor.specialization}`
                                : appointment.provider
                                ? appointment.provider.name
                                : 'No provider assigned'}
                            </div>
                            <div className="text-sm text-gray-600 mb-2 flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {formatTime(appointment.appointmentTime)} ({appointment.duration} min)
                              {appointment.room && (
                                <span className="text-blue-600 ml-2 font-semibold">
                                  • Room: {appointment.room}
                                </span>
                              )}
                            </div>
                            {appointment.reason && (
                              <div className="text-sm text-gray-600 mt-2 bg-white/50 p-2 rounded-lg border border-gray-200">
                                <span className="font-semibold">Reason:</span> {appointment.reason}
                              </div>
                            )}
                            {appointment.estimatedWaitTime && (
                              <div className="text-xs text-orange-700 font-semibold mt-2 bg-orange-50 p-2 rounded-lg border border-orange-200">
                                Estimated wait: {appointment.estimatedWaitTime} minutes
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 flex-shrink-0">
                            {appointment.status === 'scheduled' && (
                              <>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'confirmed')}
                                  className="px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-xs font-semibold border border-green-200"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'cancelled')}
                                  className="px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-xs font-semibold border border-red-200"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {appointment.status === 'confirmed' && (
                              <>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'completed')}
                                  className="px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold border border-gray-200"
                                >
                                  Complete
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(appointment._id, 'no-show')}
                                  className="px-3 py-2 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors text-xs font-semibold border border-yellow-200"
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
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Patient</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Provider</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date & Time</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {appointments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">No appointments found</h3>
                      <p className="text-sm text-gray-600">Schedule an appointment to get started</p>
                    </td>
                  </tr>
                ) : (
                  appointments.map((appointment) => (
                    <tr key={appointment._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="text-sm font-bold text-gray-900">
                          {appointment.patient.firstName} {appointment.patient.lastName}
                        </div>
                        {appointment.isWalkIn && (
                          <span className="inline-block mt-1.5 px-2.5 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-semibold border border-orange-200">
                            Walk-In #{appointment.queueNumber}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm text-gray-600">
                          {appointment.doctor
                            ? `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}`
                            : appointment.provider
                            ? appointment.provider.name
                            : 'N/A'}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm text-gray-600">
                          {formatDate(appointment.appointmentDate)} at {formatTime(appointment.appointmentTime)}
                        </div>
                        {appointment.room && (
                          <div className="text-xs text-blue-600 mt-1 font-semibold">Room: {appointment.room}</div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 text-xs rounded-full font-semibold border ${
                          getStatusColor(appointment.status) === 'green' ? 'bg-green-100 text-green-700 border-green-200' :
                          getStatusColor(appointment.status) === 'blue' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                          getStatusColor(appointment.status) === 'red' ? 'bg-red-100 text-red-700 border-red-200' :
                          getStatusColor(appointment.status) === 'yellow' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                          getStatusColor(appointment.status) === 'purple' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                          getStatusColor(appointment.status) === 'orange' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                          'bg-gray-100 text-gray-700 border-gray-200'
                        }`}>
                          {appointment.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex gap-2 justify-end">
                          {appointment.status === 'scheduled' && (
                            <>
                              <button
                                onClick={() => handleStatusUpdate(appointment._id, 'confirmed')}
                                className="px-3 py-1.5 text-green-700 hover:bg-green-50 rounded-lg transition-colors text-xs font-semibold border border-green-200"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(appointment._id, 'cancelled')}
                                className="px-3 py-1.5 text-red-700 hover:bg-red-50 rounded-lg transition-colors text-xs font-semibold border border-red-200"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {appointment.status === 'confirmed' && (
                            <>
                              <button
                                onClick={() => handleStatusUpdate(appointment._id, 'completed')}
                                className="px-3 py-1.5 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors text-xs font-semibold border border-gray-200"
                              >
                                Complete
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(appointment._id, 'no-show')}
                                className="px-3 py-1.5 text-yellow-700 hover:bg-yellow-50 rounded-lg transition-colors text-xs font-semibold border border-yellow-200"
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
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 bg-orange-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Today&apos;s Walk-In Queue</h2>
                </div>
            {walkInQueue.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">No walk-in patients in queue</h3>
                <p className="text-sm text-gray-600">Walk-in patients will appear here</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {walkInQueue.map((appointment) => (
                  <div key={appointment._id} className="bg-gradient-to-r from-orange-50 to-orange-100/50 border border-orange-200 rounded-xl p-4 hover:shadow-md transition-all">
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex items-center gap-4">
                        <div
                          className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white text-lg font-bold shadow-md"
                        >
                          {appointment.queueNumber}
                        </div>
                        <div>
                          <div className="text-base font-bold text-gray-900">
                            {appointment.patient.firstName} {appointment.patient.lastName}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">{appointment.patient.phone}</div>
                          {appointment.estimatedWaitTime && (
                            <div className="text-xs text-orange-700 font-semibold mt-2 bg-white/50 px-2 py-1 rounded-lg border border-orange-200">
                              Est. wait: {appointment.estimatedWaitTime} minutes
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 text-xs rounded-full font-semibold border ${
                          getStatusColor(appointment.status) === 'red' ? 'bg-red-100 text-red-700 border-red-200' :
                          getStatusColor(appointment.status) === 'yellow' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                          getStatusColor(appointment.status) === 'green' ? 'bg-green-100 text-green-700 border-green-200' :
                          'bg-blue-100 text-blue-700 border-blue-200'
                        }`}>
                          {appointment.status}
                        </span>
                        <button
                          onClick={() => handleStatusUpdate(appointment._id, 'confirmed')}
                          className="px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-xs font-semibold border border-green-200"
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
          setHighlightedIndex(-1);
          setFormData({ ...formData, patient: '' });
        }
      }} className="max-w-3xl">
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className={`p-2 rounded-lg ${showWalkInForm ? 'bg-orange-500' : 'bg-blue-500'}`}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {showWalkInForm ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                )}
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {showWalkInForm ? 'Add Walk-In Patient' : 'Schedule Appointment'}
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                {showWalkInForm ? 'Register a walk-in patient' : 'Create a new appointment'}
              </p>
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Patient <span className="text-red-500">*</span></label>
                  <div className="relative patient-search-container">
                    <input
                      type="text"
                      required
                      value={patientSearch}
                      onChange={(e) => {
                        setPatientSearch(e.target.value);
                        setShowPatientSearch(true);
                        setHighlightedIndex(-1);
                        if (!e.target.value) {
                          setFormData({ ...formData, patient: '' });
                          setSelectedPatient(null);
                        }
                      }}
                      onFocus={() => {
                        setShowPatientSearch(true);
                        setHighlightedIndex(-1);
                      }}
                      onKeyDown={(e) => {
                        if (!showPatientSearch || filteredPatients.length === 0) return;
                        
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightedIndex(prev => 
                            prev < filteredPatients.length - 1 ? prev + 1 : prev
                          );
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
                        } else if (e.key === 'Enter' && highlightedIndex >= 0) {
                          e.preventDefault();
                          selectPatient(filteredPatients[highlightedIndex]);
                        } else if (e.key === 'Escape') {
                          setShowPatientSearch(false);
                          setHighlightedIndex(-1);
                        }
                      }}
                      placeholder="Type to search patients..."
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                    />
                    {showPatientSearch && (
                      <div
                        className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto"
                      >
                      {filteredPatients.length > 0 ? (
                        <div className="flex flex-col gap-1 p-1">
                          {filteredPatients.map((patient, index) => (
                            <button
                              key={patient._id}
                              type="button"
                              onClick={() => {
                                selectPatient(patient);
                                setShowPatientSearch(false);
                              }}
                              onMouseEnter={() => setHighlightedIndex(index)}
                              className={`w-full text-left px-4 py-2.5 rounded-lg transition-colors ${
                                highlightedIndex === index 
                                  ? 'bg-blue-50 hover:bg-blue-100 border border-blue-200' 
                                  : 'hover:bg-gray-50 border border-transparent'
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold text-sm text-gray-900">{patient.firstName} {patient.lastName}</span>
                                {(patient.email || patient.phone) && (
                                  <span className="text-xs text-gray-600 mt-0.5">
                                    {patient.email && patient.phone 
                                      ? `${patient.email} • ${patient.phone}`
                                      : patient.email || patient.phone}
                                  </span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : patientSearch.trim() ? (
                        <div className="p-4 text-center">
                          <p className="text-sm text-gray-600">No patients found</p>
                        </div>
                      ) : (
                        <div className="p-4 text-center">
                          <p className="text-sm text-gray-600">All patients ({patients.length})</p>
                        </div>
                      )}
                      </div>
                    )}
                  </div>
                  {formData.patient && !selectedPatient && (
                    <p className="text-xs text-red-600 mt-1.5 font-medium">Please select a valid patient from the list</p>
                  )}
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Doctor/Provider <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={formData.doctor || ''}
                    onChange={(e) => setFormData({ ...formData, doctor: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
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
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    required
                    value={formData.appointmentDate}
                    onChange={(e) => {
                      const selectedDateStr = e.target.value;
                      const todayStr = new Date().toISOString().split('T')[0];
                      setFormData({ 
                        ...formData, 
                        appointmentDate: selectedDateStr,
                        appointmentTime: selectedDateStr === todayStr && !formData.appointmentTime ? getCurrentTime() : formData.appointmentTime
                      });
                    }}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Time <span className="text-red-500">*</span></label>
                  <input
                    type="time"
                    required
                    value={formData.appointmentTime}
                    onChange={(e) => setFormData({ ...formData, appointmentTime: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  />
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Duration (minutes)</label>
                  <input
                    type="number"
                    min="15"
                    max="240"
                    step="15"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 30 })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Room (Optional)</label>
                  <input
                    type="text"
                    value={formData.room}
                    onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                    placeholder="e.g., Room 101, Consultation Room A"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Reason</label>
                <input
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Appointment reason"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setShowWalkInForm(false);
                    setPatientSearch('');
                    setSelectedPatient(null);
                    setHighlightedIndex(-1);
                    setFormData({ ...formData, patient: '' });
                  }}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
                >
                  Cancel
                </button>
                <button type="submit" className={`px-5 py-2.5 text-white rounded-lg transition-all text-sm font-semibold shadow-md ${
                  showWalkInForm 
                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
                }`}>
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
