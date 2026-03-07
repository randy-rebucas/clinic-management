'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Modal } from './ui/Modal';

interface Vitals {
  bp?: string;        // Blood pressure (e.g., "120/80")
  hr?: number;        // Heart rate (bpm)
  rr?: number;        // Respiratory rate (breaths/min)
  tempC?: number;     // Temperature in Celsius
  spo2?: number;      // Oxygen saturation (%)
  heightCm?: number;  // Height in cm
  weightKg?: number;  // Weight in kg
  bmi?: number;       // Body Mass Index (calculated)
}

interface Queue {
  _id: string;
  queueNumber: string;
  queueType: 'appointment' | 'walk-in' | 'follow-up';
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
  };
  doctor?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  room?: {
    _id: string;
    name: string;
    roomNumber?: string;
  };
  patientName: string;
  status: 'waiting' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  queuedAt: string;
  checkedIn: boolean;
  estimatedWaitTime?: number;
  priority?: number;
  position?: number;
  vitals?: Vitals;
}

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
}

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
}

export default function QueuePageClient() {
  const [queue, setQueue] = useState<Queue[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterDoctor, setFilterDoctor] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('active'); // 'active' | 'all'
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string, action: string, patientName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    patientId: '',
    doctorId: '',
    queueType: 'walk-in' as 'appointment' | 'walk-in' | 'follow-up',
    priority: 0,
  });
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showVitalsForm, setShowVitalsForm] = useState(false);
  const [selectedQueueForVitals, setSelectedQueueForVitals] = useState<Queue | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchDoctors();
    fetchPatients();
    fetchQueue();
    const interval = setInterval(fetchQueue, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (formData.patientId) {
      const patient = patients.find((p) => p._id === formData.patientId);
      setSelectedPatient(patient || null);
      if (patient) {
        setPatientSearch(`${patient.firstName} ${patient.lastName}${patient.patientCode ? ` (${patient.patientCode})` : ''}`);
      }
    }
  }, [formData.patientId, patients]);

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

  const fetchDoctors = async () => {
    try {
      const res = await fetch('/api/doctors');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDoctors(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch doctors:', error);
    }
  };

  const fetchPatients = async () => {
    try {
      const res = await fetch('/api/patients');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPatients(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    }
  };

  const fetchQueue = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true);

      let url = '/api/queue';
      const params = new URLSearchParams();
      if (filterDoctor) params.append('doctorId', filterDoctor);
      if (filterStatus === 'active') params.append('status', 'waiting,in-progress');
      if (params.toString()) url += '?' + params.toString();

      const res = await fetch(url);

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
        let filteredData = data.data || [];
        if (filterType) {
          filteredData = filteredData.filter((q: Queue) => q.queueType === filterType);
        }
        setQueue(filteredData);
        setError(null); // Clear any previous errors
      } else {
        const errorMessage = data.error || 'Failed to fetch queue';
        console.error('Failed to fetch queue:', errorMessage);
        setError(errorMessage);
        setQueue([]); // Clear queue on error
      }
    } catch (error) {
      console.error('Failed to fetch queue:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch queue';
      setError(errorMessage);
      setQueue([]); // Clear queue on error
    } finally {
      setLoading(false);
      if (showRefreshing) setRefreshing(false);
    }
  };

  const showNotification = (message: string, type: 'error' | 'success') => {
    if (type === 'error') {
      setError(message);
      setTimeout(() => setError(null), 6000);
    } else {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 4000);
    }
  };

  const handleStatusUpdate = async (queueId: string, newStatus: string, patientName?: string) => {
    // Show confirmation for destructive actions
    if (newStatus === 'cancelled' || newStatus === 'no-show') {
      setConfirmAction({ id: queueId, action: newStatus, patientName: patientName || 'patient' });
      return;
    }

    await performStatusUpdate(queueId, newStatus);
  };

  const performStatusUpdate = async (queueId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/queue/${queueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        showNotification(`Status updated to ${newStatus}`, 'success');
        fetchQueue(true);
      } else {
        showNotification(data.error || 'Failed to update queue status', 'error');
      }
    } catch (error) {
      console.error('Failed to update queue status:', error);
      showNotification('Failed to update queue status', 'error');
    }
  };

  const handleCheckIn = async (queueId: string) => {
    try {
      const res = await fetch('/api/queue/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId }),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        showNotification('Patient checked in successfully', 'success');
        fetchQueue(true);
      } else {
        showNotification(data.error || 'Failed to check in patient', 'error');
      }
    } catch (error) {
      console.error('Failed to check in patient:', error);
      showNotification('Failed to check in patient', 'error');
    }
  };

  const filteredPatients = patients.filter((patient) => {
    if (!patientSearch.trim()) return true;
    const searchLower = patientSearch.toLowerCase();
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    const patientCode = (patient.patientCode || '').toLowerCase();
    // Note: Patient interface doesn't include email/phone, but we can add if needed
    return fullName.includes(searchLower) || patientCode.includes(searchLower);
  });

  const selectPatient = (patient: Patient) => {
    setFormData({ ...formData, patientId: patient._id });
    setSelectedPatient(patient);
    setPatientSearch(`${patient.firstName} ${patient.lastName}${patient.patientCode ? ` (${patient.patientCode})` : ''}`);
    setShowPatientSearch(false);
    setHighlightedIndex(-1);
  };

  const handleAddToQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patientId || !selectedPatient) {
      showNotification('Please select a valid patient', 'error');
      setShowPatientSearch(true);
      return;
    }

    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: formData.patientId,
          doctorId: formData.doctorId || undefined,
          queueType: formData.queueType,
          priority: formData.priority,
        }),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        const queueNum = data.data?.queueNumber || 'Queue';
        showNotification(`${selectedPatient.firstName} ${selectedPatient.lastName} added to queue (${queueNum})`, 'success');
        setShowAddForm(false);
        setFormData({ patientId: '', doctorId: '', queueType: 'walk-in', priority: 0 });
        setPatientSearch('');
        setSelectedPatient(null);
        fetchQueue(true);
      } else {
        showNotification(data.error || 'Failed to add patient to queue', 'error');
      }
    } catch (error) {
      console.error('Failed to add patient to queue:', error);
      showNotification('Network error: Failed to add patient to queue', 'error');
    }
  };

  const calculateWaitTime = (queuedAt: string) => {
    const queued = new Date(queuedAt);
    const now = new Date();
    const diffMs = now.getTime() - queued.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins} min`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  };

  const getStatusColor = (status: string): 'green' | 'blue' | 'yellow' | 'red' | 'gray' => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'in-progress':
        return 'blue';
      case 'waiting':
        return 'yellow';
      case 'cancelled':
      case 'no-show':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getTypeColor = (type: string): 'blue' | 'purple' | 'green' | 'gray' => {
    switch (type) {
      case 'appointment':
        return 'blue';
      case 'walk-in':
        return 'purple';
      case 'follow-up':
        return 'green';
      default:
        return 'gray';
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [filterDoctor, filterStatus]);


  const handleVitalsUpdate = async (vitalsData: Vitals) => {
    if (!selectedQueueForVitals) {
      showNotification('No queue item selected', 'error');
      return;
    }


    try {
      const res = await fetch(`/api/queue/${selectedQueueForVitals._id}/vitals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vitals: vitalsData }),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();

      if (data.success) {
        // Update local state immediately for better UX
        if (data.data) {
          setQueue(prevQueue =>
            prevQueue.map(q =>
              q._id === selectedQueueForVitals._id
                ? { ...q, vitals: data.data.vitals }
                : q
            )
          );
        }

        showNotification('Vital signs recorded successfully', 'success');
        setShowVitalsForm(false);
        setSelectedQueueForVitals(null);

        // Refresh to ensure sync with server
        fetchQueue(true);
      } else {
        showNotification(data.error || 'Failed to update vital signs', 'error');
      }
    } catch (error) {
      console.error('Failed to update vitals:', error);
      showNotification('Failed to update vital signs', 'error');
    }
  };

  if (loading) {
    return (
      <section className="py-6 px-4 sm:px-6 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-3 min-h-[50vh] justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-100 border-t-blue-600"></div>
            <p className="text-sm text-gray-500">Loading queue...</p>
          </div>
        </div>
      </section>
    );
  }

  const filteredQueue = queue.filter(q => {
    if (filterType && q.queueType !== filterType) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const patientName = (q.patientName || `${q.patient?.firstName || ''} ${q.patient?.lastName || ''}`).toLowerCase();
      const queueNumber = q.queueNumber.toLowerCase();
      if (!patientName.includes(query) && !queueNumber.includes(query)) return false;
    }
    return true;
  }).sort((a, b) => {
    // Sort by priority first, then by queued time
    if (a.priority !== undefined && b.priority !== undefined) {
      if (a.priority !== b.priority) return a.priority - b.priority;
    }
    return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
  });

  const activeQueue = filteredQueue.filter(q => q.status === 'waiting' || q.status === 'in-progress');
  return (
    <section className="py-6 px-4 sm:px-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Notifications */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-md p-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border-l-4 border-green-500 rounded-md p-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xs text-green-700">{success}</p>
            </div>
          )}

          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-600 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-base font-semibold text-gray-900">Queue Management</h1>
                  <p className="text-xs text-gray-500">Monitor patient queue and flow</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1.5 text-xs font-medium"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add to Queue
                </button>
                <button
                  onClick={() => fetchQueue(true)}
                  disabled={refreshing}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
                >
                  {refreshing ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-400 border-t-transparent" />
                      <span>Refreshing...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Refresh</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="p-4">
              <div className="relative flex items-center w-full">
                <div className="absolute left-4 p-1.5">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search by patient name or queue number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-xs text-gray-500">Waiting</div>
                <div className="text-sm font-semibold text-gray-900">{queue.filter(q => q.status === 'waiting').length}</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-xs text-gray-500">In Progress</div>
                <div className="text-sm font-semibold text-gray-900">{queue.filter(q => q.status === 'in-progress').length}</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <div className="text-xs text-gray-500">Not Checked In</div>
                <div className="text-sm font-semibold text-gray-900">{queue.filter(q => !q.checkedIn && (q.status === 'waiting' || q.status === 'in-progress')).length}</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <div className="text-xs text-gray-500">Total Active</div>
                <div className="text-sm font-semibold text-gray-900">{activeQueue.length}</div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Doctor</label>
                  <select
                    value={filterDoctor || ''}
                    onChange={(e) => setFilterDoctor(e.target.value === 'all' ? '' : e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-xs bg-white"
                  >
                    <option value="all">All Doctors</option>
                    {doctors.map((doctor) => (
                      <option key={doctor._id} value={doctor._id}>
                        Dr. {doctor.firstName} {doctor.lastName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Queue Type</label>
                  <select
                    value={filterType || ''}
                    onChange={(e) => setFilterType(e.target.value === 'all' ? '' : e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-xs bg-white"
                  >
                    <option value="all">All Types</option>
                    <option value="appointment">Appointment</option>
                    <option value="walk-in">Walk-In</option>
                    <option value="follow-up">Follow-Up</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-xs bg-white"
                  >
                    <option value="active">Active Only</option>
                    <option value="all">All Statuses</option>
                  </select>
                </div>
              </div>
              {(filterDoctor || filterType || filterStatus !== 'active') && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => {
                      setFilterDoctor('');
                      setFilterType('');
                      setFilterStatus('active');
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Queue Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-900">Current Queue</h3>
              <p className="text-xs text-gray-500">
                {filteredQueue.length} {filteredQueue.length === 1 ? 'patient' : 'patients'}
              </p>
            </div>
            {filteredQueue.length === 0 ? (
              <div className="p-10 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-100 rounded-xl mb-3">
                  <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  {searchQuery || filterDoctor || filterType || filterStatus !== 'active'
                    ? 'No patients match your filters'
                    : 'No patients in queue'}
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  {searchQuery || filterDoctor || filterType || filterStatus !== 'active'
                    ? 'Try adjusting your search or filters'
                    : 'Add a patient to get started'}
                </p>
                {!searchQuery && !filterDoctor && !filterType && filterStatus === 'active' && (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1.5 mx-auto text-xs font-medium"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Patient
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Queue #</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Patient</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Doctor / Room</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Wait Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Checked In</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredQueue.map((item) => (
                      <tr
                        key={item._id}
                        className={item.status === 'in-progress' ? 'bg-blue-50/50' : 'hover:bg-gray-50 transition-colors'}
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-bold text-gray-900">{item.queueNumber}</div>
                          {item.priority !== undefined && item.priority > 0 && item.priority < 3 && (
                            <span className="inline-block mt-1.5 px-2.5 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-semibold border border-orange-200">
                              {item.priority === 1 ? 'High Priority' : item.priority === 2 ? 'Urgent' : 'Priority'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 text-xs rounded-full font-semibold border ${getTypeColor(item.queueType) === 'blue' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                            getTypeColor(item.queueType) === 'purple' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                              getTypeColor(item.queueType) === 'green' ? 'bg-green-100 text-green-700 border-green-200' :
                                'bg-gray-100 text-gray-700 border-gray-200'
                            }`}>
                            {item.queueType === 'appointment' ? 'Appointment' :
                              item.queueType === 'walk-in' ? 'Walk-In' :
                                item.queueType === 'follow-up' ? 'Follow-Up' : item.queueType}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {item.patient?._id ? (
                            <Link href={`/visits/new?patientId=${item.patient._id}`} className="block">
                              <div className="text-sm font-bold text-blue-600 hover:text-blue-700 hover:underline transition-colors cursor-pointer">
                                {item.patientName || `${item.patient?.firstName || ''} ${item.patient?.lastName || 'Unknown'}`.trim()}
                              </div>
                            </Link>
                          ) : (
                            <div className="text-sm font-bold text-gray-900">
                              {item.patientName || 'Unknown Patient'}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="text-xs text-gray-600">
                              {new Date(item.queuedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            {item.vitals && Object.keys(item.vitals).length > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-semibold border border-green-200">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                                Vitals
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {item.doctor ? (
                            <div className="text-sm text-gray-900 font-medium">
                              Dr. {item.doctor.firstName} {item.doctor.lastName}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500 italic">No doctor assigned</div>
                          )}
                          {item.room && (
                            <div className="text-xs text-blue-600 font-semibold mt-1 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              {item.room.name || item.room.roomNumber || 'Room assigned'}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 text-xs rounded-full font-semibold border ${getStatusColor(item.status) === 'green' ? 'bg-green-100 text-green-700 border-green-200' :
                            getStatusColor(item.status) === 'blue' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                              getStatusColor(item.status) === 'yellow' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                getStatusColor(item.status) === 'red' ? 'bg-red-100 text-red-700 border-red-200' :
                                  'bg-gray-100 text-gray-700 border-gray-200'
                            }`}>
                            {item.status === 'in-progress' ? 'In Progress' :
                              item.status === 'no-show' ? 'No-Show' :
                                item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {item.estimatedWaitTime !== undefined && (
                            <div className="text-sm font-semibold text-gray-900">Est: {item.estimatedWaitTime}m</div>
                          )}
                          <div className="text-xs text-gray-600 mt-1">
                            {calculateWaitTime(item.queuedAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {item.checkedIn ? (
                            <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs rounded-full font-semibold border border-green-200">✓ Checked In</span>
                          ) : (
                            <button
                              onClick={() => handleCheckIn(item._id)}
                              className="px-3 py-1.5 text-orange-700 hover:bg-orange-50 rounded-lg transition-colors text-xs font-semibold border border-orange-200"
                            >
                              Check In
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            {item.status === 'waiting' && item.checkedIn && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedQueueForVitals(item);
                                    setShowVitalsForm(true);
                                  }}
                                  className={`px-3 py-1.5 rounded-lg transition-colors text-xs font-semibold border ${item.vitals && Object.keys(item.vitals).length > 0
                                      ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                                    }`}
                                  title={item.vitals && Object.keys(item.vitals).length > 0 ? 'Update Vital Signs' : 'Add Vital Signs'}
                                >
                                  {item.vitals && Object.keys(item.vitals).length > 0 ? (
                                    <span className="flex items-center gap-1">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      Update Vitals
                                    </span>
                                  ) : (
                                    'Add Vitals'
                                  )}
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(item._id, 'in-progress')}
                                  className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-xs font-semibold border border-blue-200"
                                  title="Start"
                                >
                                  Start
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(item._id, 'cancelled', item.patientName)}
                                  className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-xs font-semibold border border-red-200"
                                  title="Cancel"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {item.status === 'in-progress' && (
                              <>
                                <button
                                  onClick={() => handleStatusUpdate(item._id, 'completed')}
                                  className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-xs font-semibold border border-green-200"
                                  title="Complete"
                                >
                                  Done
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(item._id, 'no-show', item.patientName)}
                                  className="px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors text-xs font-semibold border border-yellow-200"
                                  title="No-Show"
                                >
                                  No-Show
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {/* Vitals Entry Modal */}
          <Modal
            open={showVitalsForm && !!selectedQueueForVitals}
            onOpenChange={(open) => {
              setShowVitalsForm(open);
              if (!open) {
                setSelectedQueueForVitals(null);
              }
            }}
            className="min-w-[30vw] max-w-[50vw]"
          >
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-blue-600 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Record Vital Signs</h2>
                  {selectedQueueForVitals && (
                    <p className="text-xs text-gray-500">
                      {selectedQueueForVitals.patientName || `${selectedQueueForVitals.patient?.firstName || ''} ${selectedQueueForVitals.patient?.lastName || ''}`.trim()} · Queue #{selectedQueueForVitals.queueNumber}
                    </p>
                  )}
                </div>
              </div>
              {selectedQueueForVitals && (
                <VitalsForm
                  initialVitals={selectedQueueForVitals.vitals}
                  onSubmit={handleVitalsUpdate}
                  onCancel={() => {
                    setShowVitalsForm(false);
                    setSelectedQueueForVitals(null);
                  }}
                />
              )}
            </div>
          </Modal>

          {/* Add to Queue Modal */}
          <Modal open={showAddForm} onOpenChange={(open) => {
            setShowAddForm(open);
            if (!open) {
              setPatientSearch('');
              setSelectedPatient(null);
              setHighlightedIndex(-1);
              setFormData({ ...formData, patientId: '' });
            }
          }} >
            <div className="p-5">
              <div className="flex items-center gap-2 mb-5">
                <div className="p-1.5 bg-purple-600 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Add Patient to Queue</h2>
                  <p className="text-xs text-gray-500">Add a new patient to the queue system</p>
                </div>
              </div>
              <form onSubmit={handleAddToQueue}>
                <div className="flex flex-col gap-5">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Patient <span className="text-red-500">*</span></label>
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
                            setFormData({ ...formData, patientId: '' });
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm bg-white"
                      />
                      {showPatientSearch && (
                        <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
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
                                  className={`w-full text-left px-4 py-2.5 rounded-lg transition-colors flex flex-col items-start ${highlightedIndex === index
                                    ? 'bg-blue-50 hover:bg-blue-100 border border-blue-200'
                                    : 'hover:bg-gray-50 border border-transparent'
                                    }`}
                                >
                                  <span className="font-semibold text-sm text-gray-900">{patient.firstName} {patient.lastName}</span>
                                  {patient.patientCode && (
                                    <span className="text-xs text-gray-600 mt-0.5">{patient.patientCode}</span>
                                  )}
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
                    {formData.patientId && !selectedPatient && (
                      <p className="text-xs text-red-600 mt-1.5 font-medium">Please select a valid patient from the list</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Doctor (Optional)</label>
                    <select
                      value={formData.doctorId || 'none'}
                      onChange={(e) => setFormData({ ...formData, doctorId: e.target.value === 'none' ? '' : e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm bg-white"
                    >
                      <option value="none">No doctor assigned</option>
                      {doctors.map((doctor) => (
                        <option key={doctor._id} value={doctor._id}>
                          Dr. {doctor.firstName} {doctor.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Queue Type <span className="text-red-500">*</span></label>
                    <select
                      value={formData.queueType}
                      onChange={(e) => setFormData({ ...formData, queueType: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm bg-white"
                    >
                      <option value="walk-in">Walk-In</option>
                      <option value="appointment">Appointment</option>
                      <option value="follow-up">Follow-Up</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                    <select
                      value={formData.priority.toString()}
                      onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm bg-white"
                    >
                      <option value="0">Normal</option>
                      <option value="1">High</option>
                      <option value="2">Urgent</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">Lower number = higher priority</p>
                  </div>
                  <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => {
                        setPatientSearch('');
                        setSelectedPatient(null);
                        setHighlightedIndex(-1);
                        setFormData({ ...formData, patientId: '' });
                      }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button type="submit" className="px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-xs font-medium">
                      Add to Queue
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </Modal>

          {/* Confirmation Dialog */}
          <Modal open={!!confirmAction} onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }} className="max-w-md">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className={`p-1.5 rounded-lg ${confirmAction?.action === 'cancelled' ? 'bg-red-100' : 'bg-yellow-100'}`}>
                  <svg className={`w-4 h-4 ${confirmAction?.action === 'cancelled' ? 'text-red-600' : 'text-yellow-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900">Confirm Action</h3>
              </div>
              <p className="text-xs text-gray-600 mb-5">
                Are you sure you want to mark <strong className="text-gray-900">{confirmAction?.patientName}</strong> as <strong className="text-gray-900">{confirmAction?.action}</strong>?
              </p>
              <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (confirmAction) {
                      performStatusUpdate(confirmAction.id, confirmAction.action);
                      setConfirmAction(null);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-md text-white transition-colors text-xs font-medium ${confirmAction?.action === 'cancelled'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-yellow-600 hover:bg-yellow-700'
                    }`}
                >
                  Confirm
                </button>
              </div>
            </div>
          </Modal>
        </div>
      </div>
    </section>
  );
}

function VitalsForm({
  initialVitals,
  onSubmit,
  onCancel
}: {
  initialVitals?: Vitals;
  onSubmit: (vitals: Vitals) => void;
  onCancel: () => void;
}) {
  const hasInitialVitals = initialVitals && Object.keys(initialVitals).length > 0;

  const [vitals, setVitals] = useState({
    bp: initialVitals?.bp || '',
    hr: initialVitals?.hr?.toString() || '',
    rr: initialVitals?.rr?.toString() || '',
    tempC: initialVitals?.tempC?.toString() || '',
    spo2: initialVitals?.spo2?.toString() || '',
    heightCm: initialVitals?.heightCm?.toString() || '',
    weightKg: initialVitals?.weightKg?.toString() || '',
  });

  const calculateBMI = () => {
    const height = parseFloat(vitals.heightCm as any);
    const weight = parseFloat(vitals.weightKg as any);
    if (height > 0 && weight > 0) {
      const heightM = height / 100;
      return parseFloat((weight / (heightM * heightM)).toFixed(1));
    }
    return undefined;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const bmi = calculateBMI();
    const vitalsData: Vitals = {};

    if (vitals.bp && vitals.bp.trim()) vitalsData.bp = vitals.bp.trim();
    if (vitals.hr) vitalsData.hr = parseFloat(vitals.hr as any);
    if (vitals.rr) vitalsData.rr = parseFloat(vitals.rr as any);
    if (vitals.tempC) vitalsData.tempC = parseFloat(vitals.tempC as any);
    if (vitals.spo2) vitalsData.spo2 = parseFloat(vitals.spo2 as any);
    if (vitals.heightCm) vitalsData.heightCm = parseFloat(vitals.heightCm as any);
    if (vitals.weightKg) vitalsData.weightKg = parseFloat(vitals.weightKg as any);
    if (bmi) vitalsData.bmi = bmi;

    // Validate that at least one vital sign is provided
    if (Object.keys(vitalsData).length === 0) {
      alert('Please enter at least one vital sign');
      return;
    }

    onSubmit(vitalsData);
  };

  return (
    <form onSubmit={handleSubmit}>
      {hasInitialVitals && (
        <div className="mb-4 bg-blue-50 border-l-4 border-blue-500 rounded-md p-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-blue-800">Updating existing vitals — modify any field to update the record</p>
        </div>
      )}

      {/* Primary Vitals Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Primary Vitals</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Blood Pressure</label>
            <input
              type="text"
              value={vitals.bp}
              onChange={(e) => setVitals({ ...vitals, bp: e.target.value })}
              placeholder="120/80"
              pattern="[0-9]+/[0-9]+"
              title="Enter as systolic/diastolic (e.g., 120/80)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">mmHg</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Heart Rate</label>
            <input
              type="number"
              value={vitals.hr}
              onChange={(e) => setVitals({ ...vitals, hr: e.target.value })}
              placeholder="72"
              min="30"
              max="250"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">30–250 bpm</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Respiratory Rate</label>
            <input
              type="number"
              value={vitals.rr}
              onChange={(e) => setVitals({ ...vitals, rr: e.target.value })}
              placeholder="16"
              min="8"
              max="60"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">8–60 /min</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Temperature</label>
            <input
              type="number"
              step="0.1"
              value={vitals.tempC}
              onChange={(e) => setVitals({ ...vitals, tempC: e.target.value })}
              placeholder="36.5"
              min="30"
              max="45"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">30–45°C</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">SpO2 (Oxygen)</label>
            <input
              type="number"
              value={vitals.spo2}
              onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })}
              placeholder="98"
              min="50"
              max="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">50–100%</p>
          </div>
        </div>
      </div>

      {/* Physical Measurements Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Physical Measurements</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Height</label>
            <input
              type="number"
              step="0.1"
              value={vitals.heightCm}
              onChange={(e) => setVitals({ ...vitals, heightCm: e.target.value })}
              placeholder="170"
              min="50"
              max="250"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">50–250 cm</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Weight</label>
            <input
              type="number"
              step="0.1"
              value={vitals.weightKg}
              onChange={(e) => setVitals({ ...vitals, weightKg: e.target.value })}
              placeholder="70"
              min="2"
              max="300"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">2–300 kg</p>
          </div>

          {calculateBMI() ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-center">
              <p className="text-xs font-medium text-gray-500 mb-1">BMI (Auto-calculated)</p>
              <p className="text-base font-semibold text-gray-900">{calculateBMI()}</p>
              <p className="text-xs text-gray-400">kg/m²</p>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-4 flex items-center justify-center">
              <div className="text-center">
                <p className="text-xs font-medium text-gray-500">BMI</p>
                <p className="text-xs text-gray-400 mt-0.5">Enter height & weight</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-xs font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-medium"
        >
          {hasInitialVitals ? 'Update Vitals' : 'Save Vitals'}
        </button>
      </div>
    </form>
  );
}

