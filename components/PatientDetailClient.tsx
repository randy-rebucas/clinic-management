'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import { Modal, AlertDialog } from './ui/Modal';
import { useSetting } from './SettingsContext';

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
  preExistingConditions?: Array<{
    condition: string;
    diagnosisDate?: string;
    status: 'active' | 'resolved' | 'chronic';
    notes?: string;
  }>;
  allergies?: Array<string | {
    substance: string;
    reaction: string;
    severity: string;
  }>;
  familyHistory?: Record<string, string>;
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

interface PatientAlert {
  type: 'allergy' | 'unpaid_balance' | 'critical_condition' | 'missing_info';
  severity: 'high' | 'medium' | 'low';
  message: string;
  details?: any;
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

interface Appointment {
  _id: string;
  appointmentCode: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  doctor?: {
    firstName: string;
    lastName: string;
  };
}

interface Prescription {
  _id: string;
  prescriptionCode: string;
  issuedAt: string;
  status: string;
  medications: Array<{ name: string }>;
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  total: number;
  totalPaid: number;
  outstandingBalance: number;
  status: string;
  createdAt: string;
}

interface LabResult {
  _id: string;
  requestCode: string;
  orderDate: string;
  status: string;
  testName?: string;
}

export default function PatientDetailClient({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [alerts, setAlerts] = useState<PatientAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'visits' | 'appointments' | 'prescriptions' | 'invoices' | 'lab-results' | 'files'>('overview');
  const [showQR, setShowQR] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [deleteFileDialogOpen, setDeleteFileDialogOpen] = useState(false);
  const router = useRouter();
  
  // Call hooks before any conditional returns
  const currency = useSetting('billingSettings.currency', 'PHP');

  useEffect(() => {
    fetchPatient();
    fetchVisits();
    fetchAppointments();
    fetchPrescriptions();
    fetchInvoices();
    fetchLabResults();
    fetchAlerts();
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

  const fetchAppointments = async () => {
    try {
      const res = await fetch(`/api/appointments?patientId=${patientId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAppointments(data.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
    }
  };

  const fetchPrescriptions = async () => {
    try {
      const res = await fetch(`/api/prescriptions?patientId=${patientId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPrescriptions(data.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch prescriptions:', error);
    }
  };

  const fetchInvoices = async () => {
    try {
      const res = await fetch(`/api/invoices?patientId=${patientId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setInvoices(data.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
    }
  };

  const fetchLabResults = async () => {
    try {
      const res = await fetch(`/api/lab-results?patientId=${patientId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setLabResults(data.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch lab results:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`/api/patients/${patientId}/alerts`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAlerts(data.data.alerts || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
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

  const handleDeleteFileClick = (fileId: string) => {
    setFileToDelete(fileId);
    setDeleteFileDialogOpen(true);
  };

  const handleDeleteFile = async () => {
    if (!fileToDelete) return;

    try {
      const res = await fetch(`/api/patients/${patientId}/files/${fileToDelete}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchPatient(); // Refresh patient data
        setDeleteFileDialogOpen(false);
        setFileToDelete(null);
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
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-6">
            <div className="h-20 w-[400px] bg-gray-200 rounded-xl animate-pulse"></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse"></div>
              ))}
            </div>
            <div className="h-[400px] bg-gray-200 rounded-xl animate-pulse"></div>
          </div>
        </div>
      </section>
    );
  }

  if (!patient) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-4" style={{ minHeight: '50vh' }}>
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Patient not found</h2>
            <Link 
              href="/patients"
              className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md"
            >
              Back to Patients
            </Link>
          </div>
        </div>
      </section>
    );
  }
  
  const qrValue = patient.patientCode || patient._id;
  const fullName = [patient.firstName, patient.middleName, patient.lastName, patient.suffix]
    .filter(Boolean)
    .join(' ');
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const calculateAge = (dateOfBirth: string) => {
    const age = Math.floor((new Date().getTime() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return age;
  };

  // Only count outstanding balance from unpaid and partial invoices
  const totalOutstanding = invoices.reduce((sum, inv) => {
    if (inv.status === 'paid' || inv.status === 'refunded') {
      return sum;
    }
    return sum + (inv.outstandingBalance || 0);
  }, 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.totalPaid || 0), 0);

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <Link 
                href="/patients"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 mt-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold shadow-md flex-shrink-0">
                    {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
                      {fullName}
                    </h1>
                    <div className="flex items-center gap-3 flex-wrap">
                      {patient.patientCode && (
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-semibold">
                          ID: {patient.patientCode}
                        </span>
                      )}
                      <span className="text-sm text-gray-600">{calculateAge(patient.dateOfBirth)} years old</span>
                      {patient.sex && patient.sex !== 'unknown' && (
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-semibold capitalize">
                          {patient.sex}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setShowQR(!showQR)}
                      className="px-4 py-2.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-semibold flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                      QR Code
                    </button>
                    <Link 
                      href={`/patients/${patient._id}/edit`}
                      className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all text-sm font-semibold shadow-md flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Visits</p>
                <div className="p-1.5 bg-blue-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl font-bold text-blue-700">{visits.length}</p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Appointments</p>
                <div className="p-1.5 bg-purple-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl font-bold text-purple-700">{appointments.length}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border border-emerald-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Prescriptions</p>
                <div className="p-1.5 bg-emerald-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl font-bold text-emerald-700">{prescriptions.length}</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl border border-amber-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Invoices</p>
                <div className="p-1.5 bg-amber-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl font-bold text-amber-700">{invoices.length}</p>
            </div>
            <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl border border-teal-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide">Lab Results</p>
                <div className="p-1.5 bg-teal-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl font-bold text-teal-700">{labResults.length}</p>
            </div>
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl border border-red-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Outstanding</p>
                <div className="p-1.5 bg-red-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl font-bold text-red-700">{formatCurrency(totalOutstanding)}</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-gray-200 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-teal-100 rounded-lg">
                  <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Quick Actions</h3>
              </div>
            </div>
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Link 
                  href={`/appointments/new?patientId=${patientId}`}
                  className="px-4 py-3 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-lg hover:shadow-md hover:border-blue-300 transition-all text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Schedule
                </Link>
                <Link 
                  href={`/visits/new?patientId=${patientId}`}
                  className="px-4 py-3 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-lg hover:shadow-md hover:border-emerald-300 transition-all text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  New Visit
                </Link>
                <Link 
                  href={`/prescriptions/new?patientId=${patientId}`}
                  className="px-4 py-3 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-lg hover:shadow-md hover:border-purple-300 transition-all text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  Prescription
                </Link>
                <Link 
                  href={`/invoices/new?patientId=${patientId}`}
                  className="px-4 py-3 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-lg hover:shadow-md hover:border-amber-300 transition-all text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Invoice
                </Link>
                <Link 
                  href={`/lab-results/new?patientId=${patientId}`}
                  className="px-4 py-3 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-lg hover:shadow-md hover:border-teal-300 transition-all text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Lab Result
                </Link>
                <button 
                  onClick={() => setShowQR(!showQR)}
                  className="px-4 py-3 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-lg hover:shadow-md hover:border-blue-300 transition-all text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  QR Code
                </button>
              </div>
            </div>
          </div>

          {/* QR Code Modal */}
          <Modal open={showQR} onOpenChange={setShowQR} className="max-w-md">
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Patient QR Code</h2>
              </div>
              <div className="flex flex-col items-center gap-4">
                <div className="p-6 bg-white border-2 border-gray-200 rounded-xl shadow-md">
                  <QRCode value={qrValue} size={256} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700 mb-1">
                    Patient ID: <span className="font-bold text-gray-900">{qrValue}</span>
                  </p>
                  <p className="text-xs text-gray-600">
                    Scan this code to quickly access patient information
                  </p>
                </div>
              </div>
            </div>
          </Modal>

          {/* Patient Alerts */}
          {alerts.length > 0 && (
            <div className="flex flex-col gap-3">
              {alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl p-4 border-l-4 ${
                    alert.severity === 'high' ? 'bg-red-50 border-red-500 text-red-800' :
                    alert.severity === 'medium' ? 'bg-yellow-50 border-yellow-500 text-yellow-800' :
                    'bg-blue-50 border-blue-500 text-blue-800'
                  } shadow-sm`}
                >
                  <div className="flex items-start gap-2">
                    <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      alert.severity === 'high' ? 'text-red-600' :
                      alert.severity === 'medium' ? 'text-yellow-600' :
                      'text-blue-600'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-sm font-medium">{alert.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50/50 overflow-x-auto">
            <nav className="flex -mb-px min-w-max">
              {[
                { value: 'overview', label: 'Overview', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
                { value: 'visits', label: `Visits (${visits.length})`, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                { value: 'appointments', label: `Appointments (${appointments.length})`, icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                { value: 'prescriptions', label: `Prescriptions (${prescriptions.length})`, icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
                { value: 'invoices', label: `Invoices (${invoices.length})`, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                { value: 'lab-results', label: `Lab Results (${labResults.length})`, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                { value: 'files', label: `Files (${patient.attachments?.length || 0})`, icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' }
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value as any)}
                  className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all duration-200 whitespace-nowrap relative ${
                    activeTab === tab.value
                      ? 'text-blue-600 bg-white'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {activeTab === tab.value && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600"></span>
                  )}
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                    </svg>
                    {tab.label}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Information */}
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-blue-500 rounded-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">Basic Information</h3>
                    </div>
                    <dl className="space-y-3">
                      <div>
                      <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Full Name</dt>
                      <dd className="text-sm font-medium text-gray-900">{fullName}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Date of Birth</dt>
                      <dd className="text-sm font-medium text-gray-900">
                        {new Date(patient.dateOfBirth).toLocaleDateString()}
                      </dd>
                    </div>
                      {patient.sex && (
                        <div>
                          <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Sex</dt>
                          <dd className="text-sm font-medium text-gray-900 capitalize">{patient.sex}</dd>
                        </div>
                      )}
                      {patient.civilStatus && (
                        <div>
                          <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Civil Status</dt>
                          <dd className="text-sm font-medium text-gray-900">{patient.civilStatus}</dd>
                        </div>
                      )}
                      {patient.nationality && (
                        <div>
                          <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Nationality</dt>
                          <dd className="text-sm font-medium text-gray-900">{patient.nationality}</dd>
                        </div>
                      )}
                      {patient.occupation && (
                        <div>
                          <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Occupation</dt>
                          <dd className="text-sm font-medium text-gray-900">{patient.occupation}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {/* Contact Information */}
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-purple-500 rounded-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">Contact Information</h3>
                    </div>
                    <dl className="space-y-3">
                      <div>
                        <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Email</dt>
                        <dd className="text-sm font-medium text-gray-900">{patient.email}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Phone</dt>
                        <dd className="text-sm font-medium text-gray-900">{patient.phone}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Address</dt>
                        <dd className="text-sm font-medium text-gray-900">
                          {patient.address.street}, {patient.address.city}, {patient.address.state} {patient.address.zipCode}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Emergency Contact</h3>
                  </div>
                  <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Name</dt>
                      <dd className="text-sm font-medium text-gray-900">{patient.emergencyContact?.name || '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Phone</dt>
                      <dd className="text-sm font-medium text-gray-900">{patient.emergencyContact?.phone || '-'}</dd>
                    </div>
                    {patient.emergencyContact?.relationship && (
                      <div>
                        <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Relationship</dt>
                        <dd className="text-sm font-medium text-gray-900">{patient.emergencyContact?.relationship || '-'}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Identifiers */}
                {(patient.identifiers?.philHealth || patient.identifiers?.govId) && (
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-amber-500 rounded-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">Identifiers</h3>
                    </div>
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {patient.identifiers.philHealth && (
                        <div>
                          <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">PhilHealth ID</dt>
                          <dd className="text-sm font-medium text-gray-900">{patient.identifiers.philHealth}</dd>
                        </div>
                      )}
                      {patient.identifiers.govId && (
                        <div>
                          <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Government ID</dt>
                          <dd className="text-sm font-medium text-gray-900">{patient.identifiers.govId}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}

                {/* Medical Information */}
                <div className="bg-gradient-to-br from-red-50 to-red-100/50 border border-red-200 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-red-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Medical Information</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Medical History</dt>
                      <dd className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed bg-white/50 p-3 rounded-lg border border-gray-200">
                        {patient.medicalHistory || 'No medical history recorded'}
                      </dd>
                    </div>
                    {patient.preExistingConditions && patient.preExistingConditions.length > 0 && (
                      <div>
                        <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Pre-existing Conditions</dt>
                        <dd className="text-sm text-gray-900">
                          <ul className="space-y-2">
                            {patient.preExistingConditions.map((condition, idx) => (
                              <li key={idx} className="bg-white/50 p-3 rounded-lg border border-gray-200">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="font-semibold text-gray-900">{condition.condition}</span>
                                  {condition.status && (
                                    <span className={`px-2.5 py-1 text-xs rounded-full font-semibold ${
                                      condition.status === 'active' ? 'bg-red-100 text-red-700 border border-red-200' :
                                      condition.status === 'chronic' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                                      'bg-green-100 text-green-700 border border-green-200'
                                    }`}>
                                      {condition.status}
                                    </span>
                                  )}
                                </div>
                                {condition.diagnosisDate && (
                                  <p className="text-xs text-gray-600 mt-1">
                                    Diagnosed: {new Date(condition.diagnosisDate).toLocaleDateString()}
                                  </p>
                                )}
                                {condition.notes && (
                                  <p className="text-xs text-gray-600 mt-1">{condition.notes}</p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Allergies</dt>
                      <dd className="text-sm font-medium text-gray-900 bg-white/50 p-3 rounded-lg border border-gray-200">{formatAllergies()}</dd>
                    </div>
                    {patient.familyHistory && Object.keys(patient.familyHistory).length > 0 && (
                      <div>
                        <dt className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Family History</dt>
                        <dd className="text-sm text-gray-900">
                          <ul className="space-y-2">
                            {Object.entries(patient.familyHistory).map(([condition, relation]) => (
                              <li key={condition} className="bg-white/50 p-3 rounded-lg border border-gray-200">
                                <span className="font-semibold text-gray-900">{condition}</span>
                                {relation && <span className="text-gray-600 ml-2">({relation})</span>}
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Visits Tab */}
            {activeTab === 'visits' && (
              <div>
                {visits.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">No medical records found</h3>
                    <p className="text-sm text-gray-600 mb-4">Medical records will appear here once visits are created.</p>
                    <Link
                      href={`/visits/new?patientId=${patientId}`}
                      className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md inline-block"
                    >
                      Create First Visit
                    </Link>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Timeline View */}
                    <div className="relative pl-8 border-l-2 border-blue-200">
                      {visits
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((visit, index) => (
                          <div key={visit._id} className="relative mb-6">
                            {/* Timeline dot */}
                            <div className="absolute -left-[21px] top-0 w-5 h-5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full border-4 border-white shadow-md"></div>
                            
                            {/* Timeline content */}
                            <div className="bg-gradient-to-r from-white to-gray-50 border border-gray-200 rounded-xl p-5 hover:shadow-lg hover:border-blue-300 transition-all">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                                    <span className="text-sm font-bold text-gray-900">{visit.visitCode}</span>
                                    <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold capitalize border border-blue-200">
                                      {visit.visitType}
                                    </span>
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                      visit.status === 'closed' ? 'bg-green-100 text-green-700 border border-green-200' :
                                      visit.status === 'open' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                                      'bg-gray-100 text-gray-700 border border-gray-200'
                                    }`}>
                                      {visit.status}
                                    </span>
                                  </div>
                                  <p className="text-sm font-semibold text-gray-900 mb-2">
                                    {new Date(visit.date).toLocaleDateString('en-US', {
                                      weekday: 'long',
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                    })}
                                  </p>
                                  {visit.chiefComplaint && (
                                    <p className="text-sm text-gray-700 mb-2">
                                      <span className="font-semibold">Chief Complaint:</span> {visit.chiefComplaint}
                                    </p>
                                  )}
                                  {visit.diagnoses && visit.diagnoses.length > 0 && (
                                    <div className="mt-3">
                                      <p className="text-sm font-semibold text-gray-900 mb-2">Diagnoses:</p>
                                      <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                                        {visit.diagnoses.map((diag, idx) => (
                                          <li key={idx}>
                                            {diag.code && <span className="font-mono text-blue-600">{diag.code}</span>}
                                            {diag.description && ` - ${diag.description}`}
                                            {diag.primary && <span className="text-blue-600 ml-2 font-semibold">(Primary)</span>}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                                <Link
                                  href={`/visits/${visit._id}`}
                                  className="ml-4 text-blue-600 hover:text-blue-700 text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1"
                                >
                                  View
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </Link>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Appointments Tab */}
            {activeTab === 'appointments' && (
              <div>
                {appointments.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">No appointments found</h3>
                    <p className="text-sm text-gray-600 mb-4">Schedule an appointment for this patient.</p>
                    <Link
                      href={`/appointments/new?patientId=${patientId}`}
                      className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md inline-block"
                    >
                      Schedule Appointment
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {appointments
                      .sort((a, b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime())
                      .map((apt) => (
                        <Link
                          key={apt._id}
                          href={`/appointments/${apt._id}`}
                          className="block p-4 border border-gray-200 rounded-xl hover:shadow-md hover:border-blue-300 transition-all bg-gradient-to-r from-white to-gray-50"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-sm font-bold text-gray-900">{apt.appointmentCode}</span>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  apt.status === 'scheduled' || apt.status === 'confirmed'
                                    ? 'bg-green-100 text-green-700 border border-green-200'
                                    : apt.status === 'completed'
                                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                    : apt.status === 'cancelled'
                                    ? 'bg-red-100 text-red-700 border border-red-200'
                                    : 'bg-gray-100 text-gray-700 border border-gray-200'
                                }`}>
                                  {apt.status}
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-gray-900 mb-1">
                                {new Date(apt.appointmentDate).toLocaleDateString('en-US', {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                              </p>
                              <p className="text-sm text-gray-600">
                                {new Date(`2000-01-01T${apt.appointmentTime}`).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true,
                                })}
                              </p>
                              {apt.doctor && (
                                <p className="text-sm text-gray-600 mt-1">
                                  Dr. {apt.doctor.firstName} {apt.doctor.lastName}
                                </p>
                              )}
                            </div>
                            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </Link>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Prescriptions Tab */}
            {activeTab === 'prescriptions' && (
              <div>
                {prescriptions.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">No prescriptions found</h3>
                    <p className="text-sm text-gray-600 mb-4">Create a prescription for this patient.</p>
                    <Link
                      href={`/prescriptions/new?patientId=${patientId}`}
                      className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md inline-block"
                    >
                      New Prescription
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {prescriptions
                      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
                      .map((prescription) => (
                        <Link
                          key={prescription._id}
                          href={`/prescriptions/${prescription._id}`}
                          className="block p-4 border border-gray-200 rounded-xl hover:shadow-md hover:border-purple-300 transition-all bg-gradient-to-r from-white to-gray-50"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-sm font-bold text-gray-900">{prescription.prescriptionCode}</span>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  prescription.status === 'active'
                                    ? 'bg-green-100 text-green-700 border border-green-200'
                                    : prescription.status === 'completed'
                                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                    : prescription.status === 'dispensed'
                                    ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                    : 'bg-gray-100 text-gray-700 border border-gray-200'
                                }`}>
                                  {prescription.status}
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-gray-900">
                                Issued: {new Date(prescription.issuedAt).toLocaleDateString()}
                              </p>
                              {prescription.medications && prescription.medications.length > 0 && (
                                <p className="text-sm text-gray-600 mt-1">
                                  {prescription.medications.length} medication(s)
                                </p>
                              )}
                            </div>
                            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </Link>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Invoices Tab */}
            {activeTab === 'invoices' && (
              <div>
                {invoices.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">No invoices found</h3>
                    <p className="text-sm text-gray-600 mb-4">Create an invoice for this patient.</p>
                    <Link
                      href={`/invoices/new?patientId=${patientId}`}
                      className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md inline-block"
                    >
                      Create Invoice
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {invoices
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((invoice) => (
                        <Link
                          key={invoice._id}
                          href={`/invoices/${invoice._id}`}
                          className="block p-4 border border-gray-200 rounded-xl hover:shadow-md hover:border-amber-300 transition-all bg-gradient-to-r from-white to-gray-50"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-sm font-bold text-gray-900">{invoice.invoiceNumber}</span>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  invoice.status === 'paid'
                                    ? 'bg-green-100 text-green-700 border border-green-200'
                                    : invoice.status === 'unpaid'
                                    ? 'bg-red-100 text-red-700 border border-red-200'
                                    : invoice.status === 'partial'
                                    ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                                    : 'bg-gray-100 text-gray-700 border border-gray-200'
                                }`}>
                                  {invoice.status}
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-gray-900">
                                Total: {formatCurrency(invoice.total)}
                              </p>
                              {invoice.outstandingBalance > 0 && invoice.status !== 'paid' && invoice.status !== 'refunded' && (
                                <p className="text-sm text-red-600 font-semibold mt-1">
                                  Outstanding: {formatCurrency(invoice.outstandingBalance)}
                                </p>
                              )}
                              <p className="text-xs text-gray-600 mt-1">
                                Created: {new Date(invoice.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </Link>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Lab Results Tab */}
            {activeTab === 'lab-results' && (
              <div>
                {labResults.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">No lab results found</h3>
                    <p className="text-sm text-gray-600 mb-4">Add lab results for this patient.</p>
                    <Link
                      href={`/lab-results/new?patientId=${patientId}`}
                      className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md inline-block"
                    >
                      Add Lab Result
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {labResults
                      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
                      .map((lab) => (
                        <Link
                          key={lab._id}
                          href={`/lab-results/${lab._id}`}
                          className="block p-4 border border-gray-200 rounded-xl hover:shadow-md hover:border-teal-300 transition-all bg-gradient-to-r from-white to-gray-50"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-sm font-bold text-gray-900">{lab.requestCode}</span>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  lab.status === 'completed'
                                    ? 'bg-green-100 text-green-700 border border-green-200'
                                    : lab.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                                    : 'bg-gray-100 text-gray-700 border border-gray-200'
                                }`}>
                                  {lab.status}
                                </span>
                              </div>
                              {lab.testName && (
                                <p className="text-sm font-semibold text-gray-900">{lab.testName}</p>
                              )}
                              <p className="text-xs text-gray-600 mt-1">
                                Ordered: {new Date(lab.orderDate).toLocaleDateString()}
                              </p>
                            </div>
                            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </Link>
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
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">No files uploaded</h3>
                      <p className="text-sm text-gray-600">Upload lab results, prescriptions, or other documents above.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {patient.attachments.map((file) => (
                        <div key={file._id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:shadow-md hover:border-blue-300 transition-all bg-gradient-to-r from-white to-gray-50">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md">
                              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{file.filename}</p>
                              <p className="text-xs text-gray-600 mt-1">
                                {file.size ? `${(file.size / 1024).toFixed(2)} KB` : 'Unknown size'} • 
                                Uploaded {new Date(file.uploadDate).toLocaleDateString()}
                              </p>
                              {file.notes && (
                                <p className="text-xs text-gray-600 mt-1">{file.notes}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {file.url && (
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-2 text-sm font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                              >
                                View
                              </a>
                            )}
                            <button
                              onClick={() => handleDeleteFileClick(file._id)}
                              className="px-3 py-2 text-sm font-semibold text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
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

          {/* Delete File Alert Dialog */}
          <AlertDialog 
          open={deleteFileDialogOpen} 
          onOpenChange={setDeleteFileDialogOpen}
          title="Delete File"
          description="Are you sure you want to delete this file? This action cannot be undone."
        >
          <button
            onClick={() => {
              setDeleteFileDialogOpen(false);
              setFileToDelete(null);
            }}
            className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteFile}
            className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold shadow-md"
          >
            Delete
          </button>
        </AlertDialog>
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
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-5 sm:p-6 bg-gradient-to-br from-gray-50 to-white">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-blue-500 rounded-lg">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900">Upload File</h3>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Select File (Lab Results, Prescriptions, Documents)
          </label>
          <input
            id="file-input"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Notes (Optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Lab results from 2024-01-15"
            className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
        >
          {uploading ? 'Uploading...' : 'Upload File'}
        </button>
      </form>
    </div>
  );
}

