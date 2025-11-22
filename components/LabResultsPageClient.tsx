'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reviewed':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'ordered':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
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

  if (loading) {
    return (
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-3 text-sm text-gray-600">Loading lab results...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-3">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-0.5">Lab Results</h1>
            <p className="text-gray-600 text-xs">Manage laboratory test results</p>
          </div>
          <Link
            href="/lab-results/new"
            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors mt-1.5 sm:mt-0"
          >
            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Lab Order
          </Link>
        </div>

        {/* Search and Filters */}
        <div className="mb-2 space-y-1.5">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by patient name, request code, or test type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full px-2.5 py-1 pl-8 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            <svg className="absolute left-2 top-1 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="block px-2 py-1 text-xs border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="ordered">Ordered</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="reviewed">Reviewed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {(searchQuery || filterStatus !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterStatus('all');
                }}
                className="text-xs text-gray-600 hover:text-gray-900 font-medium inline-flex items-center gap-1 px-2 py-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Lab Results Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-2.5 py-1.5 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-xs font-semibold text-gray-900">Lab Results</h2>
            <span className="text-xs text-gray-500">
              {filteredLabResults.length} {filteredLabResults.length === 1 ? 'result' : 'results'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Request Code
                  </th>
                  <th className="px-2 py-1 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Patient
                  </th>
                  <th className="px-2 py-1 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Test Type
                  </th>
                  <th className="px-2 py-1 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-2 py-1 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Order Date
                  </th>
                  <th className="px-2 py-1 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredLabResults.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-6 text-center">
                      <div className="flex flex-col items-center">
                        <svg className="w-8 h-8 text-gray-400 mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-xs font-medium text-gray-900 mb-0.5">
                          {searchQuery || filterStatus !== 'all' ? 'No lab results match your filters' : 'No lab results found'}
                        </p>
                        <p className="text-xs text-gray-500 mb-2">
                          {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first lab order to get started'}
                        </p>
                        {!searchQuery && filterStatus === 'all' && (
                          <Link
                            href="/lab-results/new"
                            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                          >
                            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            New Lab Order
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredLabResults.map((lab) => (
                    <tr key={lab._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-2 py-1.5 whitespace-nowrap text-xs font-medium text-gray-900">
                        {lab.requestCode || 'N/A'}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {lab.patient?._id ? (
                          <Link 
                            href={`/patients/${lab.patient._id}`}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {lab.patient.firstName} {lab.patient.lastName}
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-900">
                            {lab.patient?.firstName} {lab.patient?.lastName}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-600">
                        {lab.request?.testType || 'N/A'}
                        {lab.request?.urgency && (
                          <div className="text-xs text-orange-600 mt-0.5">
                            {lab.request.urgency} priority
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className={`px-1 py-0.5 inline-flex text-xs font-semibold rounded-full ${getStatusColor(lab.status)}`}>
                          {lab.status}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-500">
                        {new Date(lab.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {lab.resultDate && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            Result: {new Date(lab.resultDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-right text-xs font-medium">
                        <Link
                          href={`/lab-results/${lab._id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

