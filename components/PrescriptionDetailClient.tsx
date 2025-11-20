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

  const handlePrint = () => {
    window.open(`/api/prescriptions/${prescriptionId}/print`, '_blank');
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Prescription not found</h2>
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="mb-4 sm:mb-0">
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
            <button
              onClick={handlePrint}
              className="inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
            {prescription.status !== 'dispensed' && (
              <button
                onClick={() => setShowDispenseForm(true)}
                className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700"
              >
                Record Dispense
              </button>
            )}
          </div>
        </div>

        {/* Patient Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Patient Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Medications</h3>
          <div className="space-y-4">
            {prescription.medications.map((medication, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-base font-semibold text-gray-900">
                    {index + 1}. {medication.name}
                    {medication.genericName && (
                      <span className="text-sm font-normal text-gray-500 ml-2">({medication.genericName})</span>
                    )}
                  </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 ml-4">
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

        {/* Dispensing Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Dispensing Status</h3>
          <div className="mb-4">
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
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
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDispenseForm(false)} />
              <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-md w-full z-10">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Record Dispense</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Pharmacy Name *</label>
                    <input
                      type="text"
                      required
                      value={dispenseForm.pharmacyName}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, pharmacyName: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Quantity Dispensed *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max={totalPrescribed - totalDispensed}
                      value={dispenseForm.quantityDispensed}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, quantityDispensed: parseInt(e.target.value) || 0 })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Notes</label>
                    <textarea
                      value={dispenseForm.notes}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, notes: e.target.value })}
                      rows={3}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={() => setShowDispenseForm(false)}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDispense}
                      className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
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

