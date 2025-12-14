'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Visit {
  _id: string;
  visitCode: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
  } | null;
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

export default function VisitsPageClient() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchData();
    
    // Check for success message from query params (when redirected from new visit page)
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setSuccess('Visit created successfully!');
      setTimeout(() => setSuccess(null), 3000);
      // Clean up URL
      window.history.replaceState({}, '', '/visits');
    }
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/visits');

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success) setVisits(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredVisits = visits.filter(visit => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const patientName = visit.patient 
        ? `${visit.patient.firstName} ${visit.patient.lastName}`.toLowerCase()
        : '';
      const visitCode = visit.visitCode.toLowerCase();
      // If patient is null and query doesn't match visit code, exclude from results
      if (!visit.patient && !visitCode.includes(query)) return false;
      // If patient exists, check both patient name and visit code
      if (visit.patient && !patientName.includes(query) && !visitCode.includes(query)) return false;
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
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-100 border-t-blue-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading visits...</p>
          </div>
        </div>
      </section>
    );
  }

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
                <div className="p-2 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Clinical Visits</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Manage consultations and clinical notes</p>
                </div>
              </div>
              <Link
                href="/visits/new"
                className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Visit
              </Link>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-5">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 transform -translate-y-1/2 p-1.5">
                      <svg className="w-5 h-5 text-gray-400" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search by patient name or visit code..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <div className="min-w-[200px]">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm bg-white"
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
                    className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

      {/* Visits List */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 bg-gray-50/50">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Visits</h3>
            </div>
            <p className="text-sm font-semibold text-gray-600">
              {filteredVisits.length} {filteredVisits.length === 1 ? 'visit' : 'visits'}
            </p>
          </div>
        </div>
        <div className="p-5">
          {filteredVisits.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {searchQuery || filterStatus !== 'all' ? 'No visits match your filters' : 'No visits found'}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first clinical visit to get started'}
              </p>
              {!searchQuery && filterStatus === 'all' && (
                <Link href="/visits/new" className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all flex items-center gap-2 mx-auto text-sm font-semibold shadow-md">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Visit
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Visit Code</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Patient</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Diagnoses</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredVisits.map((visit) => (
                    <tr key={visit._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="text-sm font-bold text-gray-900">{visit.visitCode}</div>
                      </td>
                      <td className="px-5 py-4">
                        {visit.patient ? (
                          <>
                            <Link href={`/patients/${visit.patient._id}`}>
                              <div className="text-sm font-bold text-teal-600 hover:text-teal-700 hover:underline transition-colors">
                                {visit.patient.firstName} {visit.patient.lastName}
                              </div>
                            </Link>
                            {visit.patient.patientCode && (
                              <div className="text-xs text-gray-600 mt-1">{visit.patient.patientCode}</div>
                            )}
                          </>
                        ) : (
                          <div className="text-sm text-gray-400 italic">No patient assigned</div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm text-gray-900">
                          {new Date(visit.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm capitalize text-gray-900 font-medium">{visit.visitType}</div>
                      </td>
                      <td className="px-5 py-4">
                        {visit.diagnoses.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {visit.diagnoses.slice(0, 2).map((diag, idx) => (
                              <div key={idx} className="text-xs">
                                {diag.code && <span className="font-mono text-teal-600 font-semibold">{diag.code}</span>}
                                {diag.description && <span className="text-gray-600"> - {diag.description}</span>}
                              </div>
                            ))}
                            {visit.diagnoses.length > 2 && (
                              <div className="text-xs text-gray-500 font-medium">+{visit.diagnoses.length - 2} more</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">—</div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 text-xs rounded-full font-semibold border ${
                          getStatusColor(visit.status) === 'green' ? 'bg-green-100 text-green-700 border-green-200' :
                          getStatusColor(visit.status) === 'blue' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                          getStatusColor(visit.status) === 'red' ? 'bg-red-100 text-red-700 border-red-200' :
                          'bg-gray-100 text-gray-700 border-gray-200'
                        }`}>
                          {visit.status}
                        </span>
                        {visit.digitalSignature && (
                          <div className="text-xs text-green-600 font-semibold mt-1.5">✓ Signed</div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/visits/${visit._id}`}>
                          <button className="px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors text-xs font-semibold border border-teal-200">
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
