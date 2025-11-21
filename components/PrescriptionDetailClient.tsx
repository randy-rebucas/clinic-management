'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
  const router = useRouter();

  useEffect(() => {
    fetchPrescription();
  }, [prescriptionId]);

  const fetchPrescription = async () => {
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setPrescription(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch prescription:', error);
    } finally {
      setLoading(false);
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
          alert('Dispense recorded successfully!');
        }
      }
    } catch (error) {
      console.error('Failed to record dispense:', error);
      alert('Failed to record dispense');
    }
  };

  const handlePrint = (copyType: 'patient' | 'clinic' = 'patient') => {
    window.open(`/api/prescriptions/${prescriptionId}/print?copy=${copyType}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading prescription...</p>
        </div>
      </div>
    );
  }

  if (!prescription) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-3">Prescription not found</h2>
          <Link href="/prescriptions" className="text-blue-600 hover:text-blue-700">
            Back to Prescriptions
          </Link>
        </div>
      </div>
    );
  }

  const totalPrescribed = prescription.medications.reduce(
    (sum, m) => sum + (m.quantity || 0),
    0
  );
  const totalDispensed = prescription.pharmacyDispenses?.reduce(
    (sum, d) => sum + (d.quantityDispensed || 0),
    0
  ) || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
          <div className="mb-2 sm:mb-0">
            <div className="flex items-center space-x-3 mb-2">
              <Link href="/prescriptions" className="text-gray-500 hover:text-gray-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Prescription {prescription.prescriptionCode}</h1>
            </div>
            <p className="text-gray-600 text-sm sm:text-base ml-9">
              {prescription.patient.firstName} {prescription.patient.lastName} • {new Date(prescription.issuedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex space-x-2">
              <button
                onClick={() => handlePrint('patient')}
                className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Patient Copy
              </button>
              <button
                onClick={() => handlePrint('clinic')}
                className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Clinic Copy
              </button>
            </div>
            {prescription.status !== 'dispensed' && (
              <button
                onClick={() => setShowDispenseForm(true)}
                className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors"
              >
                Record Dispense
              </button>
            )}
          </div>
        </div>

        {/* Patient Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-3">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Patient Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-sm font-medium text-gray-500">Name</p>
              <p className="text-sm text-gray-900">
                {prescription.patient.firstName} {prescription.patient.lastName}
              </p>
            </div>
            {prescription.patient.patientCode && (
              <div>
                <p className="text-sm font-medium text-gray-500">Patient ID</p>
                <p className="text-sm text-gray-900">{prescription.patient.patientCode}</p>
              </div>
            )}
            {prescription.patient.dateOfBirth && (
              <div>
                <p className="text-sm font-medium text-gray-500">Date of Birth</p>
                <p className="text-sm text-gray-900">
                  {new Date(prescription.patient.dateOfBirth).toLocaleDateString()}
                </p>
              </div>
            )}
            {prescription.patient.phone && (
              <div>
                <p className="text-sm font-medium text-gray-500">Phone</p>
                <p className="text-sm text-gray-900">{prescription.patient.phone}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-500">Date Issued</p>
              <p className="text-sm text-gray-900">{new Date(prescription.issuedAt).toLocaleDateString()}</p>
            </div>
            {prescription.prescribedBy && (
              <div>
                <p className="text-sm font-medium text-gray-500">Prescribed By</p>
                <p className="text-sm text-gray-900">{prescription.prescribedBy.name}</p>
              </div>
            )}
          </div>
        </div>

        {/* Medications */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-3">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Medications</h3>
          <div className="space-y-3">
            {prescription.medications.map((medication, index) => (
              <div key={index} className="border border-gray-200 rounded-md p-2.5">
                <div className="flex items-start justify-between mb-1.5">
                  <h4 className="text-sm font-semibold text-gray-900">
                    {index + 1}. {medication.name}
                    {medication.genericName && (
                      <span className="text-sm font-normal text-gray-500 ml-2">({medication.genericName})</span>
                    )}
                  </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs text-gray-600 ml-3">
                  {medication.strength && (
                    <div><strong>Strength:</strong> {medication.strength}</div>
                  )}
                  {medication.dose && (
                    <div><strong>Dose:</strong> {medication.dose}</div>
                  )}
                  {medication.frequency && (
                    <div><strong>Frequency:</strong> {medication.frequency}</div>
                  )}
                  {medication.durationDays && (
                    <div><strong>Duration:</strong> {medication.durationDays} day(s)</div>
                  )}
                  {medication.quantity && (
                    <div><strong>Quantity:</strong> {medication.quantity}</div>
                  )}
                  {medication.form && (
                    <div><strong>Form:</strong> {medication.form}</div>
                  )}
                  {medication.route && (
                    <div><strong>Route:</strong> {medication.route}</div>
                  )}
                </div>
                {medication.instructions && (
                  <div className="mt-2 ml-4 text-sm text-gray-700">
                    <strong>Instructions:</strong> {medication.instructions}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Drug Interactions */}
        {prescription.drugInteractions && prescription.drugInteractions.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-3">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Drug Interactions</h3>
            <div className="space-y-3">
              {prescription.drugInteractions.map((interaction, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border-2 ${
                    interaction.severity === 'contraindicated' || interaction.severity === 'severe'
                      ? 'border-red-500 bg-red-50'
                      : interaction.severity === 'moderate'
                      ? 'border-yellow-500 bg-yellow-50'
                      : 'border-blue-500 bg-blue-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold">
                      {interaction.medication1} + {interaction.medication2}
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        interaction.severity === 'contraindicated'
                          ? 'bg-red-600 text-white'
                          : interaction.severity === 'severe'
                          ? 'bg-red-500 text-white'
                          : interaction.severity === 'moderate'
                          ? 'bg-yellow-500 text-white'
                          : 'bg-blue-500 text-white'
                      }`}
                    >
                      {interaction.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-1">{interaction.description}</p>
                  {interaction.recommendation && (
                    <p className="text-sm text-gray-600 italic">{interaction.recommendation}</p>
                  )}
                  {interaction.checkedAt && (
                    <p className="text-xs text-gray-500 mt-2">
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-3">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Archive Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {prescription.copies.patientCopy && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Patient Copy</h4>
                  {prescription.copies.patientCopy.printedAt && (
                    <p className="text-sm text-gray-600">
                      Printed: {new Date(prescription.copies.patientCopy.printedAt).toLocaleString()}
                    </p>
                  )}
                  {prescription.copies.patientCopy.digitalCopySent && (
                    <p className="text-sm text-gray-600">
                      Digital copy sent: {prescription.copies.patientCopy.sentAt
                        ? new Date(prescription.copies.patientCopy.sentAt).toLocaleString()
                        : 'Yes'}
                    </p>
                  )}
                </div>
              )}
              {prescription.copies.clinicCopy && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Clinic Copy</h4>
                  {prescription.copies.clinicCopy.archivedAt && (
                    <p className="text-sm text-gray-600">
                      Archived: {new Date(prescription.copies.clinicCopy.archivedAt).toLocaleString()}
                    </p>
                  )}
                  {prescription.copies.clinicCopy.location && (
                    <p className="text-sm text-gray-600">
                      Location: {prescription.copies.clinicCopy.location}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dispensing Status */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-3">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Dispensing Status</h3>
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Prescribed</span>
              <span className="text-sm font-medium text-gray-900">{totalPrescribed}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Dispensed</span>
              <span className="text-sm font-medium text-gray-900">{totalDispensed}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full"
                style={{ width: `${totalPrescribed > 0 ? (totalDispensed / totalPrescribed) * 100 : 0}%` }}
              ></div>
            </div>
          </div>
          {prescription.pharmacyDispenses && prescription.pharmacyDispenses.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Dispense History</h4>
              {prescription.pharmacyDispenses.map((dispense, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {dispense.pharmacyName || 'Pharmacy'}
                      </p>
                      {dispense.dispensedAt && (
                        <p className="text-xs text-gray-500">
                          {new Date(dispense.dispensedAt).toLocaleDateString()}
                        </p>
                      )}
                      {dispense.quantityDispensed && (
                        <p className="text-xs text-gray-600 mt-1">
                          Quantity: {dispense.quantityDispensed}
                        </p>
                      )}
                    </div>
                    {dispense.trackingNumber && (
                      <span className="text-xs text-gray-500">#{dispense.trackingNumber}</span>
                    )}
                  </div>
                  {dispense.notes && (
                    <p className="text-xs text-gray-600 mt-2">{dispense.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Digital Signature */}
        {prescription.digitalSignature && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-3">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Digital Signature</h3>
            <div className="flex items-center space-x-4">
              <div className="border-2 border-gray-200 rounded-lg p-2 bg-white">
                <img
                  src={prescription.digitalSignature.signatureData}
                  alt="Signature"
                  className="h-20"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {prescription.digitalSignature.providerName}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(prescription.digitalSignature.signedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Dispense Form Modal */}
        {showDispenseForm && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="fixed inset-0 bg-black/30 backdrop-blur-md" onClick={() => setShowDispenseForm(false)} />
              <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-md w-full z-10">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Record Dispense</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Pharmacy Name *</label>
                    <input
                      type="text"
                      required
                      value={dispenseForm.pharmacyName}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, pharmacyName: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Quantity Dispensed *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max={totalPrescribed - totalDispensed}
                      value={dispenseForm.quantityDispensed}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, quantityDispensed: parseInt(e.target.value) || 0 })}
                      className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Remaining: {totalPrescribed - totalDispensed}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Tracking Number</label>
                    <input
                      type="text"
                      value={dispenseForm.trackingNumber}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, trackingNumber: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Notes</label>
                    <textarea
                      value={dispenseForm.notes}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, notes: e.target.value })}
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={() => setShowDispenseForm(false)}
                      className="px-3 py-1.5 border border-gray-200 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDispense}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-medium hover:bg-green-700 transition-colors"
                    >
                      Record Dispense
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

