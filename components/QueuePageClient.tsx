'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Modal } from './ui/Modal';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDoctor, filterStatus]);

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-3">
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-10 bg-gray-200 rounded animate-pulse" />
            <div className="h-96 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </section>
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
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Notifications */}
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
              <h1 className="text-3xl font-bold mb-1">Queue Management</h1>
              <p className="text-sm text-gray-500">Monitor patient queue and flow</p>
            </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add to Queue
          </button>
          <button
            onClick={() => fetchQueue(true)}
            disabled={refreshing}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {refreshing ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-1.5" />
            ) : (
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <p className="text-xs text-gray-500 hidden sm:block">
            Auto-refreshes every 30s
          </p>
        </div>
      </div>

          {/* Search */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="p-2">
          <div className="relative flex items-center w-full">
            <svg className="absolute left-3 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by patient name or queue number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 p-1 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

          {/* Stats Cards */}
          <div className="flex gap-2 flex-wrap">
        <div className="bg-white border border-gray-200 rounded-lg flex-1 min-w-[150px]">
          <div className="p-2">
            <div className="text-xs text-gray-500 mb-1">Waiting</div>
            <div className="text-2xl font-bold text-yellow-600">
              {queue.filter(q => q.status === 'waiting').length}
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg flex-1 min-w-[150px]">
          <div className="p-2">
            <div className="text-xs text-gray-500 mb-1">In Progress</div>
            <div className="text-2xl font-bold text-blue-600">
              {queue.filter(q => q.status === 'in-progress').length}
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg flex-1 min-w-[150px]">
          <div className="p-2">
            <div className="text-xs text-gray-500 mb-1">Not Checked In</div>
            <div className="text-2xl font-bold text-orange-600">
              {queue.filter(q => !q.checkedIn && (q.status === 'waiting' || q.status === 'in-progress')).length}
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg flex-1 min-w-[150px]">
          <div className="p-2">
            <div className="text-xs text-gray-500 mb-1">Total Active</div>
            <div className="text-2xl font-bold">
              {activeQueue.length}
            </div>
          </div>
        </div>
      </div>

          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="p-3">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium mb-1">Doctor</label>
              <select
                value={filterDoctor || ''}
                onChange={(e) => setFilterDoctor(e.target.value === 'all' ? '' : e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              >
                <option value="all">All Doctors</option>
                {doctors.map((doctor) => (
                  <option key={doctor._id} value={doctor._id}>
                    Dr. {doctor.firstName} {doctor.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium mb-1">Queue Type</label>
              <select
                value={filterType || ''}
                onChange={(e) => setFilterType(e.target.value === 'all' ? '' : e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              >
                <option value="all">All Types</option>
                <option value="appointment">Appointment</option>
                <option value="walk-in">Walk-In</option>
                <option value="follow-up">Follow-Up</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              >
                <option value="active">Active Only</option>
                <option value="all">All Statuses</option>
              </select>
            </div>
          </div>
          {(filterDoctor || filterType || filterStatus !== 'active') && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <button
                onClick={() => {
                  setFilterDoctor('');
                  setFilterType('');
                  setFilterStatus('active');
                }}
                className="px-2 py-1 text-gray-700 hover:bg-gray-100 rounded text-xs flex items-center"
              >
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

          {/* Queue Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-3 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Current Queue</h3>
            <p className="text-xs text-gray-500">
              {filteredQueue.length} {filteredQueue.length === 1 ? 'patient' : 'patients'}
            </p>
          </div>
        </div>
        {filteredQueue.length === 0 ? (
          <div className="p-8 text-center">
            <div className="mb-2">
              <svg className="w-10 h-10 mx-auto text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-1">
              {searchQuery || filterDoctor || filterType || filterStatus !== 'active' 
                ? 'No patients match your filters' 
                : 'No patients in queue'}
            </h3>
            <p className="text-sm text-gray-500 mb-3">
              {searchQuery || filterDoctor || filterType || filterStatus !== 'active' 
                ? 'Try adjusting your search or filters' 
                : 'Add a patient to get started'}
            </p>
            {!searchQuery && !filterDoctor && !filterType && filterStatus === 'active' && (
              <button
                onClick={() => setShowAddForm(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center mx-auto"
              >
                <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Queue #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Doctor / Room</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Wait Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Checked In</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredQueue.map((item) => (
                  <tr 
                    key={item._id}
                    className={item.status === 'in-progress' ? 'bg-blue-50' : 'hover:bg-gray-50'}
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm font-bold">{item.queueNumber}</div>
                      {item.priority !== undefined && item.priority < 3 && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded">Priority</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        getTypeColor(item.queueType) === 'blue' ? 'bg-blue-100 text-blue-800' :
                        getTypeColor(item.queueType) === 'purple' ? 'bg-purple-100 text-purple-800' :
                        getTypeColor(item.queueType) === 'green' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {item.queueType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/patients/${item.patient._id}`}>
                        <div className="text-sm font-medium text-blue-600 hover:underline">
                          {item.patientName || `${item.patient?.firstName} ${item.patient?.lastName}`}
                        </div>
                      </Link>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(item.queuedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.doctor ? (
                        <div className="text-xs">Dr. {item.doctor.firstName} {item.doctor.lastName}</div>
                      ) : (
                        <div className="text-xs text-gray-500">Not assigned</div>
                      )}
                      {item.room && (
                        <div className="text-xs text-blue-600 mt-1">Room: {item.room.name || item.room.roomNumber}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        getStatusColor(item.status) === 'green' ? 'bg-green-100 text-green-800' :
                        getStatusColor(item.status) === 'blue' ? 'bg-blue-100 text-blue-800' :
                        getStatusColor(item.status) === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                        getStatusColor(item.status) === 'red' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.estimatedWaitTime !== undefined && (
                        <div className="text-xs">Est: {item.estimatedWaitTime}m</div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {calculateWaitTime(item.queuedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.checkedIn ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">✓</span>
                      ) : (
                        <button
                          onClick={() => handleCheckIn(item._id)}
                          className="px-2 py-1 text-orange-700 hover:bg-orange-50 rounded transition-colors text-xs"
                        >
                          Check In
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        {item.status === 'waiting' && (
                          <>
                            <button
                              onClick={() => handleStatusUpdate(item._id, 'in-progress')}
                              className="px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors text-xs"
                              title="Start"
                            >
                              Start
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(item._id, 'cancelled', item.patientName)}
                              className="px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors text-xs"
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
                              className="px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors text-xs"
                              title="Complete"
                            >
                              Done
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(item._id, 'no-show', item.patientName)}
                              className="px-2 py-1 bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100 transition-colors text-xs"
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

          {/* Add to Queue Modal */}
          <Modal open={showAddForm} onOpenChange={(open) => {
        setShowAddForm(open);
        if (!open) {
          setPatientSearch('');
          setSelectedPatient(null);
          setFormData({ ...formData, patientId: '' });
        }
      }} className="max-w-lg">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Add Patient to Queue</h2>
          <p className="text-sm text-gray-500 mb-4">
            Add a new patient to the queue system
          </p>
          <form onSubmit={handleAddToQueue}>
            <div className="flex flex-col gap-3">
              <div>
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
                        setFormData({ ...formData, patientId: '' });
                        setSelectedPatient(null);
                      }
                    }}
                    onFocus={() => setShowPatientSearch(true)}
                    placeholder="Type to search patients..."
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  {showPatientSearch && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
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
                              className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded transition-colors flex flex-col items-start"
                            >
                              <span className="font-medium text-sm">{patient.firstName} {patient.lastName}</span>
                              {patient.patientCode && (
                                <span className="text-xs text-gray-500">{patient.patientCode}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : patientSearch ? (
                        <p className="text-sm text-gray-500 p-2">No patients found</p>
                      ) : (
                        <p className="text-sm text-gray-500 p-2">Start typing to search...</p>
                      )}
                    </div>
                  )}
                </div>
                {formData.patientId && !selectedPatient && (
                  <p className="text-xs text-red-600 mt-1">Please select a valid patient from the list</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Doctor (Optional)</label>
                <select
                  value={formData.doctorId || 'none'}
                  onChange={(e) => setFormData({ ...formData, doctorId: e.target.value === 'none' ? '' : e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                <label className="block text-sm font-medium mb-1">Queue Type <span className="text-red-500">*</span></label>
                <select
                  value={formData.queueType}
                  onChange={(e) => setFormData({ ...formData, queueType: e.target.value as any })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="walk-in">Walk-In</option>
                  <option value="appointment">Appointment</option>
                  <option value="follow-up">Follow-Up</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Priority</label>
                <select
                  value={formData.priority.toString()}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="0">Normal</option>
                  <option value="1">High</option>
                  <option value="2">Urgent</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Lower number = higher priority</p>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPatientSearch('');
                    setSelectedPatient(null);
                    setFormData({ ...formData, patientId: '' });
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
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
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-2">Confirm Action</h3>
          <p className="text-sm text-gray-500 mb-4">
            Are you sure you want to mark <strong>{confirmAction?.patientName}</strong> as <strong>{confirmAction?.action}</strong>?
          </p>
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={() => setConfirmAction(null)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
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
              className={`px-4 py-2 rounded-md text-white transition-colors ${
                confirmAction?.action === 'cancelled' 
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

