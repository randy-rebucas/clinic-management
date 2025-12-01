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
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3 min-h-[256px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-500">Loading document...</p>
          </div>
        </div>
      </section>
    );
  }

  if (error || !document) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="text-sm text-red-700 mt-1">{error || 'Document not found'}</p>
                <button
                  onClick={() => router.push('/documents')}
                  className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
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
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Link
              href="/documents"
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-1">Document Details</h1>
              <p className="text-sm text-gray-600">Document #{document.documentCode}</p>
            </div>
            <div className="flex gap-2">
              {document.documentType === 'pdf' || document.documentType === 'image' ? (
                <button
                  onClick={handleView}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View
                </button>
              ) : null}
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
          </div>

          {/* Document Info Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-lg font-semibold mb-3">Document Information</h2>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Document Code:</span>
                        <span className="font-medium">{document.documentCode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Title:</span>
                        <span className="font-medium">{document.title}</span>
                      </div>
                      {document.description && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Description:</span>
                          <span className="font-medium text-right max-w-xs">{document.description}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">Category:</span>
                        <span className="font-medium">{getCategoryLabel(document.category)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Type:</span>
                        <span className="font-medium uppercase">{document.documentType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Status:</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(document.status)}`}>
                          {document.status.toUpperCase()}
                        </span>
                      </div>
                      {document.isConfidential && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Confidential:</span>
                          <span className="font-medium text-red-600">Yes</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold mb-3">File Information</h2>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Filename:</span>
                        <span className="font-medium text-right max-w-xs truncate">{document.originalFilename}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Size:</span>
                        <span className="font-medium">{formatFileSize(document.size)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Content Type:</span>
                        <span className="font-medium">{document.contentType}</span>
                      </div>
                      {document.scanned && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Scanned:</span>
                          <span className="font-medium">Yes</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-lg font-semibold mb-3">Relationships</h2>
                    <div className="space-y-2 text-sm">
                      {document.patient ? (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Patient:</span>
                          <Link href={`/patients/${document.patient._id}`} className="font-medium text-blue-600 hover:underline">
                            {document.patient.firstName} {document.patient.lastName}
                            {document.patient.patientCode && ` (${document.patient.patientCode})`}
                          </Link>
                        </div>
                      ) : (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Patient:</span>
                          <span className="font-medium text-gray-500">N/A</span>
                        </div>
                      )}
                      {document.visit ? (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Visit:</span>
                          <Link href={`/visits/${document.visit._id}`} className="font-medium text-blue-600 hover:underline">
                            {document.visit.visitCode}
                          </Link>
                        </div>
                      ) : null}
                      {document.appointment ? (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Appointment:</span>
                          <Link href={`/appointments/${document.appointment._id}`} className="font-medium text-blue-600 hover:underline">
                            {document.appointment.appointmentCode}
                          </Link>
                        </div>
                      ) : null}
                      {document.labResult ? (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Lab Result:</span>
                          <Link href={`/lab-results/${document.labResult._id}`} className="font-medium text-blue-600 hover:underline">
                            {document.labResult.requestCode}
                          </Link>
                        </div>
                      ) : null}
                      {document.invoice ? (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Invoice:</span>
                          <Link href={`/invoices/${document.invoice._id}`} className="font-medium text-blue-600 hover:underline">
                            {document.invoice.invoiceNumber}
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold mb-3">Metadata</h2>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Uploaded By:</span>
                        <span className="font-medium">{document.uploadedBy?.name || 'Unknown'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Upload Date:</span>
                        <span className="font-medium">{formatDateTime(document.uploadDate)}</span>
                      </div>
                      {document.lastModifiedBy && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Last Modified By:</span>
                          <span className="font-medium">{document.lastModifiedBy.name}</span>
                        </div>
                      )}
                      {document.lastModifiedDate && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Last Modified:</span>
                          <span className="font-medium">{formatDateTime(document.lastModifiedDate)}</span>
                        </div>
                      )}
                      {document.expiryDate && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Expiry Date:</span>
                          <span className={`font-medium ${new Date(document.expiryDate) < new Date() ? 'text-red-600' : ''}`}>
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
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">Preview</h2>
                <div className="border border-gray-200 rounded-lg overflow-hidden" style={{ minHeight: '500px' }}>
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
                        className="max-w-full max-h-[600px] object-contain"
                        onClick={() => window.open(document.url, '_blank')}
                        style={{ cursor: 'pointer' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Category-Specific Information */}
          {document.referral && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">Referral Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {document.referral.referringDoctor && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Referring Doctor:</span>
                      <span className="font-medium">{document.referral.referringDoctor}</span>
                    </div>
                  )}
                  {document.referral.referringClinic && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Referring Clinic:</span>
                      <span className="font-medium">{document.referral.referringClinic}</span>
                    </div>
                  )}
                  {document.referral.referralDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Referral Date:</span>
                      <span className="font-medium">{formatDate(document.referral.referralDate)}</span>
                    </div>
                  )}
                  {document.referral.reason && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Reason:</span>
                      <span className="font-medium text-right max-w-xs">{document.referral.reason}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {document.imaging && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">Imaging Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {document.imaging.modality && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Modality:</span>
                      <span className="font-medium">{document.imaging.modality}</span>
                    </div>
                  )}
                  {document.imaging.bodyPart && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Body Part:</span>
                      <span className="font-medium">{document.imaging.bodyPart}</span>
                    </div>
                  )}
                  {document.imaging.studyDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Study Date:</span>
                      <span className="font-medium">{formatDate(document.imaging.studyDate)}</span>
                    </div>
                  )}
                  {document.imaging.radiologist && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Radiologist:</span>
                      <span className="font-medium">{document.imaging.radiologist}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {document.medicalCertificate && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">Medical Certificate Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Issue Date:</span>
                    <span className="font-medium">{formatDate(document.medicalCertificate.issueDate)}</span>
                  </div>
                  {document.medicalCertificate.validUntil && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Valid Until:</span>
                      <span className={`font-medium ${new Date(document.medicalCertificate.validUntil) < new Date() ? 'text-red-600' : ''}`}>
                        {formatDate(document.medicalCertificate.validUntil)}
                      </span>
                    </div>
                  )}
                  {document.medicalCertificate.purpose && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Purpose:</span>
                      <span className="font-medium">{document.medicalCertificate.purpose}</span>
                    </div>
                  )}
                  {document.medicalCertificate.restrictions && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Restrictions:</span>
                      <span className="font-medium text-right max-w-xs">{document.medicalCertificate.restrictions}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {document.labResultMetadata && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">Lab Result Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {document.labResultMetadata.testType && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Test Type:</span>
                      <span className="font-medium">{document.labResultMetadata.testType}</span>
                    </div>
                  )}
                  {document.labResultMetadata.testDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Test Date:</span>
                      <span className="font-medium">{formatDate(document.labResultMetadata.testDate)}</span>
                    </div>
                  )}
                  {document.labResultMetadata.labName && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Lab Name:</span>
                      <span className="font-medium">{document.labResultMetadata.labName}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tags */}
          {document.tags && document.tags.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">Tags</h2>
                <div className="flex flex-wrap gap-2">
                  {document.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
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
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">Notes</h2>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{document.notes}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

