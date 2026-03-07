'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import VisitForm from './VisitForm';

export interface Visit {
  _id: string;
  visitCode: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
    email: string;
    phone: string;
  } | null;
  provider?: {
    _id: string;
    name: string;
    email: string;
  };
  date: string;
  visitType: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  vitals?: {
    bp?: string;
    hr?: number;
    rr?: number;
    tempC?: number;
    spo2?: number;
    heightCm?: number;
    weightKg?: number;
    bmi?: number;
  };
  physicalExam?: {
    general?: string;
    heent?: string;
    chest?: string;
    cardiovascular?: string;
    abdomen?: string;
    neuro?: string;
    skin?: string;
    other?: string;
  };
  diagnoses: Array<{
    code?: string;
    description?: string;
    primary?: boolean;
  }>;
  soapNotes?: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
  treatmentPlan?: {
    medications?: Array<{
      name: string;
      dosage: string;
      frequency: string;
      duration: string;
      instructions?: string;
    }>;
    procedures?: Array<{
      name: string;
      description?: string;
      scheduledDate?: string;
    }>;
    lifestyle?: Array<{
      category: string;
      instructions: string;
    }>;
    followUp?: {
      date?: string;
      instructions?: string;
      reminderSent?: boolean;
    };
  };
  digitalSignature?: {
    providerName: string;
    signatureData: string;
    signedAt: string;
  };
  followUpDate?: string;
  followUpReminderSent?: boolean;
  notes?: string;
  status: string;
  attachments?: Array<{
    _id?: string;
    filename: string;
    contentType?: string;
    size?: number;
    url?: string;
    uploadDate: string;
    notes?: string;
  }>;
}

export default function VisitDetailClient({ visitId }: { visitId: string }) {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [providerName, setProviderName] = useState('Dr. Provider');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const router = useRouter();

  useEffect(() => {
    fetchVisit();
    fetchUser();
  }, [visitId]);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/user/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setProviderName(data.data.name || 'Dr. Provider');
        }
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  };

  const fetchVisit = async () => {
    try {
      const res = await fetch(`/api/visits/${visitId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setVisit(data.data);
      } else {
        // Visit not found or error
        console.error('Failed to fetch visit:', data.error);
        setVisit(null);
      }
    } catch (error) {
      console.error('Failed to fetch visit:', error);
      setVisit(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (formData: any) => {
    try {
      const res = await fetch(`/api/visits/${visitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          date: visit?.date ? new Date(visit.date) : new Date(),
          followUpDate: formData.followUpDate ? new Date(formData.followUpDate) : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVisit(data.data);
          setEditing(false);
          alert('Visit updated successfully!');
        }
      }
    } catch (error) {
      console.error('Failed to update visit:', error);
      alert('Failed to update visit');
    }
  };

  const handleStatusChange = async (status: string) => {
    try {
      const res = await fetch(`/api/visits/${visitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVisit(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleFileUpload = async (file: File, notes?: string) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (notes) {
        formData.append('notes', notes);
      }

      const res = await fetch(`/api/visits/${visitId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVisit(data.data);
          alert('File uploaded successfully!');
        } else {
          alert('Failed to upload file: ' + (data.error || 'Unknown error'));
        }
      } else {
        alert('Failed to upload file');
      }
    } catch (error) {
      console.error('Failed to upload file:', error);
      alert('Failed to upload file');
    }
  };

  const handlePrint = (type: 'medical-certificate' | 'lab-request') => {
    window.open(`/api/visits/${visitId}/print/${type}`, '_blank');
  };

  if (loading) {
    return (
      <section className="py-6 px-4 sm:px-6 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-3 min-h-[50vh] justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-teal-600"></div>
            <p className="text-sm text-gray-500">Loading visit...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!visit) {
    return (
      <section className="py-6 px-4 sm:px-6 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-3 min-h-[50vh] justify-center">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-red-100 rounded-full">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-gray-900">Visit not found</h2>
            <p className="text-sm text-gray-500">The visit you&apos;re looking for doesn&apos;t exist or has been removed.</p>
            <Link
              href="/visits"
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-semibold"
            >
              Back to Visits
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 px-4 sm:px-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-3">
                <Link
                  href="/visits"
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
                <div className="p-1.5 bg-teal-600 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-base font-semibold text-gray-900">Visit {visit.visitCode}</h1>
                  <p className="text-xs text-gray-500">
                    {visit.patient
                      ? `${visit.patient.firstName} ${visit.patient.lastName} • ${new Date(visit.date).toLocaleDateString()}`
                      : `No patient assigned • ${new Date(visit.date).toLocaleDateString()}`
                    }
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <select
                  value={visit.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-xs bg-white font-semibold text-gray-700"
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                {!editing && (
                  <>
                    <button
                      onClick={() => handlePrint('medical-certificate')}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-green-50 hover:text-green-700 transition-colors text-xs font-semibold flex items-center gap-1.5"
                      title="Print Medical Certificate"
                    >
                      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Med. Certificate
                    </button>
                    <button
                      onClick={() => handlePrint('lab-request')}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-purple-50 hover:text-purple-700 transition-colors text-xs font-semibold flex items-center gap-1.5"
                      title="Print Lab Request"
                    >
                      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Lab Request
                    </button>
                    <button
                      onClick={() => setEditing(true)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-teal-50 hover:text-teal-700 transition-colors text-xs font-semibold flex items-center gap-1.5"
                    >
                      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Edit Mode */}
          {editing ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-5">
                <VisitForm
                  initialData={{
                    patient: visit.patient?._id || '',
                    visitType: visit.visitType as any,
                    chiefComplaint: visit.chiefComplaint,
                    historyOfPresentIllness: visit.historyOfPresentIllness,
                    vitals: visit.vitals,
                    physicalExam: visit.physicalExam,
                    diagnoses: visit.diagnoses,
                    soapNotes: visit.soapNotes,
                    treatmentPlan: visit.treatmentPlan,
                    followUpDate: visit.followUpDate,
                    notes: visit.notes,
                    digitalSignature: visit.digitalSignature ? {
                      providerName: visit.digitalSignature.providerName,
                      signatureData: visit.digitalSignature.signatureData,
                    } : undefined,
                  }}
                  patients={visit.patient ? [{ _id: visit.patient._id, firstName: visit.patient.firstName, lastName: visit.patient.lastName }] : []}
                  onSubmit={handleUpdate}
                  onCancel={() => setEditing(false)}
                  providerName={providerName}
                />
              </div>
            </div>
          ) : (
            /* View Mode */
            <div className="flex flex-col gap-4">
              {/* Patient Info */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-blue-600 rounded-lg">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">Patient Information</h3>
                </div>
                {visit.patient ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Name</p>
                      <Link href={`/patients/${visit.patient._id}`} className="text-sm font-bold text-blue-600 hover:text-blue-700 hover:underline transition-colors">
                        {visit.patient.firstName} {visit.patient.lastName}
                      </Link>
                    </div>
                    {visit.patient.patientCode && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Patient ID</p>
                        <p className="text-sm font-medium text-gray-900">{visit.patient.patientCode}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Email</p>
                      <p className="text-sm font-medium text-gray-900">{visit.patient.email}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Phone</p>
                      <p className="text-sm font-medium text-gray-900">{visit.patient.phone}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">No patient assigned to this visit</p>
                )}
              </div>

              {/* SOAP Notes */}
              {visit.soapNotes && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-teal-600 rounded-lg">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">SOAP Notes</h3>
                  </div>
                  <div className="flex flex-col gap-4">
                    {visit.soapNotes.subjective && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm font-bold text-blue-900 mb-2">S - Subjective</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{visit.soapNotes.subjective}</p>
                      </div>
                    )}
                    {visit.soapNotes.objective && (
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                        <p className="text-sm font-bold text-purple-900 mb-2">O - Objective</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{visit.soapNotes.objective}</p>
                      </div>
                    )}
                    {visit.soapNotes.assessment && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <p className="text-sm font-bold text-amber-900 mb-2">A - Assessment</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{visit.soapNotes.assessment}</p>
                      </div>
                    )}
                    {visit.soapNotes.plan && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                        <p className="text-sm font-bold text-emerald-900 mb-2">P - Plan</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{visit.soapNotes.plan}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Diagnoses */}
              {visit.diagnoses && visit.diagnoses.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-red-600 rounded-lg">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">Diagnoses</h3>
                  </div>
                  <div className="flex flex-col gap-3">
                    {visit.diagnoses.map((diag, idx) => (
                      <div key={idx} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1">
                            {diag.code && (
                              <p className="text-sm font-bold font-mono text-red-600 mb-1">
                                {diag.code}
                              </p>
                            )}
                            {diag.description && (
                              <p className="text-sm text-gray-700">{diag.description}</p>
                            )}
                          </div>
                          {diag.primary && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border bg-blue-100 text-blue-700 border-blue-200">
                              Primary
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Treatment Plan */}
              {visit.treatmentPlan && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-emerald-600 rounded-lg">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">Treatment Plan</h3>
                  </div>
                  {visit.treatmentPlan.medications && visit.treatmentPlan.medications.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Medications</p>
                      <div className="flex flex-col gap-2">
                        {visit.treatmentPlan.medications.map((med, idx) => (
                          <div key={idx} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                            <p className="text-sm font-bold text-gray-900 mb-1">{med.name}</p>
                            <p className="text-xs text-gray-600 font-medium">
                              {med.dosage} • {med.frequency} • {med.duration}
                            </p>
                            {med.instructions && (
                              <p className="text-xs text-gray-600 mt-2 bg-white/50 p-2 rounded border border-gray-200">{med.instructions}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {visit.treatmentPlan.followUp && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                      <p className="text-sm font-bold text-emerald-900 mb-2">Follow-up</p>
                      {visit.treatmentPlan.followUp.date && (
                        <p className="text-sm font-medium text-gray-900 mb-2">
                          Date: {new Date(visit.treatmentPlan.followUp.date).toLocaleDateString()}
                        </p>
                      )}
                      {visit.treatmentPlan.followUp.instructions && (
                        <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap bg-white/50 p-3 rounded border border-gray-200">
                          {visit.treatmentPlan.followUp.instructions}
                        </p>
                      )}
                      {visit.followUpReminderSent && (
                        <p className="text-xs text-green-700 font-semibold mt-3 bg-green-100 px-2 py-1 rounded border border-green-200 inline-block">✓ Reminder sent</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Digital Signature */}
              {visit.digitalSignature && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-green-600 rounded-lg">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">Digital Signature</h3>
                  </div>
                  <div className="flex items-center gap-4 bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="border-2 border-green-300 rounded-lg p-2 bg-white shadow-sm">
                      <img
                        src={visit.digitalSignature.signatureData}
                        alt="Signature"
                        className="h-20 block"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900 mb-1">
                        Signed by: {visit.digitalSignature.providerName}
                      </p>
                      <p className="text-xs text-gray-600 font-medium">
                        {new Date(visit.digitalSignature.signedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Additional Notes */}
              {visit.notes && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-gray-500 rounded-lg">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">Additional Notes</h3>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-200">{visit.notes}</p>
                </div>
              )}

              {/* Clinical Images/Attachments */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-purple-600 rounded-lg">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">Clinical Images & Attachments</h3>
                </div>

                {/* File Upload Section */}
                <FileUploadSection onUpload={handleFileUpload} />

                {/* Display Attachments */}
                {visit.attachments && visit.attachments.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Uploaded Files</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {visit.attachments.map((attachment, idx) => (
                        <div key={attachment._id || idx} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                          <div className="p-4">
                            {attachment.url && attachment.contentType?.startsWith('image/') ? (
                              <div className="mb-3">
                                <img
                                  src={attachment.url}
                                  alt={attachment.filename}
                                  className="w-full h-32 object-cover rounded-lg cursor-pointer border border-gray-200"
                                  onClick={() => window.open(attachment.url, '_blank')}
                                />
                              </div>
                            ) : (
                              <div className="flex items-center justify-center mb-3 h-32 bg-gray-100 rounded-lg border border-gray-200">
                                <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="text-gray-500">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-bold text-gray-900 truncate" title={attachment.filename}>
                                {attachment.filename}
                              </p>
                              {attachment.notes && (
                                <p className="text-xs text-gray-600 mt-1.5 bg-white/50 p-2 rounded border border-gray-200">{attachment.notes}</p>
                              )}
                              <p className="text-xs text-gray-600 mt-2 font-medium">
                                {new Date(attachment.uploadDate).toLocaleDateString()}
                                {attachment.size && ` • ${(attachment.size / 1024).toFixed(1)} KB`}
                              </p>
                              {attachment.url && (
                                <a
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block mt-2 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-xs font-semibold border border-purple-200"
                                >
                                  View/Download
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}



function FileUploadSection({ onUpload }: { onUpload: (file: File, notes?: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    try {
      await onUpload(file, notes || undefined);
      setFile(null);
      setNotes('');
      // Reset file input
      const fileInput = document.getElementById('visit-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg">
      <div className="p-4">
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">
                Upload Clinical Image or Document
              </p>
              <input
                id="visit-file-input"
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
                className="w-full text-sm px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all bg-white"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">Notes (Optional)</p>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., X-ray image, wound photo, etc."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={!file || uploading}
              className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed transition-colors text-sm font-semibold"
            >
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

