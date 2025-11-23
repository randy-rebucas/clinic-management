'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from './ui/Modal';

interface LabResult {
  _id: string;
  requestCode?: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  request: {
    testType: string;
    urgency?: string;
  };
  status: 'ordered' | 'in-progress' | 'completed' | 'reviewed' | 'cancelled';
  orderDate: string;
  resultDate?: string;
}

export default function LabResultsPageClient() {
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const router = useRouter();

  useEffect(() => {
    fetchLabResults();
  }, []);

  const fetchLabResults = async () => {
    try {
      const res = await fetch('/api/lab-results');
      
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
        setLabResults(data.data);
      } else {
        console.error('Failed to fetch lab results:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch lab results:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): 'green' | 'blue' | 'yellow' | 'gray' | 'red' => {
    switch (status) {
      case 'reviewed':
        return 'green';
      case 'completed':
        return 'blue';
      case 'in-progress':
        return 'yellow';
      case 'ordered':
        return 'gray';
      case 'cancelled':
        return 'red';
      default:
        return 'gray';
    }
  };

  const filteredLabResults = labResults.filter(lab => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const patientName = `${lab.patient?.firstName || ''} ${lab.patient?.lastName || ''}`.toLowerCase();
      const requestCode = (lab.requestCode || '').toLowerCase();
      const testType = (lab.request?.testType || '').toLowerCase();
      if (!patientName.includes(query) && !requestCode.includes(query) && !testType.includes(query)) return false;
    }
    if (filterStatus !== 'all' && lab.status !== filterStatus) return false;
    return true;
  });

  const getBadgeColorClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      green: 'bg-green-100 text-green-800 border-green-200',
      blue: 'bg-blue-100 text-blue-800 border-blue-200',
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      gray: 'bg-gray-100 text-gray-800 border-gray-200',
      red: 'bg-red-100 text-red-800 border-red-200',
      orange: 'bg-orange-100 text-orange-800 border-orange-200',
    };
    return colorMap[color] || colorMap.gray;
  };

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-3">
            <div className="h-8 w-48 bg-gray-200 animate-pulse rounded" />
            <div className="h-10 bg-gray-200 animate-pulse rounded" />
            <div className="h-72 bg-gray-200 animate-pulse rounded" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold mb-1">Lab Results</h1>
              <p className="text-sm text-gray-600">Manage laboratory test results</p>
            </div>
            <Link 
              href="/lab-results/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Lab Order
            </Link>
          </div>

          {/* Search and Filters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search by patient name, request code, or test type..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  )}
                </div>
                <div className="min-w-[180px]">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                  >
                    <option value="all">All Statuses</option>
                    <option value="ordered">Ordered</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                {(searchQuery || filterStatus !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setFilterStatus('all');
                    }}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Lab Results Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-3">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-semibold">Lab Results</h2>
                <p className="text-sm text-gray-600">
                  {filteredLabResults.length} {filteredLabResults.length === 1 ? 'result' : 'results'}
                </p>
              </div>
              {filteredLabResults.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="mb-3">
                    <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-1">
                    {searchQuery || filterStatus !== 'all' ? 'No lab results match your filters' : 'No lab results found'}
                  </h3>
                  <div className="text-sm text-gray-600 mb-3">
                    {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first lab order to get started'}
                  </div>
                  {!searchQuery && filterStatus === 'all' && (
                    <Link 
                      href="/lab-results/new"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      New Lab Order
                    </Link>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Request Code</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Patient</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Test Type</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Status</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Order Date</th>
                        <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLabResults.map((lab) => (
                        <tr key={lab._id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3">
                            <p className="text-sm font-medium">{lab.requestCode || 'N/A'}</p>
                          </td>
                          <td className="py-2 px-3">
                            {lab.patient?._id ? (
                              <Link href={`/patients/${lab.patient._id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
                                {lab.patient.firstName} {lab.patient.lastName}
                              </Link>
                            ) : (
                              <p className="text-sm">
                                {lab.patient?.firstName} {lab.patient?.lastName}
                              </p>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex flex-col gap-1">
                              <p className="text-sm">{lab.request?.testType || 'N/A'}</p>
                              {lab.request?.urgency && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getBadgeColorClasses('orange')}`}>
                                  {lab.request.urgency} priority
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getBadgeColorClasses(getStatusColor(lab.status))}`}>
                              {lab.status}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex flex-col gap-1">
                              <p className="text-sm">
                                {new Date(lab.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                              {lab.resultDate && (
                                <p className="text-xs text-gray-600">
                                  Result: {new Date(lab.resultDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Link 
                              href={`/lab-results/${lab._id}`}
                              className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors text-xs font-medium"
                            >
                              View
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
