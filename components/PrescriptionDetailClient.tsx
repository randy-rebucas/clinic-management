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
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3 min-h-[256px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-500">Loading prescription...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!prescription) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3 min-h-[256px]">
            <h2 className="text-xl font-semibold">{error || 'Prescription not found'}</h2>
            <Link 
              href="/prescriptions"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
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
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Notifications */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">{success}</p>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => router.push('/prescriptions')}
                  className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h1 className="text-3xl font-bold">Prescription {prescription.prescriptionCode}</h1>
              </div>
              <div className="flex items-center gap-2 ml-9">
                {prescription.patient && (
                  <>
                    <Link href={`/patients/${prescription.patient._id}`}>
                      <p className="text-sm text-blue-700 hover:underline">
                        {prescription.patient.firstName} {prescription.patient.lastName}
                      </p>
                    </Link>
                    <p className="text-sm text-gray-500">•</p>
                  </>
                )}
                {prescription.issuedAt && (
                  <p className="text-sm text-gray-500">
                    {new Date(prescription.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button 
                onClick={() => handlePrint('patient')}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Patient Copy
              </button>
              <button 
                onClick={() => handlePrint('clinic')}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Clinic Copy
              </button>
              {prescription.status !== 'dispensed' && (
                <button 
                  onClick={() => setShowDispenseForm(true)}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  Record Dispense
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {/* Patient Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-3">
                <h3 className="text-lg font-semibold mb-3">Patient Information</h3>
                <div className="flex flex-col md:flex-row gap-4 flex-wrap">
                  {prescription.patient && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Name</p>
                      <Link href={`/patients/${prescription.patient._id}`}>
                        <p className="text-sm text-blue-700 hover:underline">
                          {prescription.patient.firstName} {prescription.patient.lastName}
                        </p>
                      </Link>
                    </div>
                  )}
                  {prescription.patient?.patientCode && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Patient ID</p>
                      <p className="text-sm">{prescription.patient.patientCode}</p>
                    </div>
                  )}
                  {prescription.patient?.dateOfBirth && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Date of Birth</p>
                      <p className="text-sm">{new Date(prescription.patient.dateOfBirth).toLocaleDateString()}</p>
                    </div>
                  )}
                  {prescription.patient?.phone && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Phone</p>
                      <p className="text-sm">{prescription.patient.phone}</p>
                    </div>
                  )}
                  {prescription.issuedAt && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Date Issued</p>
                      <p className="text-sm">
                        {new Date(prescription.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                  {prescription.prescribedBy && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Prescribed By</p>
                      <p className="text-sm">{prescription.prescribedBy.name}</p>
                    </div>
                  )}
                  {prescription.visit && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Visit</p>
                      <Link 
                        href={`/visits/${prescription.visit._id}`}
                        className="text-sm text-blue-700 hover:underline"
                      >
                        {prescription.visit.visitCode}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Medications */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-3">
                <h3 className="text-lg font-semibold mb-3">Medications</h3>
                <div className="flex flex-col gap-2">
                  {(prescription.medications || []).map((medication, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg border border-gray-200">
                      <div className="p-2">
                        <p className="text-sm font-bold mb-2">
                          {index + 1}. {medication.name}
                          {medication.genericName && (
                            <span className="text-xs text-gray-500 ml-2">
                              ({medication.genericName})
                            </span>
                          )}
                        </p>
                        <div className="flex flex-col md:flex-row gap-3 flex-wrap mb-2">
                          {medication.strength && (
                            <div>
                              <span className="text-xs font-medium">Strength:</span> <span className="text-xs">{medication.strength}</span>
                            </div>
                          )}
                          {medication.dose && (
                            <div>
                              <span className="text-xs font-medium">Dose:</span> <span className="text-xs">{medication.dose}</span>
                            </div>
                          )}
                          {medication.frequency && (
                            <div>
                              <span className="text-xs font-medium">Frequency:</span> <span className="text-xs">{medication.frequency}</span>
                            </div>
                          )}
                          {medication.durationDays && (
                            <div>
                              <span className="text-xs font-medium">Duration:</span> <span className="text-xs">{medication.durationDays} day(s)</span>
                            </div>
                          )}
                          {medication.quantity && (
                            <div>
                              <span className="text-xs font-medium">Quantity:</span> <span className="text-xs">{medication.quantity}</span>
                            </div>
                          )}
                          {medication.form && (
                            <div>
                              <span className="text-xs font-medium">Form:</span> <span className="text-xs">{medication.form}</span>
                            </div>
                          )}
                          {medication.route && (
                            <div>
                              <span className="text-xs font-medium">Route:</span> <span className="text-xs">{medication.route}</span>
                            </div>
                          )}
                        </div>
                        {medication.instructions && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <p className="text-xs font-medium mb-1">Instructions:</p>
                            <p className="text-xs">{medication.instructions}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Drug Interactions */}
            {prescription.drugInteractions && prescription.drugInteractions.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-3">
                  <h3 className="text-lg font-semibold mb-3">Drug Interactions</h3>
                  <div className="flex flex-col gap-2">
                    {prescription.drugInteractions.map((interaction, idx) => (
                      <div 
                        key={idx} 
                        className={`rounded-lg p-3 ${
                          getInteractionColor(interaction.severity) === 'red' ? 'bg-red-50 border border-red-200' :
                          getInteractionColor(interaction.severity) === 'yellow' ? 'bg-yellow-50 border border-yellow-200' :
                          'bg-blue-50 border border-blue-200'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-3 mb-2">
                          <p className="text-sm font-bold">
                            {interaction.medication1} + {interaction.medication2}
                          </p>
                          <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                            getInteractionColor(interaction.severity) === 'red' ? 'bg-red-600 text-white' :
                            getInteractionColor(interaction.severity) === 'yellow' ? 'bg-yellow-600 text-white' :
                            'bg-blue-600 text-white'
                          }`}>
                            {interaction.severity.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs mb-1">{interaction.description}</p>
                        {interaction.recommendation && (
                          <p className="text-xs italic">{interaction.recommendation}</p>
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
              </div>
            )}

            {/* Archive Status */}
            {prescription.copies && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-3">
                  <h3 className="text-lg font-semibold mb-3">Archive Status</h3>
                  <div className="flex flex-col md:flex-row gap-4">
                    {prescription.copies.patientCopy && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Patient Copy</h4>
                        {prescription.copies.patientCopy.printedAt && (
                          <p className="text-sm mb-1">
                            Printed: {new Date(prescription.copies.patientCopy.printedAt).toLocaleString()}
                          </p>
                        )}
                        {prescription.copies.patientCopy.digitalCopySent && (
                          <p className="text-sm">
                            Digital copy sent: {prescription.copies.patientCopy.sentAt
                              ? new Date(prescription.copies.patientCopy.sentAt).toLocaleString()
                              : 'Yes'}
                          </p>
                        )}
                      </div>
                    )}
                    {prescription.copies.clinicCopy && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Clinic Copy</h4>
                        {prescription.copies.clinicCopy.archivedAt && (
                          <p className="text-sm mb-1">
                            Archived: {new Date(prescription.copies.clinicCopy.archivedAt).toLocaleString()}
                          </p>
                        )}
                        {prescription.copies.clinicCopy.location && (
                          <p className="text-sm">
                            Location: {prescription.copies.clinicCopy.location}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Dispensing Status */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-3">
                <h3 className="text-lg font-semibold mb-3">Dispensing Status</h3>
                <div className="flex flex-col gap-2 mb-3">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-gray-500">Prescribed</p>
                    <p className="text-sm font-medium">{totalPrescribed}</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-gray-500">Dispensed</p>
                    <p className="text-sm font-medium">{totalDispensed}</p>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${totalPrescribed > 0 ? (totalDispensed / totalPrescribed) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                {(prescription.pharmacyDispenses || []).length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-semibold mb-1">Dispense History</h4>
                    {(prescription.pharmacyDispenses || []).map((dispense, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg border border-gray-200">
                        <div className="p-2">
                          <div className="flex justify-between items-start gap-3">
                            <div>
                              <p className="text-sm font-medium">
                                {dispense.pharmacyName || 'Pharmacy'}
                              </p>
                              {dispense.dispensedAt && (
                                <p className="text-xs text-gray-500">
                                  {new Date(dispense.dispensedAt).toLocaleDateString()}
                                </p>
                              )}
                              {dispense.quantityDispensed && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Quantity: {dispense.quantityDispensed}
                                </p>
                              )}
                            </div>
                            {dispense.trackingNumber && (
                              <p className="text-xs text-gray-500">#{dispense.trackingNumber}</p>
                            )}
                          </div>
                          {dispense.notes && (
                            <p className="text-xs mt-2">{dispense.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {prescription.notes && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-3">
                  <h3 className="text-lg font-semibold mb-3">Notes</h3>
                  <p className="text-sm whitespace-pre-wrap">{prescription.notes}</p>
                </div>
              </div>
            )}

            {/* Digital Signature */}
            {prescription.digitalSignature && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-3">
                  <h3 className="text-lg font-semibold mb-3">Digital Signature</h3>
                  <div className="flex items-center gap-3">
                    <div className="border-2 border-gray-300 rounded-lg p-1.5 bg-white">
                      <img
                        src={prescription.digitalSignature.signatureData}
                        alt="Signature"
                        className="h-16 block"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {prescription.digitalSignature.providerName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(prescription.digitalSignature.signedAt).toLocaleString()}
                      </p>
                    </div>
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
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">Record Dispense</h2>
              <div className="py-4">
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Pharmacy Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={dispenseForm.pharmacyName}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, pharmacyName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Quantity Dispensed <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      max={totalPrescribed - totalDispensed}
                      value={dispenseForm.quantityDispensed}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, quantityDispensed: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Remaining: {totalPrescribed - totalDispensed}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Tracking Number</label>
                    <input
                      type="text"
                      value={dispenseForm.trackingNumber}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, trackingNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Notes</label>
                    <textarea
                      value={dispenseForm.notes}
                      onChange={(e) => setDispenseForm({ ...dispenseForm, notes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-y"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => setShowDispenseForm(false)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDispense}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
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
