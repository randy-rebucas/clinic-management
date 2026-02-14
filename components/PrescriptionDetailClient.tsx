'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Modal } from './ui/Modal';

interface Prescription {
  _id: string;
  prescriptionCode: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
  };
  prescribedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  visit?: {
    _id: string;
    visitCode: string;
    date: string;
    followUpDate?: string;
  };
  medications: Array<{
    name: string;
    genericName?: string;
    form?: string;
    strength?: string;
    dose?: string;
    route?: string;
    frequency?: string;
    durationDays?: number;
    quantity?: number;
    instructions?: string;
  }>;
  status: string;
  issuedAt: string;
  notes?: string;
  pharmacyDispenses?: Array<{
    pharmacyName?: string;
    pharmacyId?: string;
    dispensedAt?: string;
    dispensedBy?: string;
    quantityDispensed?: number;
    notes?: string;
    trackingNumber?: string;
  }>;
  digitalSignature?: {
    providerName: string;
    signatureData: string;
    signedAt: string;
  };
  drugInteractions?: Array<{
    medication1: string;
    medication2: string;
    severity: 'mild' | 'moderate' | 'severe' | 'contraindicated';
    description: string;
    recommendation?: string;
    checkedAt: string;
  }>;
  copies?: {
    patientCopy?: {
      printedAt?: string;
      printedBy?: string;
      digitalCopySent?: boolean;
      sentAt?: string;
    };
    clinicCopy?: {
      archivedAt?: string;
      archivedBy?: string;
      location?: string;
    };
  };
}

export default function PrescriptionDetailClient({ prescriptionId }: { prescriptionId: string }) {
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDispenseForm, setShowDispenseForm] = useState(false);
  const [dispenseForm, setDispenseForm] = useState({
    pharmacyId: '',
    pharmacyName: '',
    quantityDispensed: 0,
    notes: '',
    trackingNumber: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchPrescription();
  }, [prescriptionId]);

  const fetchPrescription = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/prescriptions/${prescriptionId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success && data.data) {
        setPrescription(data.data);
      } else {
        setError(data.error || 'Failed to load prescription');
      }
    } catch (error) {
      console.error('Failed to fetch prescription:', error);
      setError('Failed to load prescription. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message: string, type: 'error' | 'success') => {
    if (type === 'error') {
      setError(message);
      setTimeout(() => setError(null), 5000);
    } else {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleDispense = async () => {
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}/dispense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dispenseForm),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPrescription(data.data);
          setShowDispenseForm(false);
          setDispenseForm({
            pharmacyId: '',
            pharmacyName: '',
            quantityDispensed: 0,
            notes: '',
            trackingNumber: '',
          });
          showNotification('Dispense recorded successfully!', 'success');
        } else {
          showNotification('Error: ' + data.error, 'error');
        }
      } else {
        showNotification('Failed to record dispense', 'error');
      }
    } catch (error) {
      console.error('Failed to record dispense:', error);
      showNotification('Failed to record dispense', 'error');
    }
  };

  const handlePrint = (copyType: 'patient' | 'clinic' = 'patient') => {
    window.open(`/api/prescriptions/${prescriptionId}/print?copy=${copyType}`, '_blank');
  };

  const getInteractionColor = (severity: string): 'red' | 'yellow' | 'blue' => {
    switch (severity) {
      case 'contraindicated':
      case 'severe':
        return 'red';
      case 'moderate':
        return 'yellow';
      default:
        return 'blue';
    }
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-100 border-t-blue-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading prescription...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!prescription) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{error || 'Prescription not found'}</h2>
            <p className="text-sm text-gray-600 mb-4">The prescription you&apos;re looking for doesn&apos;t exist or has been removed.</p>
            <Link 
              href="/prescriptions"
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-lg hover:from-indigo-600 hover:to-indigo-700 transition-all text-sm font-semibold shadow-md"
            >
              Back to Prescriptions
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const totalPrescribed = (prescription.medications || []).reduce(
    (sum, m) => sum + (m.quantity || 0),
    0
  );
  const totalDispensed = (prescription.pharmacyDispenses || []).reduce(
    (sum, d) => sum + (d.quantityDispensed || 0),
    0
  );

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Notifications */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 mb-1">Error</h3>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-green-800 mb-1">Success</h3>
                  <p className="text-sm text-green-700">{success}</p>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push('/prescriptions')}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-md">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Prescription {prescription.prescriptionCode}</h1>
                    <div className="flex items-center gap-2 mt-1">
                      {prescription.patient && (
                        <>
                          <Link href={`/patients/${prescription.patient._id}`}>
                            <p className="text-sm sm:text-base font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors">
                              {prescription.patient.firstName} {prescription.patient.lastName}
                            </p>
                          </Link>
                          <p className="text-sm text-gray-500">•</p>
                        </>
                      )}
                      {prescription.issuedAt && (
                        <p className="text-sm sm:text-base text-gray-600">
                          {new Date(prescription.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button 
                  onClick={() => handlePrint('patient')}
                  className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold flex items-center gap-2 shadow-md"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Patient Copy
                </button>
                <button 
                  onClick={() => handlePrint('clinic')}
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold flex items-center gap-2 border border-gray-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Clinic Copy
                </button>
                {prescription.status !== 'dispensed' && (
                  <button 
                    onClick={() => setShowDispenseForm(true)}
                    className="px-4 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all text-sm font-semibold shadow-md"
                  >
                    Record Dispense
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {/* Patient Info */}
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Patient Information</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {prescription.patient && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Name</p>
                    <Link href={`/patients/${prescription.patient._id}`}>
                      <p className="text-sm font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors">
                        {prescription.patient.firstName} {prescription.patient.lastName}
                      </p>
                    </Link>
                  </div>
                )}
                {prescription.patient?.patientCode && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Patient ID</p>
                    <p className="text-sm font-medium text-gray-900">{prescription.patient.patientCode}</p>
                  </div>
                )}
                {prescription.patient?.dateOfBirth && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Date of Birth</p>
                    <p className="text-sm font-medium text-gray-900">{new Date(prescription.patient.dateOfBirth).toLocaleDateString()}</p>
                  </div>
                )}
                {prescription.patient?.phone && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Phone</p>
                    <p className="text-sm font-medium text-gray-900">{prescription.patient.phone}</p>
                  </div>
                )}
                {prescription.issuedAt && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Date Issued</p>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(prescription.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                )}
                {/* Follow-up Date */}
                {prescription.visit?.followUpDate && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Follow-up Date</p>
                    <p className="text-sm font-medium text-gray-900">{new Date(prescription.visit.followUpDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                )}
                {prescription.prescribedBy && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Prescribed By</p>
                    <p className="text-sm font-medium text-gray-900">{prescription.prescribedBy.name}</p>
                  </div>
                )}
                {prescription.visit && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Visit</p>
                    <Link 
                      href={`/visits/${prescription.visit._id}`}
                      className="text-sm font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
                    >
                      {prescription.visit.visitCode}
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Medications */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Medications</h3>
              </div>
              <div className="flex flex-col gap-3">
                {(prescription.medications || []).map((medication, index) => (
                  <div key={index} className="bg-gradient-to-r from-white to-emerald-50/50 border border-emerald-200 rounded-lg p-4 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-sm font-bold text-gray-900">
                        {index + 1}. {medication.name}
                        {medication.genericName && (
                          <span className="text-xs text-gray-600 ml-2 font-normal">
                            ({medication.genericName})
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      {medication.strength && (
                        <div className="bg-white/50 p-2 rounded border border-gray-200">
                          <span className="text-xs font-semibold text-gray-600">Strength:</span>
                          <p className="text-xs font-medium text-gray-900 mt-0.5">{medication.strength}</p>
                        </div>
                      )}
                      {medication.dose && (
                        <div className="bg-white/50 p-2 rounded border border-gray-200">
                          <span className="text-xs font-semibold text-gray-600">Dose:</span>
                          <p className="text-xs font-medium text-gray-900 mt-0.5">{medication.dose}</p>
                        </div>
                      )}
                      {medication.frequency && (
                        <div className="bg-white/50 p-2 rounded border border-gray-200">
                          <span className="text-xs font-semibold text-gray-600">Frequency:</span>
                          <p className="text-xs font-medium text-gray-900 mt-0.5">{medication.frequency}</p>
                        </div>
                      )}
                      {medication.durationDays && (
                        <div className="bg-white/50 p-2 rounded border border-gray-200">
                          <span className="text-xs font-semibold text-gray-600">Duration:</span>
                          <p className="text-xs font-medium text-gray-900 mt-0.5">{medication.durationDays} day(s)</p>
                        </div>
                      )}
                      {medication.quantity && (
                        <div className="bg-white/50 p-2 rounded border border-gray-200">
                          <span className="text-xs font-semibold text-gray-600">Quantity:</span>
                          <p className="text-xs font-medium text-gray-900 mt-0.5">{medication.quantity}</p>
                        </div>
                      )}
                      {medication.form && (
                        <div className="bg-white/50 p-2 rounded border border-gray-200">
                          <span className="text-xs font-semibold text-gray-600">Form:</span>
                          <p className="text-xs font-medium text-gray-900 mt-0.5">{medication.form}</p>
                        </div>
                      )}
                      {medication.route && (
                        <div className="bg-white/50 p-2 rounded border border-gray-200">
                          <span className="text-xs font-semibold text-gray-600">Route:</span>
                          <p className="text-xs font-medium text-gray-900 mt-0.5">{medication.route}</p>
                        </div>
                      )}
                    </div>
                    {medication.instructions && (
                      <div className="mt-3 pt-3 border-t border-emerald-200 bg-white/50 p-3 rounded border border-gray-200">
                        <p className="text-xs font-semibold text-gray-700 mb-1.5">Instructions:</p>
                        <p className="text-xs text-gray-700">{medication.instructions}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Drug Interactions */}
            {prescription.drugInteractions && prescription.drugInteractions.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Drug Interactions</h3>
                </div>
                <div className="flex flex-col gap-3">
                  {prescription.drugInteractions.map((interaction, idx) => (
                    <div 
                      key={idx} 
                      className={`rounded-lg p-4 border-2 ${
                        getInteractionColor(interaction.severity) === 'red' ? 'bg-red-50 border-red-300' :
                        getInteractionColor(interaction.severity) === 'yellow' ? 'bg-yellow-50 border-yellow-300' :
                        'bg-blue-50 border-blue-300'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <p className="text-sm font-bold text-gray-900">
                          {interaction.medication1} + {interaction.medication2}
                        </p>
                        <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full border ${
                          getInteractionColor(interaction.severity) === 'red' ? 'bg-red-600 text-white border-red-700' :
                          getInteractionColor(interaction.severity) === 'yellow' ? 'bg-yellow-600 text-white border-yellow-700' :
                          'bg-blue-600 text-white border-blue-700'
                        }`}>
                          {interaction.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 mb-2">{interaction.description}</p>
                      {interaction.recommendation && (
                        <p className="text-xs italic text-gray-600 bg-white/50 p-2 rounded border border-gray-200">{interaction.recommendation}</p>
                      )}
                      {interaction.checkedAt && (
                        <p className="text-xs text-gray-600 font-medium mt-2">
                          Checked: {new Date(interaction.checkedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Archive Status */}
            {prescription.copies && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-amber-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Archive Status</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {prescription.copies.patientCopy && (
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-lg p-4">
                      <h4 className="text-sm font-bold text-gray-900 mb-3">Patient Copy</h4>
                      {prescription.copies.patientCopy.printedAt && (
                        <p className="text-xs text-gray-700 mb-2">
                          <span className="font-semibold">Printed:</span> {new Date(prescription.copies.patientCopy.printedAt).toLocaleString()}
                        </p>
                      )}
                      {prescription.copies.patientCopy.digitalCopySent && (
                        <p className="text-xs text-gray-700">
                          <span className="font-semibold">Digital copy sent:</span> {prescription.copies.patientCopy.sentAt
                            ? new Date(prescription.copies.patientCopy.sentAt).toLocaleString()
                            : 'Yes'}
                        </p>
                      )}
                    </div>
                  )}
                  {prescription.copies.clinicCopy && (
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-lg p-4">
                      <h4 className="text-sm font-bold text-gray-900 mb-3">Clinic Copy</h4>
                      {prescription.copies.clinicCopy.archivedAt && (
                        <p className="text-xs text-gray-700 mb-2">
                          <span className="font-semibold">Archived:</span> {new Date(prescription.copies.clinicCopy.archivedAt).toLocaleString()}
                        </p>
                      )}
                      {prescription.copies.clinicCopy.location && (
                        <p className="text-xs text-gray-700">
                          <span className="font-semibold">Location:</span> {prescription.copies.clinicCopy.location}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dispensing Status */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Dispensing Status</h3>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Prescribed</p>
                  <p className="text-sm font-bold text-gray-900">{totalPrescribed}</p>
                </div>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Dispensed</p>
                  <p className="text-sm font-bold text-gray-900">{totalDispensed}</p>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden border border-gray-300">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-300 shadow-sm"
                    style={{ width: `${totalPrescribed > 0 ? (totalDispensed / totalPrescribed) * 100 : 0}%` }}
                  />
                </div>
              </div>
              {(prescription.pharmacyDispenses || []).length > 0 && (
                <div className="flex flex-col gap-3">
                  <h4 className="text-sm font-bold text-gray-900 mb-1">Dispense History</h4>
                  {(prescription.pharmacyDispenses || []).map((dispense, index) => (
                    <div key={index} className="bg-gradient-to-r from-white to-purple-50/50 border border-purple-200 rounded-lg p-4 hover:shadow-md transition-all">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-900 mb-1">
                            {dispense.pharmacyName || 'Pharmacy'}
                          </p>
                          {dispense.dispensedAt && (
                            <p className="text-xs text-gray-600 font-medium">
                              {new Date(dispense.dispensedAt).toLocaleDateString()}
                            </p>
                          )}
                          {dispense.quantityDispensed && (
                            <p className="text-xs text-gray-600 font-medium mt-1">
                              Quantity: {dispense.quantityDispensed}
                            </p>
                          )}
                        </div>
                        {dispense.trackingNumber && (
                          <p className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-1 rounded border border-purple-200">#{dispense.trackingNumber}</p>
                        )}
                      </div>
                      {dispense.notes && (
                        <p className="text-xs text-gray-700 mt-3 bg-white/50 p-2 rounded border border-gray-200">{dispense.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            {prescription.notes && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-gray-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Notes</h3>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-200">{prescription.notes}</p>
              </div>
            )}

            {/* Digital Signature */}
            {prescription.digitalSignature && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-green-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Digital Signature</h3>
                </div>
                <div className="flex items-center gap-4 bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="border-2 border-green-300 rounded-lg p-2 bg-white shadow-sm">
                    <img
                      src={prescription.digitalSignature.signatureData}
                      alt="Signature"
                      className="h-20 block"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 mb-1">
                      {prescription.digitalSignature.providerName}
                    </p>
                    <p className="text-xs text-gray-600 font-medium">
                      {new Date(prescription.digitalSignature.signedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dispense Form Modal */}
          <Modal 
            open={showDispenseForm} 
            onOpenChange={(open) => {
              if (!open) {
                setShowDispenseForm(false);
              }
            }}
            className="max-w-md"
          >
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Record Dispense</h2>
              </div>
              <div className="py-4">
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Pharmacy Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={dispenseForm.pharmacyName}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, pharmacyName: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Quantity Dispensed <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      max={totalPrescribed - totalDispensed}
                      value={dispenseForm.quantityDispensed}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, quantityDispensed: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm transition-all"
                    />
                    <p className="text-xs text-gray-600 font-medium mt-1.5">
                      Remaining: {totalPrescribed - totalDispensed}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Tracking Number</label>
                    <input
                      type="text"
                      value={dispenseForm.trackingNumber}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, trackingNumber: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                    <textarea
                      value={dispenseForm.notes}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, notes: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm resize-y transition-all"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => setShowDispenseForm(false)}
                      className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold border border-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDispense}
                      className="px-4 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all text-sm font-semibold shadow-md"
                    >
                      Record Dispense
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Modal>
        </div>
      </div>
    </section>
  );
}
