'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Document {
  _id: string;
  documentCode: string;
  title: string;
  description?: string;
  category: string;
  documentType: 'pdf' | 'image' | 'word' | 'excel' | 'other';
  filename: string;
  originalFilename: string;
  contentType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  patient?: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
  };
  visit?: {
    _id: string;
    visitCode: string;
    date: string;
  };
  appointment?: {
    _id: string;
    appointmentCode: string;
  };
  labResult?: {
    _id: string;
    requestCode: string;
  };
  invoice?: {
    _id: string;
    invoiceNumber: string;
  };
  uploadedBy?: {
    _id: string;
    name: string;
  };
  uploadDate: string;
  lastModifiedBy?: {
    _id: string;
    name: string;
  };
  lastModifiedDate?: string;
  status: 'active' | 'archived' | 'deleted';
  isConfidential?: boolean;
  notes?: string;
  tags?: string[];
  scanned?: boolean;
  expiryDate?: string;
  referral?: {
    referringDoctor?: string;
    referringClinic?: string;
    referralDate?: string;
    reason?: string;
  };
  imaging?: {
    modality?: string;
    bodyPart?: string;
    studyDate?: string;
    radiologist?: string;
  };
  medicalCertificate?: {
    issueDate: string;
    validUntil?: string;
    purpose?: string;
    restrictions?: string;
  };
  labResultMetadata?: {
    testType?: string;
    testDate?: string;
    labName?: string;
  };
}

export default function DocumentDetailClient({ documentId }: { documentId: string }) {
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getCategoryLabel = (category: string) => {
    return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'archived':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'deleted':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  useEffect(() => {
    fetchDocument();
  }, [documentId]);

  const fetchDocument = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/documents/${documentId}`);

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
        setError(`API error: ${res.status} ${res.statusText}`);
        return;
      }

      if (!res.ok) {
        const errorMsg = data?.error || `Failed to load document: ${res.status} ${res.statusText}`;
        setError(errorMsg);
        return;
      }

      if (data.success && data.data) {
        setDocument(data.data);
      } else {
        setError(data.error || 'Failed to load document');
      }
    } catch (error: any) {
      console.error('Failed to fetch document:', error);
      setError(error.message || 'Failed to load document. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    window.open(`/api/documents/${documentId}/download`, '_blank');
  };

  const handleView = () => {
    window.open(`/api/documents/${documentId}/view`, '_blank');
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-purple-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-100 border-t-purple-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading document...</p>
          </div>
        </div>
      </section>
    );
  }

  if (error || !document) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-purple-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-full flex-shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-800 mb-1">Error</h3>
                <p className="text-sm text-red-700 mb-4">{error || 'Document not found'}</p>
                <button
                  onClick={() => router.push('/documents')}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold"
                >
                  ← Back to Documents
                </button>
              </div>
            </div>
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
            <div className="flex items-center gap-4">
              <Link
                href="/documents"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="flex items-center gap-3 flex-1">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Document Details</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Document #{document.documentCode}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {document.documentType === 'pdf' || document.documentType === 'image' ? (
                  <button
                    onClick={handleView}
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View
                  </button>
                ) : null}
                <button
                  onClick={handleDownload}
                  className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
              </div>
            </div>
          </div>

          {/* Document Info Card */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-6 sm:p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="flex flex-col gap-6">
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-purple-500 rounded-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900">Document Information</h2>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Document Code:</span>
                        <span className="font-bold text-gray-900">{document.documentCode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Title:</span>
                        <span className="font-medium text-gray-900">{document.title}</span>
                      </div>
                      {document.description && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Description:</span>
                          <span className="font-medium text-right max-w-xs text-gray-900">{document.description}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Category:</span>
                        <span className="font-medium text-gray-900">{getCategoryLabel(document.category)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Type:</span>
                        <span className="font-medium text-gray-900 uppercase">{document.documentType}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Status:</span>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(document.status)}`}>
                          {document.status.toUpperCase()}
                        </span>
                      </div>
                      {document.isConfidential && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Confidential:</span>
                          <span className="font-bold text-red-600">Yes</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-blue-500 rounded-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900">File Information</h2>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Filename:</span>
                        <span className="font-medium text-right max-w-xs truncate text-gray-900">{document.originalFilename}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Size:</span>
                        <span className="font-medium text-gray-900">{formatFileSize(document.size)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Content Type:</span>
                        <span className="font-medium text-gray-900">{document.contentType}</span>
                      </div>
                      {document.scanned && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Scanned:</span>
                          <span className="font-medium text-gray-900">Yes</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="flex flex-col gap-6">
                  <div className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 border border-cyan-200 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-cyan-500 rounded-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900">Relationships</h2>
                    </div>
                    <div className="space-y-3 text-sm">
                      {document.patient ? (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Patient:</span>
                          <Link href={`/patients/${document.patient._id}`} className="font-bold text-cyan-600 hover:text-cyan-700 hover:underline transition-colors">
                            {document.patient.firstName} {document.patient.lastName}
                            {document.patient.patientCode && ` (${document.patient.patientCode})`}
                          </Link>
                        </div>
                      ) : (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Patient:</span>
                          <span className="font-medium text-gray-500">N/A</span>
                        </div>
                      )}
                      {document.visit && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Visit:</span>
                          <Link href={`/visits/${document.visit._id}`} className="font-bold text-cyan-600 hover:text-cyan-700 hover:underline transition-colors">
                            {document.visit.visitCode}
                          </Link>
                        </div>
                      )}
                      {document.appointment && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Appointment:</span>
                          <Link href={`/appointments/${document.appointment._id}`} className="font-bold text-cyan-600 hover:text-cyan-700 hover:underline transition-colors">
                            {document.appointment.appointmentCode}
                          </Link>
                        </div>
                      )}
                      {document.labResult && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Lab Result:</span>
                          <Link href={`/lab-results/${document.labResult._id}`} className="font-bold text-cyan-600 hover:text-cyan-700 hover:underline transition-colors">
                            {document.labResult.requestCode}
                          </Link>
                        </div>
                      )}
                      {document.invoice && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Invoice:</span>
                          <Link href={`/invoices/${document.invoice._id}`} className="font-bold text-cyan-600 hover:text-cyan-700 hover:underline transition-colors">
                            {document.invoice.invoiceNumber}
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-gray-500 rounded-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900">Metadata</h2>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Uploaded By:</span>
                        <span className="font-medium text-gray-900">{document.uploadedBy?.name || 'Unknown'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Upload Date:</span>
                        <span className="font-medium text-gray-900">{formatDateTime(document.uploadDate)}</span>
                      </div>
                      {document.lastModifiedBy && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Last Modified By:</span>
                          <span className="font-medium text-gray-900">{document.lastModifiedBy.name}</span>
                        </div>
                      )}
                      {document.lastModifiedDate && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Last Modified:</span>
                          <span className="font-medium text-gray-900">{formatDateTime(document.lastModifiedDate)}</span>
                        </div>
                      )}
                      {document.expiryDate && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Expiry Date:</span>
                          <span className={`font-medium ${new Date(document.expiryDate) < new Date() ? 'text-red-600 font-bold' : 'text-gray-900'}`}>
                            {formatDate(document.expiryDate)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Document Preview */}
          {(document.documentType === 'pdf' || document.documentType === 'image') && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Preview</h2>
                </div>
              </div>
              <div className="p-5">
                <div className="border-2 border-gray-200 rounded-lg overflow-hidden bg-gray-50" style={{ minHeight: '500px' }}>
                  {document.documentType === 'pdf' ? (
                    <iframe
                      src={document.url}
                      className="w-full"
                      style={{ height: '600px' }}
                      title={document.title}
                    />
                  ) : (
                    <div className="flex items-center justify-center p-4">
                      <img
                        src={document.thumbnailUrl || document.url}
                        alt={document.title}
                        className="max-w-full max-h-[600px] object-contain rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                        onClick={() => window.open(document.url, '_blank')}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Category-Specific Information */}
          {document.referral && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Referral Information</h2>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {document.referral.referringDoctor && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Referring Doctor:</span>
                      <span className="font-medium text-gray-900">{document.referral.referringDoctor}</span>
                    </div>
                  )}
                  {document.referral.referringClinic && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Referring Clinic:</span>
                      <span className="font-medium text-gray-900">{document.referral.referringClinic}</span>
                    </div>
                  )}
                  {document.referral.referralDate && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Referral Date:</span>
                      <span className="font-medium text-gray-900">{formatDate(document.referral.referralDate)}</span>
                    </div>
                  )}
                  {document.referral.reason && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Reason:</span>
                      <span className="font-medium text-right max-w-xs text-gray-900">{document.referral.reason}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {document.imaging && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Imaging Information</h2>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {document.imaging.modality && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Modality:</span>
                      <span className="font-medium text-gray-900">{document.imaging.modality}</span>
                    </div>
                  )}
                  {document.imaging.bodyPart && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Body Part:</span>
                      <span className="font-medium text-gray-900">{document.imaging.bodyPart}</span>
                    </div>
                  )}
                  {document.imaging.studyDate && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Study Date:</span>
                      <span className="font-medium text-gray-900">{formatDate(document.imaging.studyDate)}</span>
                    </div>
                  )}
                  {document.imaging.radiologist && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Radiologist:</span>
                      <span className="font-medium text-gray-900">{document.imaging.radiologist}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {document.medicalCertificate && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Medical Certificate Information</h2>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Issue Date:</span>
                    <span className="font-medium text-gray-900">{formatDate(document.medicalCertificate.issueDate)}</span>
                  </div>
                  {document.medicalCertificate.validUntil && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Valid Until:</span>
                      <span className={`font-medium ${new Date(document.medicalCertificate.validUntil) < new Date() ? 'text-red-600 font-bold' : 'text-gray-900'}`}>
                        {formatDate(document.medicalCertificate.validUntil)}
                      </span>
                    </div>
                  )}
                  {document.medicalCertificate.purpose && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Purpose:</span>
                      <span className="font-medium text-gray-900">{document.medicalCertificate.purpose}</span>
                    </div>
                  )}
                  {document.medicalCertificate.restrictions && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Restrictions:</span>
                      <span className="font-medium text-right max-w-xs text-gray-900">{document.medicalCertificate.restrictions}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {document.labResultMetadata && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Lab Result Information</h2>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {document.labResultMetadata.testType && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Test Type:</span>
                      <span className="font-medium text-gray-900">{document.labResultMetadata.testType}</span>
                    </div>
                  )}
                  {document.labResultMetadata.testDate && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Test Date:</span>
                      <span className="font-medium text-gray-900">{formatDate(document.labResultMetadata.testDate)}</span>
                    </div>
                  )}
                  {document.labResultMetadata.labName && (
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Lab Name:</span>
                      <span className="font-medium text-gray-900">{document.labResultMetadata.labName}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tags */}
          {document.tags && document.tags.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-violet-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Tags</h2>
                </div>
              </div>
              <div className="p-5">
                <div className="flex flex-wrap gap-2">
                  {document.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 bg-violet-100 text-violet-700 rounded-full text-sm font-semibold border border-violet-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {document.notes && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Notes</h2>
                </div>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-900 whitespace-pre-wrap font-medium">{document.notes}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

