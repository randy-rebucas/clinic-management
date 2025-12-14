'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from './ui/Modal';

interface Document {
  _id: string;
  documentCode: string;
  title: string;
  category: string;
  documentType: string;
  patient?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  uploadDate: string;
  status: 'active' | 'archived' | 'deleted';
}

export default function DocumentsPageClient() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const router = useRouter();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      
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
        setDocuments(data.data);
      } else {
        console.error('Failed to fetch documents:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter(doc => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const title = (doc.title || '').toLowerCase();
      const documentCode = (doc.documentCode || '').toLowerCase();
      const patientName = doc.patient ? `${doc.patient.firstName} ${doc.patient.lastName}`.toLowerCase() : '';
      if (!title.includes(query) && !documentCode.includes(query) && !patientName.includes(query)) return false;
    }
    if (filterCategory !== 'all' && doc.category !== filterCategory) return false;
    if (filterStatus !== 'all' && doc.status !== filterStatus) return false;
    return true;
  });

  const categories = Array.from(new Set(documents.map(d => d.category)));

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-purple-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-100 border-t-purple-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading documents...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-purple-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Documents</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Manage clinic documents</p>
                </div>
              </div>
              <Link 
                href="/documents/upload"
                className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Upload Document
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
                      placeholder="Search by title, document code, or patient name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-sm"
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
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[200px]">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="deleted">Deleted</option>
                  </select>
                </div>
                {(searchQuery || filterCategory !== 'all' || filterStatus !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setFilterCategory('all');
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

          {/* Documents Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-200 bg-gray-50/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Documents</h2>
                </div>
                <p className="text-sm font-semibold text-gray-600">
                  {filteredDocuments.length} {filteredDocuments.length === 1 ? 'document' : 'documents'}
                </p>
              </div>
            </div>
            <div className="p-5">
              {filteredDocuments.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'No documents match your filters' : 'No documents found'}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Upload your first document to get started'}
                  </p>
                  {!searchQuery && filterCategory === 'all' && filterStatus === 'all' && (
                    <Link 
                      href="/documents/upload"
                      className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all flex items-center gap-2 mx-auto text-sm font-semibold shadow-md"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Upload Document
                    </Link>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Document Code</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Title</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Category</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Patient</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Upload Date</th>
                        <th className="px-5 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredDocuments.map((doc) => (
                        <tr key={doc._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-4">
                            <p className="text-sm font-bold text-gray-900">{doc.documentCode}</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-gray-900 truncate" style={{ maxWidth: '300px' }}>
                              {doc.title}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-gray-600">
                              {doc.category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border bg-gray-100 text-gray-700 border-gray-200">
                              {doc.documentType.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            {doc.patient?._id ? (
                              <Link href={`/patients/${doc.patient._id}`} className="text-sm font-bold text-purple-600 hover:text-purple-700 hover:underline transition-colors">
                                {doc.patient.firstName} {doc.patient.lastName}
                              </Link>
                            ) : (
                              <p className="text-sm text-gray-500 font-medium">N/A</p>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-gray-900">
                              {new Date(doc.uploadDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Link 
                              href={`/documents/${doc._id}`}
                              className="inline-flex items-center px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-xs font-semibold border border-purple-200"
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
