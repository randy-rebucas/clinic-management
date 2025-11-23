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
  const currency = useSetting('billingSettings.currency', 'USD');

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

  if (!patient) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-4" style={{ minHeight: '50vh' }}>
            <h2 className="text-2xl font-semibold">Patient not found</h2>
            <Link 
              href="/patients"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const calculateAge = (dateOfBirth: string) => {
    const age = Math.floor((new Date().getTime() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return age;
  };

  const totalOutstanding = invoices.reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.totalPaid || 0), 0);

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <Link 
                href="/patients"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-1">
                  {fullName}
                </h1>
                <div className="flex items-center gap-2 flex-wrap">
                  {patient.patientCode && (
                    <p className="text-sm text-gray-500">ID: {patient.patientCode}</p>
                  )}
                  {patient.patientCode && <p className="text-sm text-gray-500">•</p>}
                  <p className="text-sm text-gray-500">{calculateAge(patient.dateOfBirth)} years old</p>
                  {patient.sex && patient.sex !== 'unknown' && (
                    <>
                      <p className="text-sm text-gray-500">•</p>
                      <p className="text-sm text-gray-500 capitalize">{patient.sex}</p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowQR(!showQR)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  QR Code
                </button>
                <Link 
                  href={`/patients?edit=${patient._id}`}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </Link>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex gap-2 flex-wrap mb-3">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                <div className="p-2">
                  <p className="text-xs text-gray-500 mb-1">Visits</p>
                  <p className="text-2xl font-bold">{visits.length}</p>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                <div className="p-2">
                  <p className="text-xs text-gray-500 mb-1">Appointments</p>
                  <p className="text-2xl font-bold">{appointments.length}</p>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                <div className="p-2">
                  <p className="text-xs text-gray-500 mb-1">Prescriptions</p>
                  <p className="text-2xl font-bold">{prescriptions.length}</p>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                <div className="p-2">
                  <p className="text-xs text-gray-500 mb-1">Invoices</p>
                  <p className="text-2xl font-bold">{invoices.length}</p>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                <div className="p-2">
                  <p className="text-xs text-gray-500 mb-1">Lab Results</p>
                  <p className="text-2xl font-bold">{labResults.length}</p>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                <div className="p-2">
                  <p className="text-xs text-gray-500 mb-1">Outstanding</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(totalOutstanding)}</p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-3">
              <div className="p-3">
                <h3 className="text-lg font-semibold mb-2">Quick Actions</h3>
                <div className="flex gap-2 flex-wrap">
                  <Link 
                    href={`/appointments/new?patientId=${patientId}`}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-1 flex-1 min-w-[150px]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Schedule
                  </Link>
                  <Link 
                    href={`/visits/new?patientId=${patientId}`}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-1 flex-1 min-w-[150px]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    New Visit
                  </Link>
                  <Link 
                    href={`/prescriptions/new?patientId=${patientId}`}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-1 flex-1 min-w-[150px]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    Prescription
                  </Link>
                  <Link 
                    href={`/invoices/new?patientId=${patientId}`}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-1 flex-1 min-w-[150px]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Invoice
                  </Link>
                  <Link 
                    href={`/lab-results/new?patientId=${patientId}`}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-1 flex-1 min-w-[150px]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Lab Result
                  </Link>
                  <button 
                    onClick={() => setShowQR(!showQR)}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-1 flex-1 min-w-[150px]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    QR Code
                  </button>
                </div>
              </div>
            </div>

          {/* QR Code Modal */}
          <Modal open={showQR} onOpenChange={setShowQR} className="max-w-md">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">Patient QR Code</h2>
              <div className="flex flex-col items-center gap-3 mt-4">
                <div className="p-4 bg-white border-2 border-gray-300 rounded-lg">
                  <QRCode value={qrValue} size={256} />
                </div>
                <p className="text-sm text-gray-600 text-center">
                  Patient ID: <span className="font-bold">{qrValue}</span>
                </p>
                <p className="text-xs text-gray-600 text-center">
                  Scan this code to quickly access patient information
                </p>
              </div>
            </div>
          </Modal>

          {/* Patient Alerts */}
          {alerts.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg p-3 ${
                    alert.severity === 'high' ? 'bg-red-50 border border-red-200 text-red-800' :
                    alert.severity === 'medium' ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' :
                    'bg-blue-50 border border-blue-200 text-blue-800'
                  }`}
                >
                  <p className="text-sm">{alert.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-3">
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="flex -mb-px min-w-max">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('visits')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'visits'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Visits ({visits.length})
              </button>
              <button
                onClick={() => setActiveTab('appointments')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'appointments'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Appointments ({appointments.length})
              </button>
              <button
                onClick={() => setActiveTab('prescriptions')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'prescriptions'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Prescriptions ({prescriptions.length})
              </button>
              <button
                onClick={() => setActiveTab('invoices')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'invoices'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Invoices ({invoices.length})
              </button>
              <button
                onClick={() => setActiveTab('lab-results')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'lab-results'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Lab Results ({labResults.length})
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'files'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Files ({patient.attachments?.length || 0})
              </button>
            </nav>
          </div>

          <div className="p-3">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Basic Information */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Basic Information</h3>
                    <dl className="space-y-2">
                      <div>
                      <dt className="text-xs font-medium text-gray-500">Full Name</dt>
                      <dd className="text-sm text-gray-900">{fullName}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500">Date of Birth</dt>
                      <dd className="text-sm text-gray-900">
                        {new Date(patient.dateOfBirth).toLocaleDateString()}
                      </dd>
                    </div>
                      {patient.sex && (
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Sex</dt>
                          <dd className="text-sm text-gray-900 capitalize">{patient.sex}</dd>
                        </div>
                      )}
                      {patient.civilStatus && (
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Civil Status</dt>
                          <dd className="text-sm text-gray-900">{patient.civilStatus}</dd>
                        </div>
                      )}
                      {patient.nationality && (
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Nationality</dt>
                          <dd className="text-sm text-gray-900">{patient.nationality}</dd>
                        </div>
                      )}
                      {patient.occupation && (
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Occupation</dt>
                          <dd className="text-sm text-gray-900">{patient.occupation}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {/* Contact Information */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Contact Information</h3>
                    <dl className="space-y-2">
                      <div>
                        <dt className="text-xs font-medium text-gray-500">Email</dt>
                        <dd className="text-sm text-gray-900">{patient.email}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-gray-500">Phone</dt>
                        <dd className="text-sm text-gray-900">{patient.phone}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-gray-500">Address</dt>
                        <dd className="text-sm text-gray-900">
                          {patient.address.street}, {patient.address.city}, {patient.address.state} {patient.address.zipCode}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Emergency Contact</h3>
                  <dl className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <dt className="text-xs font-medium text-gray-500">Name</dt>
                      <dd className="text-sm text-gray-900">{patient.emergencyContact.name}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500">Phone</dt>
                      <dd className="text-sm text-gray-900">{patient.emergencyContact.phone}</dd>
                    </div>
                    {patient.emergencyContact.relationship && (
                      <div>
                        <dt className="text-xs font-medium text-gray-500">Relationship</dt>
                        <dd className="text-sm text-gray-900">{patient.emergencyContact.relationship}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Identifiers */}
                {(patient.identifiers?.philHealth || patient.identifiers?.govId) && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Identifiers</h3>
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {patient.identifiers.philHealth && (
                        <div>
                          <dt className="text-xs font-medium text-gray-500">PhilHealth ID</dt>
                          <dd className="text-sm text-gray-900">{patient.identifiers.philHealth}</dd>
                        </div>
                      )}
                      {patient.identifiers.govId && (
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Government ID</dt>
                          <dd className="text-sm text-gray-900">{patient.identifiers.govId}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}

                {/* Medical Information */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Medical Information</h3>
                  <div className="space-y-3">
                    <div>
                      <dt className="text-xs font-medium text-gray-500 mb-1">Medical History</dt>
                      <dd className="text-sm text-gray-900 whitespace-pre-wrap">
                        {patient.medicalHistory || 'No medical history recorded'}
                      </dd>
                    </div>
                    {patient.preExistingConditions && patient.preExistingConditions.length > 0 && (
                      <div>
                        <dt className="text-xs font-medium text-gray-500 mb-1">Pre-existing Conditions</dt>
                        <dd className="text-sm text-gray-900">
                          <ul className="list-disc list-inside space-y-1">
                            {patient.preExistingConditions.map((condition, idx) => (
                              <li key={idx}>
                                <span className="font-medium">{condition.condition}</span>
                                {condition.status && (
                                  <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                                    condition.status === 'active' ? 'bg-red-100 text-red-800' :
                                    condition.status === 'chronic' ? 'bg-orange-100 text-orange-800' :
                                    'bg-green-100 text-green-800'
                                  }`}>
                                    {condition.status}
                                  </span>
                                )}
                                {condition.diagnosisDate && (
                                  <span className="text-gray-500 ml-2">
                                    (Diagnosed: {new Date(condition.diagnosisDate).toLocaleDateString()})
                                  </span>
                                )}
                                {condition.notes && (
                                  <div className="text-gray-600 text-xs ml-4 mt-1">{condition.notes}</div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-xs font-medium text-gray-500 mb-1">Allergies</dt>
                      <dd className="text-sm text-gray-900">{formatAllergies()}</dd>
                    </div>
                    {patient.familyHistory && Object.keys(patient.familyHistory).length > 0 && (
                      <div>
                        <dt className="text-xs font-medium text-gray-500 mb-1">Family History</dt>
                        <dd className="text-sm text-gray-900">
                          <ul className="list-disc list-inside space-y-1">
                            {Object.entries(patient.familyHistory).map(([condition, relation]) => (
                              <li key={condition}>
                                <span className="font-medium">{condition}</span>
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
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No medical records found</h3>
                    <p className="text-gray-600">Medical records will appear here once visits are created.</p>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Timeline View */}
                    <div className="relative pl-8 border-l-2 border-gray-200">
                      {visits
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((visit, index) => (
                          <div key={visit._id} className="relative mb-8">
                            {/* Timeline dot */}
                            <div className="absolute -left-[21px] top-0 w-4 h-4 bg-blue-600 rounded-full border-4 border-white shadow-sm"></div>
                            
                            {/* Timeline content */}
                            <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
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
                                  <p className="text-sm font-medium text-gray-700 mb-2">
                                    {new Date(visit.date).toLocaleDateString('en-US', {
                                      weekday: 'long',
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                    })}
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
                                  className="ml-4 text-blue-600 hover:text-blue-700 text-sm font-medium whitespace-nowrap"
                                >
                                  View Details →
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
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No appointments found</h3>
                    <p className="text-gray-600 mb-4">Schedule an appointment for this patient.</p>
                    <Link
                      href={`/appointments/new?patientId=${patientId}`}
                      className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700"
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
                          className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:shadow-sm transition-all"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm font-semibold text-gray-900">{apt.appointmentCode}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  apt.status === 'scheduled' || apt.status === 'confirmed'
                                    ? 'bg-green-100 text-green-800'
                                    : apt.status === 'completed'
                                    ? 'bg-blue-100 text-blue-800'
                                    : apt.status === 'cancelled'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {apt.status}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700">
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
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No prescriptions found</h3>
                    <p className="text-gray-600 mb-4">Create a prescription for this patient.</p>
                    <Link
                      href={`/prescriptions/new?patientId=${patientId}`}
                      className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700"
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
                          className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:shadow-sm transition-all"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm font-semibold text-gray-900">{prescription.prescriptionCode}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  prescription.status === 'active'
                                    ? 'bg-green-100 text-green-800'
                                    : prescription.status === 'completed'
                                    ? 'bg-blue-100 text-blue-800'
                                    : prescription.status === 'dispensed'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {prescription.status}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700">
                                Issued: {new Date(prescription.issuedAt).toLocaleDateString()}
                              </p>
                              {prescription.medications && prescription.medications.length > 0 && (
                                <p className="text-sm text-gray-600 mt-1">
                                  {prescription.medications.length} medication(s)
                                </p>
                              )}
                            </div>
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No invoices found</h3>
                    <p className="text-gray-600 mb-4">Create an invoice for this patient.</p>
                    <Link
                      href={`/invoices/new?patientId=${patientId}`}
                      className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700"
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
                          className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:shadow-sm transition-all"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm font-semibold text-gray-900">{invoice.invoiceNumber}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  invoice.status === 'paid'
                                    ? 'bg-green-100 text-green-800'
                                    : invoice.status === 'unpaid'
                                    ? 'bg-red-100 text-red-800'
                                    : invoice.status === 'partial'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {invoice.status}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700">
                                Total: {formatCurrency(invoice.total)}
                              </p>
                              {invoice.outstandingBalance > 0 && (
                                <p className="text-sm text-red-600 font-medium mt-1">
                                  Outstanding: {formatCurrency(invoice.outstandingBalance)}
                                </p>
                              )}
                              <p className="text-xs text-gray-500 mt-1">
                                Created: {new Date(invoice.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No lab results found</h3>
                    <p className="text-gray-600 mb-4">Add lab results for this patient.</p>
                    <Link
                      href={`/lab-results/new?patientId=${patientId}`}
                      className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700"
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
                          className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:shadow-sm transition-all"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm font-semibold text-gray-900">{lab.requestCode}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  lab.status === 'completed'
                                    ? 'bg-green-100 text-green-800'
                                    : lab.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {lab.status}
                                </span>
                              </div>
                              {lab.testName && (
                                <p className="text-sm text-gray-700">{lab.testName}</p>
                              )}
                              <p className="text-xs text-gray-500 mt-1">
                                Ordered: {new Date(lab.orderDate).toLocaleDateString()}
                              </p>
                            </div>
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                              onClick={() => handleDeleteFileClick(file._id)}
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
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteFile}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              Delete
            </button>
          </AlertDialog>
          </div>
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

