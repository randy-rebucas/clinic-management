'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import VisitForm from './VisitForm';

interface Visit {
  _id: string;
  visitCode: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
    email: string;
    phone: string;
  };
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
      }
    } catch (error) {
      console.error('Failed to fetch visit:', error);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading visit...</p>
        </div>
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Visit not found</h2>
          <Link href="/visits" className="text-blue-600 hover:text-blue-700">
            Back to Visits
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="mb-4 sm:mb-0">
            <div className="flex items-center space-x-3 mb-2">
              <Link href="/visits" className="text-gray-500 hover:text-gray-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Visit {visit.visitCode}</h1>
            </div>
            <p className="text-gray-600 text-sm sm:text-base ml-9">
              {visit.patient.firstName} {visit.patient.lastName} • {new Date(visit.date).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <select
              value={visit.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-sm hover:shadow-md"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Edit Mode */}
        {editing ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <VisitForm
              initialData={visit}
              patients={[{ _id: visit.patient._id, firstName: visit.patient.firstName, lastName: visit.patient.lastName }]}
              onSubmit={handleUpdate}
              onCancel={() => setEditing(false)}
              providerName={providerName}
            />
          </div>
        ) : (
          /* View Mode */
          <div className="space-y-6">
            {/* Patient Info */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Patient Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Name</p>
                  <p className="text-sm text-gray-900">
                    {visit.patient.firstName} {visit.patient.lastName}
                  </p>
                </div>
                {visit.patient.patientCode && (
                  <div>
                    <p className="text-sm font-medium text-gray-500">Patient ID</p>
                    <p className="text-sm text-gray-900">{visit.patient.patientCode}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-500">Email</p>
                  <p className="text-sm text-gray-900">{visit.patient.email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Phone</p>
                  <p className="text-sm text-gray-900">{visit.patient.phone}</p>
                </div>
              </div>
            </div>

            {/* SOAP Notes */}
            {visit.soapNotes && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">SOAP Notes</h3>
                <div className="space-y-4">
                  {visit.soapNotes.subjective && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">S - Subjective</h4>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{visit.soapNotes.subjective}</p>
                    </div>
                  )}
                  {visit.soapNotes.objective && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">O - Objective</h4>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{visit.soapNotes.objective}</p>
                    </div>
                  )}
                  {visit.soapNotes.assessment && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">A - Assessment</h4>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{visit.soapNotes.assessment}</p>
                    </div>
                  )}
                  {visit.soapNotes.plan && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">P - Plan</h4>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{visit.soapNotes.plan}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Diagnoses */}
            {visit.diagnoses && visit.diagnoses.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Diagnoses</h3>
                <div className="space-y-2">
                  {visit.diagnoses.map((diag, idx) => (
                    <div key={idx} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        {diag.code && (
                          <span className="font-mono text-sm font-medium text-blue-600">{diag.code}</span>
                        )}
                        {diag.description && (
                          <p className="text-sm text-gray-900 mt-1">{diag.description}</p>
                        )}
                      </div>
                      {diag.primary && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          Primary
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Treatment Plan */}
            {visit.treatmentPlan && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Treatment Plan</h3>
                {visit.treatmentPlan.medications && visit.treatmentPlan.medications.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Medications</h4>
                    <div className="space-y-2">
                      {visit.treatmentPlan.medications.map((med, idx) => (
                        <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm font-medium text-gray-900">{med.name}</p>
                          <p className="text-xs text-gray-600">
                            {med.dosage} • {med.frequency} • {med.duration}
                          </p>
                          {med.instructions && (
                            <p className="text-xs text-gray-600 mt-1">{med.instructions}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {visit.treatmentPlan.followUp && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Follow-up</h4>
                    {visit.treatmentPlan.followUp.date && (
                      <p className="text-sm text-gray-900">
                        Date: {new Date(visit.treatmentPlan.followUp.date).toLocaleDateString()}
                      </p>
                    )}
                    {visit.treatmentPlan.followUp.instructions && (
                      <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">
                        {visit.treatmentPlan.followUp.instructions}
                      </p>
                    )}
                    {visit.followUpReminderSent && (
                      <p className="text-xs text-green-600 mt-2">✓ Reminder sent</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Digital Signature */}
            {visit.digitalSignature && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Digital Signature</h3>
                <div className="flex items-center space-x-4">
                  <div className="border-2 border-gray-200 rounded-lg p-2 bg-white">
                    <img
                      src={visit.digitalSignature.signatureData}
                      alt="Signature"
                      className="h-20"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Signed by: {visit.digitalSignature.providerName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(visit.digitalSignature.signedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Additional Notes */}
            {visit.notes && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Notes</h3>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{visit.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

