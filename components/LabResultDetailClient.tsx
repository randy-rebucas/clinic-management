'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Modal } from './ui/Modal';

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

  const getUrgencyColor = (urgency?: string): 'green' | 'orange' | 'red' => {
    switch (urgency) {
      case 'stat':
        return 'red';
      case 'urgent':
        return 'orange';
      default:
        return 'green';
    }
  };

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: '256px' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p>Loading lab result...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!labResult) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: '256px' }}>
            <h2 className="text-xl font-semibold">Lab result not found</h2>
            <Link 
              href="/lab-results"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Back to Lab Results
            </Link>
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
          <div>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => router.push('/lab-results')}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-3xl font-bold">{labResult.requestCode || 'Lab Order'}</h1>
            </div>
            <div className="flex items-center gap-2 ml-9">
              <Link href={`/patients/${labResult.patient._id}`}>
                <p className="text-sm text-blue-700 hover:underline">
                  {labResult.patient.firstName} {labResult.patient.lastName}
                </p>
              </Link>
              <p className="text-sm text-gray-600">•</p>
              <p className="text-sm text-gray-600">
                {new Date(labResult.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {/* Status Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-3">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">Status</h3>
                  <span className={`inline-block px-2 py-1 text-sm font-medium rounded ${
                    getStatusColor(labResult.status) === 'green' ? 'bg-green-100 text-green-800' :
                    getStatusColor(labResult.status) === 'blue' ? 'bg-blue-100 text-blue-800' :
                    getStatusColor(labResult.status) === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                    getStatusColor(labResult.status) === 'red' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {labResult.status}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Order Date</p>
                    <p className="text-sm font-medium">
                      {new Date(labResult.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  {labResult.resultDate && (
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Result Date</p>
                      <p className="text-sm font-medium">
                        {new Date(labResult.resultDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                  {labResult.orderedBy && (
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Ordered By</p>
                      <p className="text-sm font-medium">{labResult.orderedBy.name}</p>
                    </div>
                  )}
                  {labResult.reviewedBy && (
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Reviewed By</p>
                      <p className="text-sm font-medium">{labResult.reviewedBy.name}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Test Request Information */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-3">
                <h3 className="text-lg font-semibold mb-3">Test Request</h3>
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Test Type</p>
                    <p className="text-sm font-medium">{labResult.request.testType}</p>
                  </div>
                  {labResult.request.testCode && (
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Test Code</p>
                      <p className="text-sm font-medium">{labResult.request.testCode}</p>
                    </div>
                  )}
                  {labResult.request.description && (
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Description</p>
                      <p className="text-sm font-medium">{labResult.request.description}</p>
                    </div>
                  )}
                  <div className="flex gap-4 flex-wrap">
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Urgency</p>
                      <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                        getUrgencyColor(labResult.request.urgency) === 'red' ? 'bg-red-100 text-red-800' :
                        getUrgencyColor(labResult.request.urgency) === 'orange' ? 'bg-orange-100 text-orange-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {labResult.request.urgency || 'routine'}
                      </span>
                    </div>
                    {labResult.request.fastingRequired && (
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Fasting Required</p>
                        <p className="text-sm font-medium">Yes</p>
                      </div>
                    )}
                  </div>
                  {labResult.request.specialInstructions && (
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Special Instructions</p>
                      <p className="text-sm font-medium">{labResult.request.specialInstructions}</p>
                    </div>
                  )}
                  {labResult.request.preparationNotes && (
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Preparation Notes</p>
                      <p className="text-sm font-medium">{labResult.request.preparationNotes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Results */}
            {labResult.results && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-3">
                  <h3 className="text-lg font-semibold mb-3">Results</h3>
                  <div className="flex flex-col gap-2">
                    {typeof labResult.results === 'object' && labResult.results !== null ? (
                      Object.entries(labResult.results).map(([key, value]) => {
                        const flag = labResult.abnormalFlags?.[key];
                        const referenceRange = labResult.referenceRanges?.[key];
                        return (
                          <div key={key} className="pb-2 border-b border-gray-200">
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex-1">
                                <p className="text-sm font-medium capitalize">
                                  {key.replace(/([A-Z])/g, ' $1').trim()}
                                </p>
                                {referenceRange && (
                                  <p className="text-xs text-gray-600">Ref: {referenceRange}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <p className={`text-sm font-medium ${
                                  flag === 'high' ? 'text-red-600' :
                                  flag === 'low' ? 'text-orange-600' :
                                  ''
                                }`}>
                                  {String(value)}
                                </p>
                                {flag && (
                                  <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                                    flag === 'high' ? 'bg-red-100 text-red-800' :
                                    flag === 'low' ? 'bg-orange-100 text-orange-800' :
                                    'bg-green-100 text-green-800'
                                  }`}>
                                    {flag.toUpperCase()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm">{String(labResult.results)}</p>
                    )}
                  </div>
                  {labResult.interpretation && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600 mb-1">Interpretation</p>
                      <p className="text-sm font-medium">{labResult.interpretation}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Third Party Lab Information */}
            {labResult.thirdPartyLab && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-3">
                  <h3 className="text-lg font-semibold mb-3">Third Party Lab</h3>
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Lab Name</p>
                      <p className="text-sm font-medium">{labResult.thirdPartyLab.labName}</p>
                    </div>
                    {labResult.thirdPartyLab.labCode && (
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Lab Code</p>
                        <p className="text-sm font-medium">{labResult.thirdPartyLab.labCode}</p>
                      </div>
                    )}
                    {labResult.thirdPartyLab.status && (
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Status</p>
                        <p className="text-sm font-medium capitalize">
                          {labResult.thirdPartyLab.status}
                        </p>
                      </div>
                    )}
                    {labResult.thirdPartyLab.sentAt && (
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Sent At</p>
                        <p className="text-sm font-medium">
                          {new Date(labResult.thirdPartyLab.sentAt).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {labResult.thirdPartyLab.receivedAt && (
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Received At</p>
                        <p className="text-sm font-medium">
                          {new Date(labResult.thirdPartyLab.receivedAt).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Attachments */}
            {labResult.attachments && labResult.attachments.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-3">
                  <h3 className="text-lg font-semibold mb-3">Attachments</h3>
                  <div className="flex flex-col gap-2">
                    {labResult.attachments.map((attachment, index) => (
                      <a
                        key={index}
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center"
                      >
                        <svg style={{ width: '16px', height: '16px', marginRight: '8px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        {attachment.filename || `Attachment ${index + 1}`}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Visit Link */}
            {labResult.visit && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-3">
                  <h3 className="text-lg font-semibold mb-2">Related Visit</h3>
                  <Link 
                    href={`/visits/${labResult.visit._id}`}
                    className="inline-block px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    {labResult.visit.visitCode} - {new Date(labResult.visit.date).toLocaleDateString()}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
