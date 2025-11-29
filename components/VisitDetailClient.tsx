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
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3 min-h-[256px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-500">Loading visit...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!visit) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3 min-h-[256px]">
            <h2 className="text-xl font-semibold">Visit not found</h2>
            <Link 
              href="/visits"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Back to Visits
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Link 
                  href="/visits"
                  className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
                <h1 className="text-3xl font-bold">Visit {visit.visitCode}</h1>
              </div>
              <p className="text-sm text-gray-500 ml-11">
                {visit.patient 
                  ? `${visit.patient.firstName} ${visit.patient.lastName} • ${new Date(visit.date).toLocaleDateString()}`
                  : `No patient assigned • ${new Date(visit.date).toLocaleDateString()}`
                }
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <select
                value={visit.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              {!editing && (
                <>
                  <button
                    onClick={() => handlePrint('medical-certificate')}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-1.5"
                    title="Print Medical Certificate"
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Medical Certificate
                  </button>
                  <button
                    onClick={() => handlePrint('lab-request')}
                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium flex items-center gap-1.5"
                    title="Print Lab Request"
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Lab Request
                  </button>
                  <button
                    onClick={() => setEditing(true)}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-1.5"
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Edit Mode */}
          {editing ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-3">
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
            <div className="flex flex-col gap-3">
              {/* Patient Info */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-3">
                  <h3 className="text-lg font-semibold mb-3">Patient Information</h3>
                  {visit.patient ? (
                    <div className="flex flex-col md:flex-row gap-4 flex-wrap">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Name</p>
                        <Link href={`/patients/${visit.patient._id}`} className="text-sm text-blue-600 hover:underline">
                          {visit.patient.firstName} {visit.patient.lastName}
                        </Link>
                      </div>
                      {visit.patient.patientCode && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Patient ID</p>
                          <p className="text-sm">{visit.patient.patientCode}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Email</p>
                        <p className="text-sm">{visit.patient.email}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Phone</p>
                        <p className="text-sm">{visit.patient.phone}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No patient assigned to this visit</p>
                  )}
                </div>
              </div>

              {/* SOAP Notes */}
              {visit.soapNotes && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-3">
                    <h3 className="text-lg font-semibold mb-3">SOAP Notes</h3>
                    <div className="flex flex-col gap-3">
                      {visit.soapNotes.subjective && (
                        <div>
                          <p className="text-sm font-bold mb-2">S - Subjective</p>
                          <p className="text-sm whitespace-pre-wrap">{visit.soapNotes.subjective}</p>
                        </div>
                      )}
                      {visit.soapNotes.objective && (
                        <div>
                          <p className="text-sm font-bold mb-2">O - Objective</p>
                          <p className="text-sm whitespace-pre-wrap">{visit.soapNotes.objective}</p>
                        </div>
                      )}
                      {visit.soapNotes.assessment && (
                        <div>
                          <p className="text-sm font-bold mb-2">A - Assessment</p>
                          <p className="text-sm whitespace-pre-wrap">{visit.soapNotes.assessment}</p>
                        </div>
                      )}
                      {visit.soapNotes.plan && (
                        <div>
                          <p className="text-sm font-bold mb-2">P - Plan</p>
                          <p className="text-sm whitespace-pre-wrap">{visit.soapNotes.plan}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Diagnoses */}
              {visit.diagnoses && visit.diagnoses.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-3">
                    <h3 className="text-lg font-semibold mb-3">Diagnoses</h3>
                    <div className="flex flex-col gap-2">
                      {visit.diagnoses.map((diag, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex justify-between items-start gap-3 p-2">
                            <div className="flex-1">
                              {diag.code && (
                                <p className="text-sm font-medium font-mono text-blue-600">
                                  {diag.code}
                                </p>
                              )}
                              {diag.description && (
                                <p className="text-sm mt-1">{diag.description}</p>
                              )}
                            </div>
                            {diag.primary && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-blue-100 text-blue-800 border-blue-200">
                                Primary
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Treatment Plan */}
              {visit.treatmentPlan && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-3">
                    <h3 className="text-lg font-semibold mb-3">Treatment Plan</h3>
                    {visit.treatmentPlan.medications && visit.treatmentPlan.medications.length > 0 && (
                      <div className="mb-3">
                        <p className="text-sm font-bold mb-2">Medications</p>
                        <div className="flex flex-col gap-2">
                          {visit.treatmentPlan.medications.map((med, idx) => (
                            <div key={idx} className="bg-gray-50 rounded-lg border border-gray-200">
                              <div className="p-2">
                                <p className="text-sm font-medium">{med.name}</p>
                                <p className="text-xs text-gray-500">
                                  {med.dosage} • {med.frequency} • {med.duration}
                                </p>
                                {med.instructions && (
                                  <p className="text-xs text-gray-500 mt-1">{med.instructions}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {visit.treatmentPlan.followUp && (
                      <div>
                        <p className="text-sm font-bold mb-2">Follow-up</p>
                        {visit.treatmentPlan.followUp.date && (
                          <p className="text-sm">
                            Date: {new Date(visit.treatmentPlan.followUp.date).toLocaleDateString()}
                          </p>
                        )}
                        {visit.treatmentPlan.followUp.instructions && (
                          <p className="text-sm mt-1 whitespace-pre-wrap">
                            {visit.treatmentPlan.followUp.instructions}
                          </p>
                        )}
                        {visit.followUpReminderSent && (
                          <p className="text-xs text-green-600 mt-2">✓ Reminder sent</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Digital Signature */}
              {visit.digitalSignature && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-3">
                    <h3 className="text-lg font-semibold mb-3">Digital Signature</h3>
                    <div className="flex items-center gap-3">
                      <div className="border-2 border-gray-300 rounded-lg p-1.5 bg-white">
                        <img
                          src={visit.digitalSignature.signatureData}
                          alt="Signature"
                          className="h-20 block"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          Signed by: {visit.digitalSignature.providerName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(visit.digitalSignature.signedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Additional Notes */}
              {visit.notes && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-3">
                    <h3 className="text-lg font-semibold mb-3">Additional Notes</h3>
                    <p className="text-sm whitespace-pre-wrap">{visit.notes}</p>
                  </div>
                </div>
              )}

              {/* Clinical Images/Attachments */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-3">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold">Clinical Images & Attachments</h3>
                  </div>
                  
                  {/* File Upload Section */}
                  <FileUploadSection onUpload={handleFileUpload} />

                  {/* Display Attachments */}
                  {visit.attachments && visit.attachments.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-bold mb-3">Uploaded Files</p>
                      <div className="flex gap-3 flex-wrap">
                        {visit.attachments.map((attachment, idx) => (
                          <div key={attachment._id || idx} className="bg-gray-50 rounded-lg border border-gray-200 flex-1 min-w-[200px]">
                            <div className="p-3">
                              {attachment.url && attachment.contentType?.startsWith('image/') ? (
                                <div className="mb-2">
                                  <img
                                    src={attachment.url}
                                    alt={attachment.filename}
                                    className="w-full h-32 object-cover rounded-lg cursor-pointer"
                                    onClick={() => window.open(attachment.url, '_blank')}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center justify-center mb-2 h-32 bg-gray-100 rounded-lg">
                                  <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="text-gray-500">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-medium truncate" title={attachment.filename}>
                                  {attachment.filename}
                                </p>
                                {attachment.notes && (
                                  <p className="text-xs text-gray-500 mt-1">{attachment.notes}</p>
                                )}
                                <p className="text-xs text-gray-500 mt-1">
                                  {new Date(attachment.uploadDate).toLocaleDateString()}
                                  {attachment.size && ` • ${(attachment.size / 1024).toFixed(1)} KB`}
                                </p>
                                {attachment.url && (
                                  <a
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block mt-1 px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-xs font-medium"
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
    <div className="bg-gray-50 rounded-lg border border-gray-200">
      <div className="p-3">
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-medium mb-2">
                Upload Clinical Image or Document
              </p>
              <input
                id="visit-file-input"
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
                className="w-full text-sm"
              />
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Notes (Optional)</p>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., X-ray image, wound photo, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!file || uploading}
              className="w-full px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

