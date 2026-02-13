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
    
    console.log('Updating vitals for queue ID:', selectedQueueForVitals._id);
    console.log('Vitals data being sent:', vitalsData);
    
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
      console.log('Vitals update response:', data);
      
      if (data.success) {
        // Update local state immediately for better UX
        if (data.data) {
          console.log('Updated queue with vitals:', data.data.vitals);
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
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-100 border-t-blue-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading queue...</p>
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
  console.log('Active queue items:', activeQueue);
  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Notifications */}
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
                <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Queue Management</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Monitor patient queue and flow</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add to Queue
                </button>
                <button
                  onClick={() => fetchQueue(true)}
                  disabled={refreshing}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200 min-w-[110px] justify-center"
                >
                  {refreshing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Refresh</span>
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-500 hidden sm:block font-medium">
                  Auto-refreshes every 30s
                </p>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 border border-yellow-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-yellow-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="text-sm font-semibold text-yellow-700 mb-1">Waiting</div>
              <div className="text-3xl font-bold text-yellow-900">
                {queue.filter(q => q.status === 'waiting').length}
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="text-sm font-semibold text-blue-700 mb-1">In Progress</div>
              <div className="text-3xl font-bold text-blue-900">
                {queue.filter(q => q.status === 'in-progress').length}
              </div>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-orange-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
              <div className="text-sm font-semibold text-orange-700 mb-1">Not Checked In</div>
              <div className="text-3xl font-bold text-orange-900">
                {queue.filter(q => !q.checkedIn && (q.status === 'waiting' || q.status === 'in-progress')).length}
              </div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
              <div className="text-sm font-semibold text-purple-700 mb-1">Total Active</div>
              <div className="text-3xl font-bold text-purple-900">
                {activeQueue.length}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-teal-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Filters</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Doctor</label>
                  <select
                    value={filterDoctor || ''}
                    onChange={(e) => setFilterDoctor(e.target.value === 'all' ? '' : e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
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
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Queue Type</label>
                  <select
                    value={filterType || ''}
                    onChange={(e) => setFilterType(e.target.value === 'all' ? '' : e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  >
                    <option value="all">All Types</option>
                    <option value="appointment">Appointment</option>
                    <option value="walk-in">Walk-In</option>
                    <option value="follow-up">Follow-Up</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  >
                    <option value="active">Active Only</option>
                    <option value="all">All Statuses</option>
                  </select>
                </div>
              </div>
              {(filterDoctor || filterType || filterStatus !== 'active') && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setFilterDoctor('');
                      setFilterType('');
                      setFilterStatus('active');
                    }}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Queue Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-200 bg-gray-50/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Current Queue</h3>
                </div>
                <p className="text-sm font-semibold text-gray-600">
                  {filteredQueue.length} {filteredQueue.length === 1 ? 'patient' : 'patients'}
                </p>
              </div>
            </div>
            {filteredQueue.length === 0 ? (
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {searchQuery || filterDoctor || filterType || filterStatus !== 'active'
                    ? 'No patients match your filters'
                    : 'No patients in queue'}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {searchQuery || filterDoctor || filterType || filterStatus !== 'active'
                    ? 'Try adjusting your search or filters'
                    : 'Add a patient to get started'}
                </p>
                {!searchQuery && !filterDoctor && !filterType && filterStatus === 'active' && (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all flex items-center gap-2 mx-auto text-sm font-semibold shadow-md"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Queue #</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Patient</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Doctor / Room</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Wait Time</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Checked In</th>
                      <th className="px-5 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredQueue.map((item) => (
                      <tr
                        key={item._id}
                        className={item.status === 'in-progress' ? 'bg-blue-50/50' : 'hover:bg-gray-50 transition-colors'}
                      >
                        <td className="px-5 py-4">
                          <div className="text-sm font-bold text-gray-900">{item.queueNumber}</div>
                          {item.priority !== undefined && item.priority > 0 && item.priority < 3 && (
                            <span className="inline-block mt-1.5 px-2.5 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-semibold border border-orange-200">
                              {item.priority === 1 ? 'High Priority' : item.priority === 2 ? 'Urgent' : 'Priority'}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
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
                        <td className="px-5 py-4">
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
                        <td className="px-5 py-4">
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
                        <td className="px-5 py-4">
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
                        <td className="px-5 py-4">
                          {item.estimatedWaitTime !== undefined && (
                            <div className="text-sm font-semibold text-gray-900">Est: {item.estimatedWaitTime}m</div>
                          )}
                          <div className="text-xs text-gray-600 mt-1">
                            {calculateWaitTime(item.queuedAt)}
                          </div>
                        </td>
                        <td className="px-5 py-4">
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
                        <td className="px-5 py-4 text-right">
                          <div className="flex gap-2 justify-end">
                            {item.status === 'waiting' && item.checkedIn && (
                              <>
                                <button
                                  onClick={() => {
                                    console.log('Opening vitals form for:', item.patientName, 'Current vitals:', item.vitals);
                                    setSelectedQueueForVitals(item);
                                    setShowVitalsForm(true);
                                  }}
                                  className={`px-3 py-1.5 rounded-lg transition-colors text-xs font-semibold border ${
                                    item.vitals && Object.keys(item.vitals).length > 0
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
            <div className="p-6 sm:p-8 bg-gradient-to-br from-gray-50 to-blue-50/30">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-gray-900 mb-1">Record Vital Signs</h2>
                    {selectedQueueForVitals && (
                      <div className="flex items-center gap-2 text-sm">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="text-blue-900 font-semibold">
                          {selectedQueueForVitals.patientName || `${selectedQueueForVitals.patient?.firstName || ''} ${selectedQueueForVitals.patient?.lastName || ''}`.trim()}
                        </span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-600 font-medium">Queue #{selectedQueueForVitals.queueNumber}</span>
                      </div>
                    )}
                  </div>
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
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Add Patient to Queue</h2>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Add a new patient to the queue system
                  </p>
                </div>
              </div>
              <form onSubmit={handleAddToQueue}>
                <div className="flex flex-col gap-5">
                  <div>
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
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
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
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Doctor (Optional)</label>
                    <select
                      value={formData.doctorId || 'none'}
                      onChange={(e) => setFormData({ ...formData, doctorId: e.target.value === 'none' ? '' : e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
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
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Queue Type <span className="text-red-500">*</span></label>
                    <select
                      value={formData.queueType}
                      onChange={(e) => setFormData({ ...formData, queueType: e.target.value as any })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                    >
                      <option value="walk-in">Walk-In</option>
                      <option value="appointment">Appointment</option>
                      <option value="follow-up">Follow-Up</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Priority</label>
                    <select
                      value={formData.priority.toString()}
                      onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                    >
                      <option value="0">Normal</option>
                      <option value="1">High</option>
                      <option value="2">Urgent</option>
                    </select>
                    <p className="text-xs text-gray-600 mt-1.5">Lower number = higher priority</p>
                  </div>
                  <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => {
                        setPatientSearch('');
                        setSelectedPatient(null);
                        setHighlightedIndex(-1);
                        setFormData({ ...formData, patientId: '' });
                      }}
                      className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
                    >
                      Cancel
                    </button>
                    <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all text-sm font-semibold shadow-md">
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
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${confirmAction?.action === 'cancelled' ? 'bg-red-500' : 'bg-yellow-500'}`}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900">Confirm Action</h3>
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to mark <strong className="text-gray-900">{confirmAction?.patientName}</strong> as <strong className="text-gray-900">{confirmAction?.action}</strong>?
              </p>
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
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
                  className={`px-5 py-2.5 rounded-lg text-white transition-all text-sm font-semibold shadow-md ${confirmAction?.action === 'cancelled'
                    ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                    : 'bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700'
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
  console.log('VitalsForm initialized with:', {
    hasInitialVitals,
    initialVitals,
    bp: initialVitals?.bp,
    hr: initialVitals?.hr,
    rr: initialVitals?.rr,
    tempC: initialVitals?.tempC,
    spo2: initialVitals?.spo2,
    heightCm: initialVitals?.heightCm,
    weightKg: initialVitals?.weightKg,
    bmi: initialVitals?.bmi
  });
  
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

    console.log('Submitting vitals data:', vitalsData);
    onSubmit(vitalsData);
  };

  return (
    <form onSubmit={handleSubmit}>
      {hasInitialVitals && (
        <div className="mb-5 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 rounded-lg shadow-sm">
          <p className="text-sm text-blue-900 font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Updating existing vitals — modify any field to update the record
          </p>
        </div>
      )}

      {/* Primary Vitals Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          Primary Vitals
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              Blood Pressure
            </label>
            <input
              type="text"
              value={vitals.bp}
              onChange={(e) => setVitals({ ...vitals, bp: e.target.value })}
              placeholder="120/80"
              pattern="[0-9]+/[0-9]+"
              title="Enter as systolic/diastolic (e.g., 120/80)"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all text-sm hover:border-gray-400"
            />
            <p className="text-xs text-gray-500 mt-1.5 font-medium">mmHg (e.g., 120/80)</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-pink-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
              Heart Rate
            </label>
            <input
              type="number"
              value={vitals.hr}
              onChange={(e) => setVitals({ ...vitals, hr: e.target.value })}
              placeholder="72"
              min="30"
              max="250"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none transition-all text-sm hover:border-gray-400"
            />
            <p className="text-xs text-gray-500 mt-1.5 font-medium">30-250 bpm</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
              </svg>
              Respiratory Rate
            </label>
            <input
              type="number"
              value={vitals.rr}
              onChange={(e) => setVitals({ ...vitals, rr: e.target.value })}
              placeholder="16"
              min="8"
              max="60"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all text-sm hover:border-gray-400"
            />
            <p className="text-xs text-gray-500 mt-1.5 font-medium">8-60 breaths/min</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
              </svg>
              Temperature
            </label>
            <input
              type="number"
              step="0.1"
              value={vitals.tempC}
              onChange={(e) => setVitals({ ...vitals, tempC: e.target.value })}
              placeholder="36.5"
              min="30"
              max="45"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm hover:border-gray-400"
            />
            <p className="text-xs text-gray-500 mt-1.5 font-medium">30-45°C</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
              SpO2 (Oxygen)
            </label>
            <input
              type="number"
              value={vitals.spo2}
              onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })}
              placeholder="98"
              min="50"
              max="100"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm hover:border-gray-400"
            />
            <p className="text-xs text-gray-500 mt-1.5 font-medium">50-100%</p>
          </div>
        </div>
      </div>

      {/* Physical Measurements Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Physical Measurements
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
              </svg>
              Height
            </label>
            <input
              type="number"
              step="0.1"
              value={vitals.heightCm}
              onChange={(e) => setVitals({ ...vitals, heightCm: e.target.value })}
              placeholder="170"
              min="50"
              max="250"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all text-sm hover:border-gray-400"
            />
            <p className="text-xs text-gray-500 mt-1.5 font-medium">50-250 cm</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
              Weight
            </label>
            <input
              type="number"
              step="0.1"
              value={vitals.weightKg}
              onChange={(e) => setVitals({ ...vitals, weightKg: e.target.value })}
              placeholder="70"
              min="2"
              max="300"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm hover:border-gray-400"
            />
            <p className="text-xs text-gray-500 mt-1.5 font-medium">2-300 kg</p>
          </div>

          {calculateBMI() ? (
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 shadow-lg border-2 border-blue-400">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-blue-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <label className="text-sm font-bold text-white">
                  BMI (Auto-Calculated)
                </label>
              </div>
              <p className="text-4xl font-bold text-white mb-1">{calculateBMI()}</p>
              <p className="text-sm text-blue-100 font-medium">kg/m² - Body Mass Index</p>
            </div>
          ) : (
            <div className="bg-gray-100 rounded-xl p-5 border-2 border-dashed border-gray-300 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-semibold text-gray-500">BMI</p>
                <p className="text-xs text-gray-400 mt-1">Enter height & weight</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 justify-end pt-6">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all text-sm font-bold border border-gray-300 shadow-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cancel
        </button>
        <button
          type="submit"
          className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-bold shadow-lg hover:shadow-xl flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {hasInitialVitals ? 'Update Vital Signs' : 'Save Vital Signs'}
        </button>
      </div>
    </form>
  );
}

