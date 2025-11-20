'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { QRCode } from 'react-qr-code';

interface Patient {
  _id: string;
  patientCode?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex?: 'male' | 'female' | 'other' | 'unknown';
  civilStatus?: string;
  nationality?: string;
  occupation?: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  emergencyContact: {
    name: string;
    phone: string;
    relationship?: string;
  };
  identifiers?: {
    philHealth?: string;
    govId?: string;
  };
  medicalHistory?: string;
  allergies?: Array<string | {
    substance: string;
    reaction: string;
    severity: string;
  }>;
  attachments?: Array<{
    _id: string;
    filename: string;
    contentType?: string;
    size?: number;
    url?: string;
    uploadDate: string;
    notes?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface Visit {
  _id: string;
  visitCode: string;
  date: string;
  visitType: string;
  chiefComplaint?: string;
  diagnoses?: Array<{
    code?: string;
    description?: string;
    primary?: boolean;
  }>;
  status: string;
}

export default function PatientDetailClient({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'emr' | 'files'>('overview');
  const [showQR, setShowQR] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchPatient();
    fetchVisits();
  }, [patientId]);

  const fetchPatient = async () => {
    try {
      const res = await fetch(`/api/patients/${patientId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setPatient(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch patient:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVisits = async () => {
    try {
      const res = await fetch(`/api/visits?patientId=${patientId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVisits(data.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch visits:', error);
    }
  };

  const handleFileUpload = async (file: File, notes?: string) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (notes) formData.append('notes', notes);

      const res = await fetch(`/api/patients/${patientId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          fetchPatient(); // Refresh patient data
          alert('File uploaded successfully');
        }
      } else {
        alert('Failed to upload file');
      }
    } catch (error) {
      console.error('Failed to upload file:', error);
      alert('Failed to upload file');
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      const res = await fetch(`/api/patients/${patientId}/files/${fileId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchPatient(); // Refresh patient data
      } else {
        alert('Failed to delete file');
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('Failed to delete file');
    }
  };

  const formatAllergies = () => {
    if (!patient?.allergies || patient.allergies.length === 0) {
      return 'No known allergies';
    }
    return patient.allergies.map((allergy) => {
      if (typeof allergy === 'string') {
        return allergy;
      }
      return `${allergy.substance}${allergy.reaction ? ` (${allergy.reaction})` : ''}${allergy.severity ? ` - ${allergy.severity}` : ''}`;
    }).join(', ');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading patient...</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Patient not found</h2>
          <Link href="/patients" className="text-blue-600 hover:text-blue-700">
            Back to Patients
          </Link>
        </div>
      </div>
    );
  }

  const qrValue = patient.patientCode || patient._id;
  const fullName = [patient.firstName, patient.middleName, patient.lastName, patient.suffix]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="mb-4 sm:mb-0">
            <div className="flex items-center space-x-3 mb-2">
              <Link
                href="/patients"
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
                {fullName}
              </h1>
            </div>
            {patient.patientCode && (
              <p className="text-gray-600 text-sm sm:text-base ml-9">
                Patient ID: {patient.patientCode}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowQR(!showQR)}
              className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-sm hover:shadow-md hover:from-blue-700 hover:to-blue-800 transition-all"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              {showQR ? 'Hide' : 'Show'} QR Code
            </button>
            <button
              onClick={() => router.push(`/patients?edit=${patient._id}`)}
              className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-green-700 rounded-lg shadow-sm hover:shadow-md hover:from-green-700 hover:to-green-800 transition-all"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
          </div>
        </div>

        {/* QR Code Modal */}
        {showQR && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowQR(false)} />
              <div className="relative bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900">Patient QR Code</h3>
                  <button
                    onClick={() => setShowQR(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex flex-col items-center">
                  <div className="bg-white p-4 rounded-lg border-2 border-gray-200 mb-4">
                    <QRCode value={qrValue} size={256} />
                  </div>
                  <p className="text-sm text-gray-600 text-center">
                    Patient ID: <span className="font-semibold">{qrValue}</span>
                  </p>
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Scan this code to quickly access patient information
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('emr')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'emr'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Medical Records ({visits.length})
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'files'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Files ({patient.attachments?.length || 0})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                    <dl className="space-y-3">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Full Name</dt>
                        <dd className="text-sm text-gray-900">{fullName}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Date of Birth</dt>
                        <dd className="text-sm text-gray-900">
                          {new Date(patient.dateOfBirth).toLocaleDateString()}
                        </dd>
                      </div>
                      {patient.sex && (
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Sex</dt>
                          <dd className="text-sm text-gray-900 capitalize">{patient.sex}</dd>
                        </div>
                      )}
                      {patient.civilStatus && (
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Civil Status</dt>
                          <dd className="text-sm text-gray-900">{patient.civilStatus}</dd>
                        </div>
                      )}
                      {patient.nationality && (
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Nationality</dt>
                          <dd className="text-sm text-gray-900">{patient.nationality}</dd>
                        </div>
                      )}
                      {patient.occupation && (
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Occupation</dt>
                          <dd className="text-sm text-gray-900">{patient.occupation}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {/* Contact Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
                    <dl className="space-y-3">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Email</dt>
                        <dd className="text-sm text-gray-900">{patient.email}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Phone</dt>
                        <dd className="text-sm text-gray-900">{patient.phone}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Address</dt>
                        <dd className="text-sm text-gray-900">
                          {patient.address.street}, {patient.address.city}, {patient.address.state} {patient.address.zipCode}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Emergency Contact</h3>
                  <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Name</dt>
                      <dd className="text-sm text-gray-900">{patient.emergencyContact.name}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Phone</dt>
                      <dd className="text-sm text-gray-900">{patient.emergencyContact.phone}</dd>
                    </div>
                    {patient.emergencyContact.relationship && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Relationship</dt>
                        <dd className="text-sm text-gray-900">{patient.emergencyContact.relationship}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Identifiers */}
                {(patient.identifiers?.philHealth || patient.identifiers?.govId) && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Identifiers</h3>
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {patient.identifiers.philHealth && (
                        <div>
                          <dt className="text-sm font-medium text-gray-500">PhilHealth ID</dt>
                          <dd className="text-sm text-gray-900">{patient.identifiers.philHealth}</dd>
                        </div>
                      )}
                      {patient.identifiers.govId && (
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Government ID</dt>
                          <dd className="text-sm text-gray-900">{patient.identifiers.govId}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}

                {/* Medical Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Medical Information</h3>
                  <div className="space-y-4">
                    <div>
                      <dt className="text-sm font-medium text-gray-500 mb-2">Medical History</dt>
                      <dd className="text-sm text-gray-900 whitespace-pre-wrap">
                        {patient.medicalHistory || 'No medical history recorded'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500 mb-2">Allergies</dt>
                      <dd className="text-sm text-gray-900">{formatAllergies()}</dd>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* EMR Tab */}
            {activeTab === 'emr' && (
              <div>
                {visits.length === 0 ? (
                  <div className="text-center py-12">
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No medical records found</h3>
                    <p className="text-gray-600">Medical records will appear here once visits are created.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {visits.map((visit) => (
                      <div key={visit._id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <span className="text-sm font-semibold text-gray-900">{visit.visitCode}</span>
                              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full capitalize">
                                {visit.visitType}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                visit.status === 'closed' ? 'bg-green-100 text-green-800' :
                                visit.status === 'open' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {visit.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">
                              Date: {new Date(visit.date).toLocaleDateString()}
                            </p>
                            {visit.chiefComplaint && (
                              <p className="text-sm text-gray-700 mb-2">
                                <span className="font-medium">Chief Complaint:</span> {visit.chiefComplaint}
                              </p>
                            )}
                            {visit.diagnoses && visit.diagnoses.length > 0 && (
                              <div className="mt-2">
                                <p className="text-sm font-medium text-gray-700 mb-1">Diagnoses:</p>
                                <ul className="list-disc list-inside text-sm text-gray-600">
                                  {visit.diagnoses.map((diag, idx) => (
                                    <li key={idx}>
                                      {diag.code && <span className="font-mono">{diag.code}</span>}
                                      {diag.description && ` - ${diag.description}`}
                                      {diag.primary && <span className="text-blue-600 ml-1">(Primary)</span>}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          <Link
                            href={`/visits/${visit._id}`}
                            className="ml-4 text-blue-600 hover:text-blue-700 text-sm font-medium"
                          >
                            View Details →
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Files Tab */}
            {activeTab === 'files' && (
              <div>
                <FileUploadSection onUpload={handleFileUpload} />
                <div className="mt-6">
                  {!patient.attachments || patient.attachments.length === 0 ? (
                    <div className="text-center py-12">
                      <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No files uploaded</h3>
                      <p className="text-gray-600">Upload lab results, prescriptions, or other documents above.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {patient.attachments.map((file) => (
                        <div key={file._id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                          <div className="flex items-center space-x-4 flex-1">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{file.filename}</p>
                              <p className="text-xs text-gray-500">
                                {file.size ? `${(file.size / 1024).toFixed(2)} KB` : 'Unknown size'} • 
                                Uploaded {new Date(file.uploadDate).toLocaleDateString()}
                              </p>
                              {file.notes && (
                                <p className="text-xs text-gray-600 mt-1">{file.notes}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {file.url && (
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
                              >
                                View
                              </a>
                            )}
                            <button
                              onClick={() => handleDeleteFile(file._id)}
                              className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload File</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select File (Lab Results, Prescriptions, Documents)
          </label>
          <input
            id="file-input"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Lab results from 2024-01-15"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'Uploading...' : 'Upload File'}
        </button>
      </form>
    </div>
  );
}

