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
        return 'bg-green-100 text-green-800 border-green-200';
      case 'accepted':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'declined':
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getUrgencyColor = (urgency: string): string => {
    switch (urgency) {
      case 'stat':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'urgent':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'routine':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
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
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-orange-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-orange-100 border-t-orange-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading referral...</p>
          </div>
        </div>
      </section>
    );
  }

  if (error || !referral) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-orange-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Referral not found</h2>
            <p className="text-sm text-gray-600 mb-4">{error || 'The referral you are looking for does not exist.'}</p>
            <Link 
              href="/referrals"
              className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all text-sm font-semibold shadow-md"
            >
              Back to Referrals
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-orange-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-center gap-4 mb-6">
              <Link 
                href="/referrals"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
                    Referral {referral.referralCode}
                  </h1>
                  <div className="flex items-center gap-2 flex-wrap">
                    {referral.patient && (
                      <>
                        <Link
                          href={`/patients/${referral.patient._id}`}
                          className="text-sm font-semibold text-orange-600 hover:text-orange-700 hover:underline"
                        >
                          {referral.patient.firstName} {referral.patient.lastName}
                        </Link>
                        <p className="text-sm text-gray-400">•</p>
                      </>
                    )}
                    <p className="text-sm font-medium text-gray-600 capitalize">{referral.type.replace(/_/g, ' ')}</p>
                    <p className="text-sm text-gray-400">•</p>
                    <p className="text-sm font-medium text-gray-600">{formatShortDate(referral.referredDate)}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${getStatusColor(referral.status)}`}>
                  {referral.status.charAt(0).toUpperCase() + referral.status.slice(1)}
                </span>
                <span className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${getUrgencyColor(referral.urgency)}`}>
                  {referral.urgency.charAt(0).toUpperCase() + referral.urgency.slice(1)}
                </span>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-purple-500 rounded-lg">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Status</p>
                </div>
                <p className="text-lg font-bold text-gray-900 capitalize">{referral.status}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-red-500 rounded-lg">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Urgency</p>
                </div>
                <p className="text-lg font-bold text-gray-900 capitalize">{referral.urgency}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-orange-500 rounded-lg">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Type</p>
                </div>
                <p className="text-lg font-bold text-gray-900 capitalize">{referral.type.replace(/_/g, ' ')}</p>
              </div>
              {referral.visit && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-teal-500 rounded-lg">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Visit</p>
                  </div>
                  <Link
                    href={`/visits/${referral.visit._id}`}
                    className="text-lg font-bold text-teal-600 hover:text-teal-700 hover:underline"
                  >
                    {referral.visit.visitCode}
                  </Link>
                </div>
              )}
              {referral.appointment && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-blue-500 rounded-lg">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Appointment</p>
                  </div>
                  <Link
                    href={`/appointments/${referral.appointment._id}`}
                    className="text-lg font-bold text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    {referral.appointment.appointmentCode}
                  </Link>
                </div>
              )}
              {referral.attachments && referral.attachments.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-amber-500 rounded-lg">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Attachments</p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{referral.attachments.length}</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Patient Information */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Patient Information</h2>
                </div>
              </div>
              <div className="p-6">
                {referral.patient ? (
                  <div>
                    <Link
                      href={`/patients/${referral.patient._id}`}
                      className="text-lg font-bold text-orange-600 hover:text-orange-700 hover:underline"
                    >
                      {referral.patient.firstName} {referral.patient.lastName}
                    </Link>
                    {referral.patient.patientCode && (
                      <p className="text-sm font-medium text-gray-600 mt-2">Code: {referral.patient.patientCode}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 font-medium">Patient not found</p>
                )}
              </div>
            </div>

            {/* Referral Details */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Referral Details</h2>
                </div>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</label>
                  <p className="mt-1.5 text-sm font-bold text-gray-900 capitalize">{referral.type.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason for Referral</label>
                  <p className="mt-1.5 text-sm font-medium text-gray-900">{referral.reason}</p>
                </div>
                {referral.specialty && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Required Specialty</label>
                    <p className="mt-1.5 text-sm font-medium text-gray-900">{referral.specialty}</p>
                  </div>
                )}
                {referral.chiefComplaint && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Chief Complaint</label>
                    <p className="mt-1.5 text-sm font-medium text-gray-900">{referral.chiefComplaint}</p>
                  </div>
                )}
                {referral.diagnosis && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Diagnosis</label>
                    <p className="mt-1.5 text-sm font-medium text-gray-900">{referral.diagnosis}</p>
                  </div>
                )}
                {referral.relevantHistory && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Relevant History</label>
                    <p className="mt-1.5 text-sm font-medium text-gray-900 whitespace-pre-wrap">{referral.relevantHistory}</p>
                  </div>
                )}
                {referral.medications && referral.medications.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Current Medications</label>
                    <div className="flex gap-2 flex-wrap mt-2">
                      {referral.medications.map((med, idx) => (
                        <span key={idx} className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-semibold border border-purple-200">
                          {med}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {referral.notes && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Additional Notes</label>
                    <p className="mt-1.5 text-sm font-medium text-gray-900 whitespace-pre-wrap">{referral.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Attachments */}
            {referral.attachments && referral.attachments.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
                <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">Attachments</h2>
                  </div>
                </div>
                <div className="p-6">
                  <div className="space-y-3">
                    {referral.attachments.map((attachment, idx) => (
                      <a
                        key={idx}
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-amber-50 hover:border-amber-200 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-100 rounded-lg">
                            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <span className="text-sm font-semibold text-gray-900">{attachment.filename}</span>
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
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Referring Party</h2>
                </div>
              </div>
              <div className="p-6 space-y-3">
                {referral.referringDoctor ? (
                  <div>
                    <p className="font-bold text-gray-900">
                      Dr. {referral.referringDoctor.firstName} {referral.referringDoctor.lastName}
                    </p>
                    {referral.referringDoctor.specialization && (
                      <p className="text-sm font-medium text-gray-600 mt-1">{referral.referringDoctor.specialization}</p>
                    )}
                  </div>
                ) : referral.referringClinic ? (
                  <div>
                    <p className="font-bold text-gray-900">{referral.referringClinic}</p>
                    {referral.referringContact && (
                      <div className="mt-3 space-y-2 text-sm">
                        {referral.referringContact.name && <p className="font-semibold text-gray-900">{referral.referringContact.name}</p>}
                        {referral.referringContact.phone && <p className="font-medium text-gray-600">Phone: {referral.referringContact.phone}</p>}
                        {referral.referringContact.email && <p className="font-medium text-gray-600">Email: {referral.referringContact.email}</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 font-medium">Not specified</p>
                )}
              </div>
            </div>

            {/* Receiving Party */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Receiving Party</h2>
                </div>
              </div>
              <div className="p-6 space-y-3">
                {referral.receivingDoctor ? (
                  <div>
                    <p className="font-bold text-gray-900">
                      Dr. {referral.receivingDoctor.firstName} {referral.receivingDoctor.lastName}
                    </p>
                    {referral.receivingDoctor.specialization && (
                      <p className="text-sm font-medium text-gray-600 mt-1">{referral.receivingDoctor.specialization}</p>
                    )}
                  </div>
                ) : referral.receivingClinic ? (
                  <div>
                    <p className="font-bold text-gray-900">{referral.receivingClinic}</p>
                  </div>
                ) : (
                  <p className="text-gray-500 font-medium">Not specified</p>
                )}
              </div>
            </div>

            {/* Status Timeline */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Timeline</h2>
                </div>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Referred Date</label>
                  <p className="mt-1.5 text-sm font-bold text-gray-900">{formatDate(referral.referredDate)}</p>
                </div>
                {referral.acceptedDate && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Accepted Date</label>
                    <p className="mt-1.5 text-sm font-bold text-gray-900">{formatDate(referral.acceptedDate)}</p>
                  </div>
                )}
                {referral.completedDate && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Completed Date</label>
                    <p className="mt-1.5 text-sm font-bold text-gray-900">{formatDate(referral.completedDate)}</p>
                  </div>
                )}
                {referral.declinedDate && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Declined Date</label>
                    <p className="mt-1.5 text-sm font-bold text-gray-900">{formatDate(referral.declinedDate)}</p>
                    {referral.declinedReason && (
                      <p className="mt-2 text-sm font-semibold text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">{referral.declinedReason}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Related Records */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Related Records</h2>
                </div>
              </div>
              <div className="p-6 space-y-3">
                {referral.visit ? (
                  <Link
                    href={`/visits/${referral.visit._id}`}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-teal-50 hover:border-teal-200 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-gray-900">Visit</p>
                      <p className="text-sm font-medium text-gray-600 mt-1">{referral.visit.visitCode}</p>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-500">No visit created</p>
                )}
                {referral.appointment ? (
                  <Link
                    href={`/appointments/${referral.appointment._id}`}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-gray-900">Appointment</p>
                      <p className="text-sm font-medium text-gray-600 mt-1">{referral.appointment.appointmentCode}</p>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-500">No appointment created</p>
                )}
              </div>
            </div>

            {/* Follow-up */}
            {referral.followUpRequired && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
                <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-teal-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">Follow-up</h2>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  {referral.followUpDate && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Follow-up Date</label>
                      <p className="mt-1.5 text-sm font-bold text-gray-900">{formatDate(referral.followUpDate)}</p>
                    </div>
                  )}
                  {referral.followUpNotes && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Follow-up Notes</label>
                      <p className="mt-1.5 text-sm font-medium text-gray-900 whitespace-pre-wrap">{referral.followUpNotes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Feedback */}
            {referral.feedback && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
                <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">Feedback</h2>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  {referral.feedback.rating && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Rating</label>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <svg
                            key={i}
                            className={`w-6 h-6 ${i < referral.feedback!.rating! ? 'text-yellow-400' : 'text-gray-300'}`}
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
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Comments</label>
                      <p className="mt-1.5 text-sm font-medium text-gray-900 whitespace-pre-wrap">{referral.feedback.comments}</p>
                    </div>
                  )}
                  <p className="text-xs font-semibold text-gray-500">Submitted: {formatDate(referral.feedback.submittedAt)}</p>
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

