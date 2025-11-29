'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Referral {
  _id: string;
  referralCode: string;
  type: 'doctor_to_doctor' | 'patient_to_patient' | 'external';
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
  } | null;
  referringDoctor?: {
    _id: string;
    firstName: string;
    lastName: string;
    specialization?: string;
  } | null;
  receivingDoctor?: {
    _id: string;
    firstName: string;
    lastName: string;
    specialization?: string;
  } | null;
  referringClinic?: string;
  referringContact?: {
    name: string;
    phone?: string;
    email?: string;
  };
  receivingClinic?: string;
  reason: string;
  urgency: 'routine' | 'urgent' | 'stat';
  specialty?: string;
  notes?: string;
  chiefComplaint?: string;
  diagnosis?: string;
  relevantHistory?: string;
  medications?: string[];
  attachments?: Array<{
    filename: string;
    url: string;
    uploadDate: string;
  }>;
  status: 'pending' | 'accepted' | 'completed' | 'declined' | 'cancelled';
  referredDate: string;
  acceptedDate?: string;
  completedDate?: string;
  declinedDate?: string;
  declinedReason?: string;
  visit?: {
    _id: string;
    visitCode: string;
    date: string;
  } | null;
  appointment?: {
    _id: string;
    appointmentCode: string;
    appointmentDate: string;
  } | null;
  followUpRequired: boolean;
  followUpDate?: string;
  followUpNotes?: string;
  feedback?: {
    rating?: number;
    comments?: string;
    submittedBy: string;
    submittedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export default function ReferralDetailClient({ referralId }: { referralId: string }) {
  const [referral, setReferral] = useState<Referral | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchReferral();
  }, [referralId]);

  const fetchReferral = async () => {
    try {
      const res = await fetch(`/api/referrals/${referralId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setReferral(data.data);
      } else {
        setError(data.error || 'Failed to fetch referral');
      }
    } catch (error) {
      console.error('Failed to fetch referral:', error);
      setError('Failed to fetch referral');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'accepted':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'declined':
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyColor = (urgency: string): string => {
    switch (urgency) {
      case 'stat':
        return 'bg-red-100 text-red-800';
      case 'urgent':
        return 'bg-orange-100 text-orange-800';
      case 'routine':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatShortDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-4">
            <div className="h-10 w-[300px] bg-gray-200 rounded animate-pulse"></div>
            <div className="flex gap-4 flex-wrap">
              <div className="h-[200px] bg-gray-200 rounded animate-pulse flex-1" style={{ flex: '1 1 300px' }}></div>
              <div className="h-[200px] bg-gray-200 rounded animate-pulse flex-1" style={{ flex: '1 1 300px' }}></div>
            </div>
            <div className="h-[400px] bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
      </section>
    );
  }

  if (error || !referral) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-4" style={{ minHeight: '50vh' }}>
            <h2 className="text-2xl font-semibold">Referral not found</h2>
            <p className="text-gray-600">{error || 'The referral you are looking for does not exist.'}</p>
            <Link 
              href="/referrals"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Referrals
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
            <div className="flex items-center gap-3 mb-3">
              <Link 
                href="/referrals"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-1">
                  Referral {referral.referralCode}
                </h1>
                <div className="flex items-center gap-2 flex-wrap">
                  {referral.patient && (
                    <>
                      <Link
                        href={`/patients/${referral.patient._id}`}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {referral.patient.firstName} {referral.patient.lastName}
                      </Link>
                      <p className="text-sm text-gray-500">•</p>
                    </>
                  )}
                  <p className="text-sm text-gray-500 capitalize">{referral.type.replace(/_/g, ' ')}</p>
                  <p className="text-sm text-gray-500">•</p>
                  <p className="text-sm text-gray-500">{formatShortDate(referral.referredDate)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${getStatusColor(referral.status)}`}>
                  {referral.status.charAt(0).toUpperCase() + referral.status.slice(1)}
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${getUrgencyColor(referral.urgency)}`}>
                  {referral.urgency.charAt(0).toUpperCase() + referral.urgency.slice(1)}
                </span>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex gap-2 flex-wrap mb-3">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                <div className="p-2">
                  <p className="text-xs text-gray-500 mb-1">Status</p>
                  <p className="text-lg font-bold capitalize">{referral.status}</p>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                <div className="p-2">
                  <p className="text-xs text-gray-500 mb-1">Urgency</p>
                  <p className="text-lg font-bold capitalize">{referral.urgency}</p>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                <div className="p-2">
                  <p className="text-xs text-gray-500 mb-1">Type</p>
                  <p className="text-lg font-bold capitalize">{referral.type.replace(/_/g, ' ')}</p>
                </div>
              </div>
              {referral.visit && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                  <div className="p-2">
                    <p className="text-xs text-gray-500 mb-1">Visit</p>
                    <Link
                      href={`/visits/${referral.visit._id}`}
                      className="text-lg font-bold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {referral.visit.visitCode}
                    </Link>
                  </div>
                </div>
              )}
              {referral.appointment && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                  <div className="p-2">
                    <p className="text-xs text-gray-500 mb-1">Appointment</p>
                    <Link
                      href={`/appointments/${referral.appointment._id}`}
                      className="text-lg font-bold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {referral.appointment.appointmentCode}
                    </Link>
                  </div>
                </div>
              )}
              {referral.attachments && referral.attachments.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                  <div className="p-2">
                    <p className="text-xs text-gray-500 mb-1">Attachments</p>
                    <p className="text-lg font-bold">{referral.attachments.length}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Patient Information */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Patient Information</h2>
              </div>
              <div className="p-6">
                {referral.patient ? (
                  <div>
                    <Link
                      href={`/patients/${referral.patient._id}`}
                      className="text-lg font-medium text-blue-600 hover:text-blue-800"
                    >
                      {referral.patient.firstName} {referral.patient.lastName}
                    </Link>
                    {referral.patient.patientCode && (
                      <p className="text-sm text-gray-500 mt-1">Code: {referral.patient.patientCode}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500">Patient not found</p>
                )}
              </div>
            </div>

            {/* Referral Details */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Referral Details</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Type</label>
                  <p className="mt-1 text-gray-900 capitalize">{referral.type.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Reason for Referral</label>
                  <p className="mt-1 text-gray-900">{referral.reason}</p>
                </div>
                {referral.specialty && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Required Specialty</label>
                    <p className="mt-1 text-gray-900">{referral.specialty}</p>
                  </div>
                )}
                {referral.chiefComplaint && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Chief Complaint</label>
                    <p className="mt-1 text-gray-900">{referral.chiefComplaint}</p>
                  </div>
                )}
                {referral.diagnosis && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Diagnosis</label>
                    <p className="mt-1 text-gray-900">{referral.diagnosis}</p>
                  </div>
                )}
                {referral.relevantHistory && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Relevant History</label>
                    <p className="mt-1 text-gray-900 whitespace-pre-wrap">{referral.relevantHistory}</p>
                  </div>
                )}
                {referral.medications && referral.medications.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Current Medications</label>
                    <ul className="mt-1 list-disc list-inside text-gray-900">
                      {referral.medications.map((med, idx) => (
                        <li key={idx}>{med}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {referral.notes && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Additional Notes</label>
                    <p className="mt-1 text-gray-900 whitespace-pre-wrap">{referral.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Attachments */}
            {referral.attachments && referral.attachments.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Attachments</h2>
                </div>
                <div className="p-6">
                  <div className="space-y-2">
                    {referral.attachments.map((attachment, idx) => (
                      <a
                        key={idx}
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex items-center">
                          <svg className="w-5 h-5 text-gray-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-sm text-gray-900">{attachment.filename}</span>
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Referring Party */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Referring Party</h2>
              </div>
              <div className="p-6 space-y-3">
                {referral.referringDoctor ? (
                  <div>
                    <p className="font-medium text-gray-900">
                      Dr. {referral.referringDoctor.firstName} {referral.referringDoctor.lastName}
                    </p>
                    {referral.referringDoctor.specialization && (
                      <p className="text-sm text-gray-500">{referral.referringDoctor.specialization}</p>
                    )}
                  </div>
                ) : referral.referringClinic ? (
                  <div>
                    <p className="font-medium text-gray-900">{referral.referringClinic}</p>
                    {referral.referringContact && (
                      <div className="mt-2 text-sm text-gray-600">
                        {referral.referringContact.name && <p>{referral.referringContact.name}</p>}
                        {referral.referringContact.phone && <p>Phone: {referral.referringContact.phone}</p>}
                        {referral.referringContact.email && <p>Email: {referral.referringContact.email}</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500">Not specified</p>
                )}
              </div>
            </div>

            {/* Receiving Party */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Receiving Party</h2>
              </div>
              <div className="p-6 space-y-3">
                {referral.receivingDoctor ? (
                  <div>
                    <p className="font-medium text-gray-900">
                      Dr. {referral.receivingDoctor.firstName} {referral.receivingDoctor.lastName}
                    </p>
                    {referral.receivingDoctor.specialization && (
                      <p className="text-sm text-gray-500">{referral.receivingDoctor.specialization}</p>
                    )}
                  </div>
                ) : referral.receivingClinic ? (
                  <div>
                    <p className="font-medium text-gray-900">{referral.receivingClinic}</p>
                  </div>
                ) : (
                  <p className="text-gray-500">Not specified</p>
                )}
              </div>
            </div>

            {/* Status Timeline */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Timeline</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Referred Date</label>
                  <p className="mt-1 text-gray-900">{formatDate(referral.referredDate)}</p>
                </div>
                {referral.acceptedDate && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Accepted Date</label>
                    <p className="mt-1 text-gray-900">{formatDate(referral.acceptedDate)}</p>
                  </div>
                )}
                {referral.completedDate && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Completed Date</label>
                    <p className="mt-1 text-gray-900">{formatDate(referral.completedDate)}</p>
                  </div>
                )}
                {referral.declinedDate && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Declined Date</label>
                    <p className="mt-1 text-gray-900">{formatDate(referral.declinedDate)}</p>
                    {referral.declinedReason && (
                      <p className="mt-1 text-sm text-red-600">{referral.declinedReason}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Related Records */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Related Records</h2>
              </div>
              <div className="p-6 space-y-3">
                {referral.visit ? (
                  <Link
                    href={`/visits/${referral.visit._id}`}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium text-gray-900">Visit</p>
                      <p className="text-sm text-gray-500">{referral.visit.visitCode}</p>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ) : (
                  <p className="text-sm text-gray-500">No visit created</p>
                )}
                {referral.appointment ? (
                  <Link
                    href={`/appointments/${referral.appointment._id}`}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium text-gray-900">Appointment</p>
                      <p className="text-sm text-gray-500">{referral.appointment.appointmentCode}</p>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ) : (
                  <p className="text-sm text-gray-500">No appointment created</p>
                )}
              </div>
            </div>

            {/* Follow-up */}
            {referral.followUpRequired && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Follow-up</h2>
                </div>
                <div className="p-6 space-y-3">
                  {referral.followUpDate && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Follow-up Date</label>
                      <p className="mt-1 text-gray-900">{formatDate(referral.followUpDate)}</p>
                    </div>
                  )}
                  {referral.followUpNotes && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Follow-up Notes</label>
                      <p className="mt-1 text-gray-900 whitespace-pre-wrap">{referral.followUpNotes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Feedback */}
            {referral.feedback && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Feedback</h2>
                </div>
                <div className="p-6 space-y-3">
                  {referral.feedback.rating && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Rating</label>
                      <div className="mt-1 flex items-center">
                        {[...Array(5)].map((_, i) => (
                          <svg
                            key={i}
                            className={`w-5 h-5 ${i < referral.feedback!.rating! ? 'text-yellow-400' : 'text-gray-300'}`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                    </div>
                  )}
                  {referral.feedback.comments && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Comments</label>
                      <p className="mt-1 text-gray-900 whitespace-pre-wrap">{referral.feedback.comments}</p>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">Submitted: {formatDate(referral.feedback.submittedAt)}</p>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </section>
  );
}

