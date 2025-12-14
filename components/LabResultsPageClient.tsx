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
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-cyan-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-cyan-100 border-t-cyan-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading lab results...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-cyan-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Lab Results</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Manage laboratory test results</p>
                </div>
              </div>
              <Link 
                href="/lab-results/new"
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-lg hover:from-cyan-600 hover:to-cyan-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Lab Order
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
                      placeholder="Search by patient name, request code, or test type..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                    {searchQuery && (
                      <button
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all text-sm bg-white"
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
                    className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Lab Results Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-200 bg-gray-50/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Lab Results</h2>
                </div>
                <p className="text-sm font-semibold text-gray-600">
                  {filteredLabResults.length} {filteredLabResults.length === 1 ? 'result' : 'results'}
                </p>
              </div>
            </div>
            <div className="p-5">
              {filteredLabResults.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {searchQuery || filterStatus !== 'all' ? 'No lab results match your filters' : 'No lab results found'}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first lab order to get started'}
                  </p>
                  {!searchQuery && filterStatus === 'all' && (
                    <Link 
                      href="/lab-results/new"
                      className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-lg hover:from-cyan-600 hover:to-cyan-700 transition-all flex items-center gap-2 mx-auto text-sm font-semibold shadow-md"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      New Lab Order
                    </Link>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Request Code</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Patient</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Test Type</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Order Date</th>
                        <th className="px-5 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredLabResults.map((lab) => (
                        <tr key={lab._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-4">
                            <p className="text-sm font-bold text-gray-900">{lab.requestCode || 'N/A'}</p>
                          </td>
                          <td className="px-5 py-4">
                            {lab.patient?._id ? (
                              <Link href={`/patients/${lab.patient._id}`} className="text-sm font-bold text-cyan-600 hover:text-cyan-700 hover:underline transition-colors">
                                {lab.patient.firstName} {lab.patient.lastName}
                              </Link>
                            ) : (
                              <p className="text-sm font-medium text-gray-900">
                                {lab.patient?.firstName} {lab.patient?.lastName}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-col gap-1">
                              <p className="text-sm font-medium text-gray-900">{lab.request?.testType || 'N/A'}</p>
                              {lab.request?.urgency && (
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getBadgeColorClasses('orange')}`}>
                                  {lab.request.urgency} priority
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getBadgeColorClasses(getStatusColor(lab.status))}`}>
                              {lab.status}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-col gap-1">
                              <p className="text-sm font-medium text-gray-900">
                                {new Date(lab.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                              {lab.resultDate && (
                                <p className="text-xs text-gray-600 font-medium">
                                  Result: {new Date(lab.resultDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Link 
                              href={`/lab-results/${lab._id}`}
                              className="inline-flex items-center px-3 py-1.5 bg-cyan-50 text-cyan-700 rounded-lg hover:bg-cyan-100 transition-colors text-xs font-semibold border border-cyan-200"
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
