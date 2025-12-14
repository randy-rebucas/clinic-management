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
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-cyan-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-cyan-100 border-t-cyan-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading lab result...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!labResult) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-cyan-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Lab result not found</h2>
            <p className="text-sm text-gray-600 mb-4">The lab result you're looking for doesn't exist or has been removed.</p>
            <Link 
              href="/lab-results"
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-lg hover:from-cyan-600 hover:to-cyan-700 transition-all text-sm font-semibold shadow-md"
            >
              Back to Lab Results
            </Link>
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
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/lab-results')}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">{labResult.requestCode || 'Lab Order'}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <Link href={`/patients/${labResult.patient._id}`}>
                      <p className="text-sm sm:text-base font-bold text-cyan-600 hover:text-cyan-700 hover:underline transition-colors">
                        {labResult.patient.firstName} {labResult.patient.lastName}
                      </p>
                    </Link>
                    <p className="text-sm text-gray-500">•</p>
                    <p className="text-sm sm:text-base text-gray-600">
                      {new Date(labResult.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {/* Status Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Status</h3>
                <span className={`ml-auto inline-block px-2.5 py-1 text-xs font-semibold rounded-full border ${
                  getStatusColor(labResult.status) === 'green' ? 'bg-green-100 text-green-700 border-green-200' :
                  getStatusColor(labResult.status) === 'blue' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                  getStatusColor(labResult.status) === 'yellow' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                  getStatusColor(labResult.status) === 'red' ? 'bg-red-100 text-red-700 border-red-200' :
                  'bg-gray-100 text-gray-700 border-gray-200'
                }`}>
                  {labResult.status}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Order Date</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(labResult.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {labResult.resultDate && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Result Date</p>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(labResult.resultDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                )}
                {labResult.orderedBy && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Ordered By</p>
                    <p className="text-sm font-medium text-gray-900">{labResult.orderedBy.name}</p>
                  </div>
                )}
                {labResult.reviewedBy && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Reviewed By</p>
                    <p className="text-sm font-medium text-gray-900">{labResult.reviewedBy.name}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Test Request Information */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Test Request</h3>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Test Type</p>
                  <p className="text-sm font-bold text-gray-900">{labResult.request.testType}</p>
                </div>
                {labResult.request.testCode && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Test Code</p>
                    <p className="text-sm font-medium text-gray-900">{labResult.request.testCode}</p>
                  </div>
                )}
                {labResult.request.description && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Description</p>
                    <p className="text-sm font-medium text-gray-900">{labResult.request.description}</p>
                  </div>
                )}
                <div className="flex gap-4 flex-wrap">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Urgency</p>
                    <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full border ${
                      getUrgencyColor(labResult.request.urgency) === 'red' ? 'bg-red-100 text-red-700 border-red-200' :
                      getUrgencyColor(labResult.request.urgency) === 'orange' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                      'bg-green-100 text-green-700 border-green-200'
                    }`}>
                      {labResult.request.urgency || 'routine'}
                    </span>
                  </div>
                  {labResult.request.fastingRequired && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Fasting Required</p>
                      <p className="text-sm font-medium text-gray-900">Yes</p>
                    </div>
                  )}
                </div>
                {labResult.request.specialInstructions && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Special Instructions</p>
                    <p className="text-sm text-gray-900">{labResult.request.specialInstructions}</p>
                  </div>
                )}
                {labResult.request.preparationNotes && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Preparation Notes</p>
                    <p className="text-sm text-gray-900">{labResult.request.preparationNotes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Results */}
            {labResult.results && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-emerald-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Results</h3>
                </div>
                <div className="flex flex-col gap-3">
                  {typeof labResult.results === 'object' && labResult.results !== null ? (
                    Object.entries(labResult.results).map(([key, value]) => {
                      const flag = labResult.abnormalFlags?.[key];
                      const referenceRange = labResult.referenceRanges?.[key];
                      return (
                        <div key={key} className="bg-gradient-to-r from-white to-emerald-50/50 border border-emerald-200 rounded-lg p-4 hover:shadow-md transition-all">
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex-1">
                              <p className="text-sm font-bold text-gray-900 capitalize mb-1">
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                              </p>
                              {referenceRange && (
                                <p className="text-xs text-gray-600 font-medium">Ref: {referenceRange}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-bold ${
                                flag === 'high' ? 'text-red-600' :
                                flag === 'low' ? 'text-orange-600' :
                                'text-gray-900'
                              }`}>
                                {String(value)}
                              </p>
                              {flag && (
                                <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full border ${
                                  flag === 'high' ? 'bg-red-100 text-red-700 border-red-200' :
                                  flag === 'low' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                  'bg-green-100 text-green-700 border-green-200'
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
                    <p className="text-sm text-gray-900 font-medium">{String(labResult.results)}</p>
                  )}
                </div>
                {labResult.interpretation && (
                  <div className="mt-4 pt-4 border-t border-gray-200 bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Interpretation</p>
                    <p className="text-sm text-gray-900 font-medium">{labResult.interpretation}</p>
                  </div>
                )}
              </div>
            )}

            {/* Third Party Lab Information */}
            {labResult.thirdPartyLab && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-indigo-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Third Party Lab</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Lab Name</p>
                    <p className="text-sm font-medium text-gray-900">{labResult.thirdPartyLab.labName}</p>
                  </div>
                  {labResult.thirdPartyLab.labCode && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Lab Code</p>
                      <p className="text-sm font-medium text-gray-900">{labResult.thirdPartyLab.labCode}</p>
                    </div>
                  )}
                  {labResult.thirdPartyLab.status && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Status</p>
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {labResult.thirdPartyLab.status}
                      </p>
                    </div>
                  )}
                  {labResult.thirdPartyLab.sentAt && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Sent At</p>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(labResult.thirdPartyLab.sentAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {labResult.thirdPartyLab.receivedAt && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Received At</p>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(labResult.thirdPartyLab.receivedAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Attachments */}
            {labResult.attachments && labResult.attachments.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-amber-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Attachments</h3>
                </div>
                <div className="flex flex-col gap-2">
                  {labResult.attachments.map((attachment, index) => (
                    <a
                      key={index}
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 text-sm font-medium text-gray-700 hover:bg-amber-50 rounded-lg transition-colors flex items-center gap-2 border border-gray-200 hover:border-amber-200"
                    >
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-teal-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Related Visit</h3>
                </div>
                <Link 
                  href={`/visits/${labResult.visit._id}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors text-sm font-semibold border border-teal-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {labResult.visit.visitCode} - {new Date(labResult.visit.date).toLocaleDateString()}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
