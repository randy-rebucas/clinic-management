'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import VisitForm from './VisitForm';
import { Modal } from './ui/Modal';

interface Visit {
  _id: string;
  visitCode: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
  };
  provider?: {
    _id: string;
    name: string;
  };
  date: string;
  visitType: string;
  chiefComplaint?: string;
  diagnoses: Array<{
    code?: string;
    description?: string;
    primary?: boolean;
  }>;
  status: string;
  followUpDate?: string;
  digitalSignature?: {
    providerName: string;
    signedAt: string;
  };
}

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
}

export default function VisitsPageClient() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providerName, setProviderName] = useState('Dr. Provider');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchData();
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/user/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setProviderName(data.data.name || 'Dr. Provider');
        }
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  };

  const fetchData = async () => {
    try {
      const [visitsRes, patientsRes] = await Promise.all([
        fetch('/api/visits'),
        fetch('/api/patients'),
      ]);

      if (visitsRes.status === 401 || patientsRes.status === 401) {
        router.push('/login');
        return;
      }

      const parseResponse = async (res: Response) => {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await res.json();
        }
        return { success: false };
      };

      const visitsData = await parseResponse(visitsRes);
      const patientsData = await parseResponse(patientsRes);

      if (visitsData.success) setVisits(visitsData.data);
      if (patientsData.success) setPatients(patientsData.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
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

  const handleSubmit = async (formData: any) => {
    try {
      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          date: new Date(),
          followUpDate: formData.followUpDate ? new Date(formData.followUpDate) : undefined,
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
        showNotification('Failed to create visit: API error', 'error');
        return;
      }

      if (data.success) {
        setShowForm(false);
        fetchData();
        showNotification('Visit created successfully!', 'success');
      } else {
        showNotification('Error: ' + data.error, 'error');
      }
    } catch (error) {
      console.error('Failed to create visit:', error);
      showNotification('Failed to create visit', 'error');
    }
  };

  const filteredVisits = visits.filter(visit => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const patientName = `${visit.patient.firstName} ${visit.patient.lastName}`.toLowerCase();
      const visitCode = visit.visitCode.toLowerCase();
      if (!patientName.includes(query) && !visitCode.includes(query)) return false;
    }
    if (filterStatus !== 'all' && visit.status !== filterStatus) return false;
    return true;
  });

  const getStatusColor = (status: string): 'green' | 'blue' | 'red' | 'gray' => {
    switch (status) {
      case 'closed':
        return 'green';
      case 'open':
        return 'blue';
      case 'cancelled':
        return 'red';
      default:
        return 'gray';
    }
  };

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3 min-h-[256px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p>Loading visits...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
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
              <h1 className="text-3xl font-bold mb-1">Clinical Visits</h1>
              <p className="text-sm text-gray-500">Manage consultations and clinical notes</p>
            </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Visit
        </button>
      </div>

          {/* Search and Filters */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search by patient name or visit code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="min-w-[180px]">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            {(searchQuery || filterStatus !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterStatus('all');
                }}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Form Modal */}
      <Modal open={showForm} onOpenChange={(open) => {
        if (!open) {
          setShowForm(false);
        }
      }} className="max-w-4xl">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">New Clinical Visit</h2>
          <div className="py-4">
            <VisitForm
              patients={patients}
              onSubmit={handleSubmit}
              onCancel={() => setShowForm(false)}
              providerName={providerName}
            />
          </div>
        </div>
      </Modal>

      {/* Visits List */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="p-3">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">Visits</h3>
            <p className="text-sm text-gray-500">
              {filteredVisits.length} {filteredVisits.length === 1 ? 'visit' : 'visits'}
            </p>
          </div>
          {filteredVisits.length === 0 ? (
            <div className="p-8 text-center">
              <div className="mb-3">
                <svg className="w-12 h-12 mx-auto text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-1">
                {searchQuery || filterStatus !== 'all' ? 'No visits match your filters' : 'No visits found'}
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first clinical visit to get started'}
              </p>
              {!searchQuery && filterStatus === 'all' && (
                <button onClick={() => setShowForm(true)} className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center mx-auto">
                  <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Visit
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Visit Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Patient</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Diagnoses</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredVisits.map((visit) => (
                    <tr key={visit._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium">{visit.visitCode}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/patients/${visit.patient._id}`}>
                          <div className="text-sm font-medium text-blue-600 hover:underline">
                            {visit.patient.firstName} {visit.patient.lastName}
                          </div>
                        </Link>
                        {visit.patient.patientCode && (
                          <div className="text-xs text-gray-500">{visit.patient.patientCode}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">
                          {new Date(visit.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm capitalize">{visit.visitType}</div>
                      </td>
                      <td className="px-4 py-3">
                        {visit.diagnoses.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {visit.diagnoses.slice(0, 2).map((diag, idx) => (
                              <div key={idx} className="text-xs">
                                {diag.code && <span className="font-mono">{diag.code}</span>}
                                {diag.description && ` - ${diag.description}`}
                              </div>
                            ))}
                            {visit.diagnoses.length > 2 && (
                              <div className="text-xs text-gray-500">+{visit.diagnoses.length - 2} more</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">—</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          getStatusColor(visit.status) === 'green' ? 'bg-green-100 text-green-800' :
                          getStatusColor(visit.status) === 'blue' ? 'bg-blue-100 text-blue-800' :
                          getStatusColor(visit.status) === 'red' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {visit.status}
                        </span>
                        {visit.digitalSignature && (
                          <div className="text-xs text-green-600 mt-1">✓ Signed</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/visits/${visit._id}`}>
                          <button className="px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors text-xs">
                            View
                          </button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
        </div>
      </div>
    </section>
  );
}
