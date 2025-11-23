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
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: '256px' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p>Loading documents...</p>
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
              <h1 className="text-3xl font-bold mb-1">Documents</h1>
              <p className="text-sm text-gray-600">Manage clinic documents</p>
            </div>
            <Link 
              href="/documents/upload"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Upload Document
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
                    placeholder="Search by title, document code, or patient name..."
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
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[180px]">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
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
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Documents Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-3">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-semibold">Documents</h2>
                <p className="text-sm text-gray-600">
                  {filteredDocuments.length} {filteredDocuments.length === 1 ? 'document' : 'documents'}
                </p>
              </div>
              {filteredDocuments.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="mb-3">
                    <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-1">
                    {searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'No documents match your filters' : 'No documents found'}
                  </h3>
                  <div className="text-sm text-gray-600 mb-3">
                    {searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Upload your first document to get started'}
                  </div>
                  {!searchQuery && filterCategory === 'all' && filterStatus === 'all' && (
                    <Link 
                      href="/documents/upload"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Upload Document
                    </Link>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Document Code</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Title</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Category</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Type</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Patient</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Upload Date</th>
                        <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDocuments.map((doc) => (
                        <tr key={doc._id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3">
                            <p className="text-sm font-medium">{doc.documentCode}</p>
                          </td>
                          <td className="py-2 px-3">
                            <p className="text-sm truncate" style={{ maxWidth: '300px' }}>
                              {doc.title}
                            </p>
                          </td>
                          <td className="py-2 px-3">
                            <p className="text-sm text-gray-600">
                              {doc.category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </p>
                          </td>
                          <td className="py-2 px-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-gray-50 text-gray-700 border-gray-200">
                              {doc.documentType.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            {doc.patient?._id ? (
                              <Link href={`/patients/${doc.patient._id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
                                {doc.patient.firstName} {doc.patient.lastName}
                              </Link>
                            ) : (
                              <p className="text-sm text-gray-600">N/A</p>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <p className="text-sm text-gray-600">
                              {new Date(doc.uploadDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Link 
                              href={`/documents/${doc._id}`}
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
