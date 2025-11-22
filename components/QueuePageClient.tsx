'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
  const [confirmAction, setConfirmAction] = useState<{id: string, action: string, patientName: string} | null>(null);
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
        let filteredData = data.data;
        if (filterType) {
          filteredData = filteredData.filter((q: Queue) => q.queueType === filterType);
        }
        setQueue(filteredData);
      } else {
        console.error('Failed to fetch queue:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setLoading(false);
      if (showRefreshing) setRefreshing(false);
    }
  };

  const showNotification = (message: string, type: 'error' | 'success') => {
    if (type === 'error') {
      setError(message);
      setTimeout(() => setError(null), 5000);
    } else {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 3000);
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
        fetchQueue();
      } else {
        showNotification('Error: ' + data.error, 'error');
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
        fetchQueue();
      } else {
        showNotification('Error: ' + data.error, 'error');
      }
    } catch (error) {
      console.error('Failed to check in patient:', error);
      showNotification('Failed to check in patient', 'error');
    }
  };

  const filteredPatients = patients.filter((patient) => {
    if (!patientSearch.trim()) return true;
    const searchLower = patientSearch.toLowerCase();
    const fullName = `${patient.firstName} ${patient.lastName} ${patient.patientCode || ''}`.toLowerCase();
    return fullName.includes(searchLower);
  });

  const selectPatient = (patient: Patient) => {
    setFormData({ ...formData, patientId: patient._id });
    setSelectedPatient(patient);
    setPatientSearch(`${patient.firstName} ${patient.lastName}${patient.patientCode ? ` (${patient.patientCode})` : ''}`);
    setShowPatientSearch(false);
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
        showNotification('Patient added to queue successfully', 'success');
        setShowAddForm(false);
        setFormData({ patientId: '', doctorId: '', queueType: 'walk-in', priority: 0 });
        setPatientSearch('');
        setSelectedPatient(null);
        fetchQueue();
      } else {
        showNotification('Error: ' + data.error, 'error');
      }
    } catch (error) {
      console.error('Failed to add patient to queue:', error);
      showNotification('Failed to add patient to queue', 'error');
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'waiting':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
      case 'no-show':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'appointment':
        return 'bg-blue-100 text-blue-800';
      case 'walk-in':
        return 'bg-purple-100 text-purple-800';
      case 'follow-up':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  useEffect(() => {
    fetchQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDoctor, filterStatus]);

  if (loading) {
    return (
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-3 text-sm text-gray-600">Loading queue...</p>
          </div>
        </div>
      </div>
    );
  }

  const filteredQueue = queue.filter(q => {
    if (filterType && q.queueType !== filterType) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const patientName = (q.patientName || `${q.patient?.firstName} ${q.patient?.lastName}`).toLowerCase();
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

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Queue Management</h1>
            <p className="text-gray-600 text-sm">Monitor patient queue and flow</p>
          </div>
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add to Queue
            </button>
            <button
              onClick={() => fetchQueue(true)}
              disabled={refreshing}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg 
                className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <div className="text-xs text-gray-500 hidden sm:block">
              Auto-refreshes every 30s
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by patient name or queue number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full px-3 py-1.5 pl-9 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            <svg className="absolute left-2.5 top-1.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1.5 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2.5">
            <div className="text-xs text-gray-500 mb-0.5">Waiting</div>
            <div className="text-xl font-bold text-yellow-600">
              {queue.filter(q => q.status === 'waiting').length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2.5">
            <div className="text-xs text-gray-500 mb-0.5">In Progress</div>
            <div className="text-xl font-bold text-blue-600">
              {queue.filter(q => q.status === 'in-progress').length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2.5">
            <div className="text-xs text-gray-500 mb-0.5">Not Checked In</div>
            <div className="text-xl font-bold text-orange-600">
              {queue.filter(q => !q.checkedIn && (q.status === 'waiting' || q.status === 'in-progress')).length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2.5">
            <div className="text-xs text-gray-500 mb-0.5">Total Active</div>
            <div className="text-xl font-bold text-gray-900">
              {activeQueue.length}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Doctor
              </label>
              <select
                value={filterDoctor}
                onChange={(e) => setFilterDoctor(e.target.value)}
                className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Doctors</option>
                {doctors.map((doctor) => (
                  <option key={doctor._id} value={doctor._id}>
                    Dr. {doctor.firstName} {doctor.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Queue Type
              </label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Types</option>
                <option value="appointment">Appointment</option>
                <option value="walk-in">Walk-In</option>
                <option value="follow-up">Follow-Up</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="active">Active Only</option>
                <option value="all">All Statuses</option>
              </select>
            </div>
          </div>
          {(filterDoctor || filterType || filterStatus !== 'active') && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <button
                onClick={() => {
                  setFilterDoctor('');
                  setFilterType('');
                  setFilterStatus('active');
                }}
                className="text-xs text-gray-600 hover:text-gray-900 font-medium inline-flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Queue Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-900">Current Queue</h2>
            <span className="text-xs text-gray-500">
              {filteredQueue.length} {filteredQueue.length === 1 ? 'patient' : 'patients'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Queue #
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Patient
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Doctor / Room
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Wait Time
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Checked In
                  </th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredQueue.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center">
                      <div className="flex flex-col items-center">
                        <svg className="w-10 h-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p className="text-sm font-medium text-gray-900 mb-0.5">
                          {searchQuery || filterDoctor || filterType || filterStatus !== 'active' 
                            ? 'No patients match your filters' 
                            : 'No patients in queue'}
                        </p>
                        <p className="text-xs text-gray-500 mb-3">
                          {searchQuery || filterDoctor || filterType || filterStatus !== 'active' 
                            ? 'Try adjusting your search or filters' 
                            : 'Add a patient to get started'}
                        </p>
                        {!searchQuery && !filterDoctor && !filterType && filterStatus === 'active' && (
                          <button
                            onClick={() => setShowAddForm(true)}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                          >
                            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Patient
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredQueue.map((item) => (
                    <tr 
                      key={item._id} 
                      className={`hover:bg-gray-50 transition-colors ${
                        item.status === 'in-progress' ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-sm font-bold text-gray-900">{item.queueNumber}</div>
                        {item.priority !== undefined && item.priority < 3 && (
                          <div className="text-xs text-orange-600">Priority</div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 inline-flex text-xs font-semibold rounded-full ${getTypeColor(item.queueType)}`}>
                          {item.queueType}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link 
                          href={`/patients/${item.patient._id}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {item.patientName || `${item.patient?.firstName} ${item.patient?.lastName}`}
                        </Link>
                        <div className="text-xs text-gray-500">
                          {new Date(item.queuedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                        {item.doctor ? (
                          <div className="text-xs">Dr. {item.doctor.firstName} {item.doctor.lastName}</div>
                        ) : (
                          <div className="text-xs text-gray-400">Not assigned</div>
                        )}
                        {item.room && (
                          <div className="text-xs text-blue-600">Room: {item.room.name || item.room.roomNumber}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 inline-flex text-xs font-semibold rounded-full ${getStatusColor(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                        {item.estimatedWaitTime !== undefined && (
                          <div>Est: {item.estimatedWaitTime}m</div>
                        )}
                        <div className="text-gray-400">
                          {calculateWaitTime(item.queuedAt)}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {item.checkedIn ? (
                          <span className="text-green-600 text-xs font-medium">✓</span>
                        ) : (
                          <button
                            onClick={() => handleCheckIn(item._id)}
                            className="text-xs text-orange-600 hover:text-orange-800 hover:underline"
                          >
                            Check In
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right text-xs font-medium">
                        <div className="flex justify-end gap-1">
                          {item.status === 'waiting' && (
                            <>
                              <button
                                onClick={() => handleStatusUpdate(item._id, 'in-progress')}
                                className="px-1.5 py-0.5 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100"
                                title="Start"
                              >
                                Start
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(item._id, 'cancelled', item.patientName)}
                                className="px-1.5 py-0.5 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100"
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
                                className="px-1.5 py-0.5 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100"
                                title="Complete"
                              >
                                Done
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(item._id, 'no-show', item.patientName)}
                                className="px-1.5 py-0.5 text-xs font-medium text-yellow-700 bg-yellow-50 rounded hover:bg-yellow-100"
                                title="No-Show"
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

        {/* Add to Queue Modal */}
        {showAddForm && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
                setShowAddForm(false);
                setPatientSearch('');
                setSelectedPatient(null);
                setFormData({ ...formData, patientId: '' });
              }} />
              <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-md w-full z-10">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-base font-semibold text-gray-900">Add Patient to Queue</h2>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setPatientSearch('');
                      setSelectedPatient(null);
                      setFormData({ ...formData, patientId: '' });
                    }}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <form onSubmit={handleAddToQueue} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Patient *</label>
                    <div className="relative patient-search-container">
                      <input
                        type="text"
                        required
                        value={patientSearch}
                        onChange={(e) => {
                          setPatientSearch(e.target.value);
                          setShowPatientSearch(true);
                          if (!e.target.value) {
                            setFormData({ ...formData, patientId: '' });
                            setSelectedPatient(null);
                          }
                        }}
                        onFocus={() => setShowPatientSearch(true)}
                        placeholder="Type to search patients..."
                        className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                      {showPatientSearch && filteredPatients.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {filteredPatients.map((patient) => (
                            <button
                              key={patient._id}
                              type="button"
                              onClick={() => selectPatient(patient)}
                              className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                            >
                              <div className="font-medium">{patient.firstName} {patient.lastName}</div>
                              {patient.patientCode && (
                                <div className="text-xs text-gray-500">{patient.patientCode}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      {showPatientSearch && patientSearch && filteredPatients.length === 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg">
                          <div className="px-3 py-2 text-sm text-gray-500">No patients found</div>
                        </div>
                      )}
                    </div>
                    {formData.patientId && !selectedPatient && (
                      <p className="mt-1 text-xs text-red-600">Please select a valid patient from the list</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Doctor (Optional)</label>
                    <select
                      value={formData.doctorId}
                      onChange={(e) => setFormData({ ...formData, doctorId: e.target.value })}
                      className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">No doctor assigned</option>
                      {doctors.map((doctor) => (
                        <option key={doctor._id} value={doctor._id}>
                          Dr. {doctor.firstName} {doctor.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Queue Type *</label>
                    <select
                      required
                      value={formData.queueType}
                      onChange={(e) => setFormData({ ...formData, queueType: e.target.value as any })}
                      className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="walk-in">Walk-In</option>
                      <option value="appointment">Appointment</option>
                      <option value="follow-up">Follow-Up</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                      className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="0">Normal</option>
                      <option value="1">High</option>
                      <option value="2">Urgent</option>
                    </select>
                    <p className="mt-0.5 text-xs text-gray-500">Lower number = higher priority</p>
                  </div>
                  <div className="flex justify-end space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setPatientSearch('');
                        setSelectedPatient(null);
                        setFormData({ ...formData, patientId: '' });
                      }}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      Add to Queue
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Dialog */}
        {confirmAction && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmAction(null)} />
              <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-md w-full z-10">
                <h3 className="text-base font-semibold text-gray-900 mb-2">Confirm Action</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Are you sure you want to mark <strong>{confirmAction.patientName}</strong> as <strong>{confirmAction.action}</strong>?
                </p>
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      performStatusUpdate(confirmAction.id, confirmAction.action);
                      setConfirmAction(null);
                    }}
                    className={`px-3 py-1.5 text-sm font-medium text-white rounded-md ${
                      confirmAction.action === 'cancelled' 
                        ? 'bg-red-600 hover:bg-red-700' 
                        : 'bg-yellow-600 hover:bg-yellow-700'
                    }`}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

