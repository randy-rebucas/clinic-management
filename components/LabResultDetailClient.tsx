'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface LabResult {
  _id: string;
  requestCode?: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
  };
  visit?: {
    _id: string;
    visitCode: string;
    date: string;
    visitType?: string;
  };
  orderedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  reviewedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  orderDate: string;
  request: {
    testType: string;
    testCode?: string;
    description?: string;
    urgency?: 'routine' | 'urgent' | 'stat';
    specialInstructions?: string;
    fastingRequired?: boolean;
    preparationNotes?: string;
  };
  thirdPartyLab?: {
    labName: string;
    labId?: string;
    labCode?: string;
    integrationType?: 'manual' | 'api' | 'hl7' | 'other';
    status?: 'pending' | 'sent' | 'received' | 'error';
    sentAt?: string;
    receivedAt?: string;
    errorMessage?: string;
  };
  results?: any;
  resultDate?: string;
  interpretation?: string;
  referenceRanges?: any;
  abnormalFlags?: Record<string, 'high' | 'low' | 'normal'>;
  status: 'ordered' | 'in-progress' | 'completed' | 'reviewed' | 'cancelled';
  attachments?: Array<{
    filename: string;
    url: string;
    uploadedAt: string;
  }>;
  reviewedAt?: string;
  notificationSent?: boolean;
  notificationSentAt?: string;
  notificationMethod?: 'email' | 'sms' | 'both';
}

export default function LabResultDetailClient({ labResultId }: { labResultId: string }) {
  const [labResult, setLabResult] = useState<LabResult | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchLabResult();
  }, [labResultId]);

  const fetchLabResult = async () => {
    try {
      const res = await fetch(`/api/lab-results/${labResultId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setLabResult(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch lab result:', error);
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

  if (loading) {
    return (
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-3 text-sm text-gray-600">Loading lab result...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!labResult) {
    return (
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Lab result not found</h2>
            <Link href="/lab-results" className="text-sm text-blue-600 hover:text-blue-800 hover:underline">
              Back to Lab Results
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-3">
        {/* Header */}
        <div className="mb-2">
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={() => router.push('/lab-results')}
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              {labResult.requestCode || 'Lab Order'}
            </h1>
          </div>
          <p className="text-gray-600 text-xs ml-8">
            <Link href={`/patients/${labResult.patient._id}`} className="text-blue-600 hover:text-blue-800 hover:underline">
              {labResult.patient.firstName} {labResult.patient.lastName}
            </Link>
            {' • '}
            {new Date(labResult.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="space-y-2">
          {/* Status Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-900">Status</h2>
              <span className={`px-2 py-0.5 inline-flex text-xs font-semibold rounded-full ${getStatusColor(labResult.status)}`}>
                {labResult.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-500 mb-0.5">Order Date</p>
                <p className="font-medium text-gray-900">
                  {new Date(labResult.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              {labResult.resultDate && (
                <div>
                  <p className="text-gray-500 mb-0.5">Result Date</p>
                  <p className="font-medium text-gray-900">
                    {new Date(labResult.resultDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              )}
              {labResult.orderedBy && (
                <div>
                  <p className="text-gray-500 mb-0.5">Ordered By</p>
                  <p className="font-medium text-gray-900">{labResult.orderedBy.name}</p>
                </div>
              )}
              {labResult.reviewedBy && (
                <div>
                  <p className="text-gray-500 mb-0.5">Reviewed By</p>
                  <p className="font-medium text-gray-900">{labResult.reviewedBy.name}</p>
                </div>
              )}
            </div>
          </div>

          {/* Test Request Information */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h2 className="text-xs font-semibold text-gray-900 mb-3">Test Request</h2>
            <div className="space-y-2 text-xs">
              <div>
                <p className="text-gray-500 mb-0.5">Test Type</p>
                <p className="font-medium text-gray-900">{labResult.request.testType}</p>
              </div>
              {labResult.request.testCode && (
                <div>
                  <p className="text-gray-500 mb-0.5">Test Code</p>
                  <p className="font-medium text-gray-900">{labResult.request.testCode}</p>
                </div>
              )}
              {labResult.request.description && (
                <div>
                  <p className="text-gray-500 mb-0.5">Description</p>
                  <p className="font-medium text-gray-900">{labResult.request.description}</p>
                </div>
              )}
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-gray-500 mb-0.5">Urgency</p>
                  <p className="font-medium text-gray-900 capitalize">{labResult.request.urgency || 'routine'}</p>
                </div>
                {labResult.request.fastingRequired && (
                  <div>
                    <p className="text-gray-500 mb-0.5">Fasting Required</p>
                    <p className="font-medium text-gray-900">Yes</p>
                  </div>
                )}
              </div>
              {labResult.request.specialInstructions && (
                <div>
                  <p className="text-gray-500 mb-0.5">Special Instructions</p>
                  <p className="font-medium text-gray-900">{labResult.request.specialInstructions}</p>
                </div>
              )}
              {labResult.request.preparationNotes && (
                <div>
                  <p className="text-gray-500 mb-0.5">Preparation Notes</p>
                  <p className="font-medium text-gray-900">{labResult.request.preparationNotes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Results */}
          {labResult.results && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h2 className="text-xs font-semibold text-gray-900 mb-3">Results</h2>
              <div className="space-y-2 text-xs">
                {typeof labResult.results === 'object' && labResult.results !== null ? (
                  Object.entries(labResult.results).map(([key, value]) => {
                    const flag = labResult.abnormalFlags?.[key];
                    const referenceRange = labResult.referenceRanges?.[key];
                    return (
                      <div key={key} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                          {referenceRange && (
                            <p className="text-gray-500 text-xs">Ref: {referenceRange}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className={`font-medium ${flag === 'high' ? 'text-red-600' : flag === 'low' ? 'text-orange-600' : 'text-gray-900'}`}>
                            {String(value)}
                          </p>
                          {flag && (
                            <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                              flag === 'high' ? 'bg-red-100 text-red-800' :
                              flag === 'low' ? 'bg-orange-100 text-orange-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {flag.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-gray-900">{String(labResult.results)}</p>
                )}
              </div>
              {labResult.interpretation && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-gray-500 mb-0.5">Interpretation</p>
                  <p className="font-medium text-gray-900">{labResult.interpretation}</p>
                </div>
              )}
            </div>
          )}

          {/* Third Party Lab Information */}
          {labResult.thirdPartyLab && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h2 className="text-xs font-semibold text-gray-900 mb-3">Third Party Lab</h2>
              <div className="space-y-2 text-xs">
                <div>
                  <p className="text-gray-500 mb-0.5">Lab Name</p>
                  <p className="font-medium text-gray-900">{labResult.thirdPartyLab.labName}</p>
                </div>
                {labResult.thirdPartyLab.labCode && (
                  <div>
                    <p className="text-gray-500 mb-0.5">Lab Code</p>
                    <p className="font-medium text-gray-900">{labResult.thirdPartyLab.labCode}</p>
                  </div>
                )}
                {labResult.thirdPartyLab.status && (
                  <div>
                    <p className="text-gray-500 mb-0.5">Status</p>
                    <p className="font-medium text-gray-900 capitalize">{labResult.thirdPartyLab.status}</p>
                  </div>
                )}
                {labResult.thirdPartyLab.sentAt && (
                  <div>
                    <p className="text-gray-500 mb-0.5">Sent At</p>
                    <p className="font-medium text-gray-900">
                      {new Date(labResult.thirdPartyLab.sentAt).toLocaleString()}
                    </p>
                  </div>
                )}
                {labResult.thirdPartyLab.receivedAt && (
                  <div>
                    <p className="text-gray-500 mb-0.5">Received At</p>
                    <p className="font-medium text-gray-900">
                      {new Date(labResult.thirdPartyLab.receivedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Attachments */}
          {labResult.attachments && labResult.attachments.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h2 className="text-xs font-semibold text-gray-900 mb-3">Attachments</h2>
              <div className="space-y-2">
                {labResult.attachments.map((attachment, index) => (
                  <a
                    key={index}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    {attachment.filename || `Attachment ${index + 1}`}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Visit Link */}
          {labResult.visit && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h2 className="text-xs font-semibold text-gray-900 mb-2">Related Visit</h2>
              <Link
                href={`/visits/${labResult.visit._id}`}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                {labResult.visit.visitCode} - {new Date(labResult.visit.date).toLocaleDateString()}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

