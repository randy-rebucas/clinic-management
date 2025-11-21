'use client';

import { useState, useEffect, FormEvent } from 'react';
import SignaturePad from './SignaturePad';
import { calculateDosage, calculateQuantity, formatDosageInstructions } from '@/lib/dosage-calculator';

interface Medicine {
  _id: string;
  name: string;
  genericName?: string;
  form: string;
  strength: string;
  unit: string;
  route: string;
  category: string;
  standardDosage?: string;
  standardFrequency?: string;
  dosageRanges?: Array<{
    minAge?: number;
    maxAge?: number;
    minWeight?: number;
    maxWeight?: number;
    dose: string;
    frequency: string;
    maxDailyDose?: string;
  }>;
}

interface Medication {
  medicineId?: string;
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
}

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  weight?: number;
}

interface PrescriptionFormProps {
  initialData?: {
    patient?: string;
    visit?: string;
    medications?: Medication[];
    notes?: string;
  };
  patients: Patient[];
  onSubmit: (data: any) => void;
  onCancel?: () => void;
  providerName: string;
}

export default function PrescriptionForm({
  initialData,
  patients,
  onSubmit,
  onCancel,
  providerName,
}: PrescriptionFormProps) {
  const [formData, setFormData] = useState({
    patient: initialData?.patient || '',
    visit: initialData?.visit || '',
    medications: (initialData?.medications || []) as Medication[],
    notes: initialData?.notes || '',
  });

  const [medicineSearch, setMedicineSearch] = useState('');
  const [medicineResults, setMedicineResults] = useState<Medicine[]>([]);
  const [showMedicineSearch, setShowMedicineSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [digitalSignature, setDigitalSignature] = useState<string | null>(null);
  const [drugInteractions, setDrugInteractions] = useState<Array<{
    medication1: string;
    medication2: string;
    severity: 'mild' | 'moderate' | 'severe' | 'contraindicated';
    description: string;
    recommendation?: string;
  }>>([]);
  const [checkingInteractions, setCheckingInteractions] = useState(false);

  useEffect(() => {
    if (formData.patient) {
      const patient = patients.find((p) => p._id === formData.patient);
      setSelectedPatient(patient || null);
    }
  }, [formData.patient, patients]);

  useEffect(() => {
    if (medicineSearch.length >= 2) {
      const timer = setTimeout(() => {
        fetch(`/api/medicines?search=${encodeURIComponent(medicineSearch)}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              setMedicineResults(data.data.slice(0, 10));
            }
          })
          .catch(console.error);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setMedicineResults([]);
    }
  }, [medicineSearch]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (formData.medications.length === 0) {
      alert('Please add at least one medication');
      return;
    }
    
    // Warn about severe interactions
    const severeInteractions = drugInteractions.filter(
      i => i.severity === 'contraindicated' || i.severity === 'severe'
    );
    if (severeInteractions.length > 0) {
      const proceed = confirm(
        `Warning: ${severeInteractions.length} severe or contraindicated drug interaction(s) detected. Are you sure you want to proceed?`
      );
      if (!proceed) {
        return;
      }
    }
    
    onSubmit({
      ...formData,
      digitalSignature: digitalSignature
        ? {
            providerName,
            signatureData: digitalSignature,
          }
        : undefined,
      drugInteractions: drugInteractions.length > 0 ? drugInteractions.map(i => ({
        ...i,
        checkedAt: new Date(),
      })) : undefined,
    });
  };

  const addMedication = () => {
    setFormData({
      ...formData,
      medications: [
        ...formData.medications,
        {
          name: '',
          form: '',
          strength: '',
          dose: '',
          route: '',
          frequency: '',
          durationDays: 7,
          quantity: 0,
        },
      ],
    });
  };

  const removeMedication = (index: number) => {
    const updated = formData.medications.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      medications: updated,
    });
    
    // Recheck interactions after removal
    if (updated.length >= 2) {
      checkInteractions(updated);
    } else {
      setDrugInteractions([]);
    }
  };

  const selectMedicine = (medicine: Medicine, index: number) => {
    const updated = [...formData.medications];
    const patientInfo = {
      age: selectedPatient?.dateOfBirth
        ? Math.floor((new Date().getTime() - new Date(selectedPatient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : undefined,
      weight: selectedPatient?.weight,
    };

    const calculated = calculateDosage(medicine as any, patientInfo);

    updated[index] = {
      medicineId: medicine._id,
      name: medicine.name,
      genericName: medicine.genericName,
      form: medicine.form,
      strength: medicine.strength,
      dose: calculated.dose,
      route: medicine.route,
      frequency: calculated.frequency,
      durationDays: 7,
      quantity: calculateQuantity(calculated.frequency, 7, calculated.dose),
      instructions: formatDosageInstructions(medicine as any, calculated, 7),
    };

    setFormData({ ...formData, medications: updated });
    setShowMedicineSearch(false);
    setMedicineSearch('');
    
    // Check interactions after adding medication
    if (updated.length >= 2) {
      checkInteractions(updated);
    }
  };

  const updateMedication = (index: number, field: string, value: any) => {
    const updated = [...formData.medications];
    updated[index] = { ...updated[index], [field]: value };

    // Recalculate quantity if frequency or duration changes
    if (field === 'frequency' || field === 'durationDays') {
      const med = updated[index];
      if (med.frequency && med.durationDays && med.dose) {
        updated[index].quantity = calculateQuantity(med.frequency, med.durationDays, med.dose);
      }
    }

    setFormData({ ...formData, medications: updated });
    
    // Check interactions when medications change
    if (updated.length >= 2 && updated.every(m => m.name.trim())) {
      checkInteractions(updated);
    } else {
      setDrugInteractions([]);
    }
  };

  const checkInteractions = async (medications: Medication[]) => {
    if (medications.length < 2) {
      setDrugInteractions([]);
      return;
    }

    setCheckingInteractions(true);
    try {
      const response = await fetch('/api/prescriptions/check-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medications: medications.map(m => ({ name: m.name, genericName: m.genericName })),
          patientId: formData.patient || undefined,
          includePatientMedications: true,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setDrugInteractions(data.data.interactions || []);
      }
    } catch (error) {
      console.error('Error checking interactions:', error);
    } finally {
      setCheckingInteractions(false);
    }
  };

  const calculateDosageForMedication = (index: number) => {
    const medication = formData.medications[index];
    if (!medication.medicineId || !selectedPatient) return;

    fetch(`/api/medicines/${medication.medicineId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const medicine = data.data;
          const patientInfo = {
            age: selectedPatient.dateOfBirth
              ? Math.floor(
                  (new Date().getTime() - new Date(selectedPatient.dateOfBirth).getTime()) /
                    (365.25 * 24 * 60 * 60 * 1000)
                )
              : undefined,
            weight: selectedPatient.weight,
          };

          const calculated = calculateDosage(medicine, patientInfo);
          updateMedication(index, 'dose', calculated.dose);
          updateMedication(index, 'frequency', calculated.frequency);
          updateMedication(index, 'instructions', calculated.instructions);
          if (calculated.warnings && calculated.warnings.length > 0) {
            alert(calculated.warnings.join('\n'));
          }
        }
      })
      .catch(console.error);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-h-[80vh] overflow-y-auto">
      {/* Patient Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Patient *</label>
        <select
          required
          value={formData.patient}
          onChange={(e) => setFormData({ ...formData, patient: e.target.value })}
          className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select a patient</option>
          {patients.map((patient) => (
            <option key={patient._id} value={patient._id}>
              {patient.firstName} {patient.lastName}
              {patient.dateOfBirth && ` (Age: ${Math.floor((new Date().getTime() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} years)`}
              {patient.weight && ` - ${patient.weight} kg`}
            </option>
          ))}
        </select>
      </div>

      {/* Drug Interactions Warning */}
      {drugInteractions.length > 0 && (
        <div className="mb-4 p-4 rounded-lg border-2" style={{
          borderColor: drugInteractions.some(i => i.severity === 'contraindicated' || i.severity === 'severe')
            ? '#dc2626' : drugInteractions.some(i => i.severity === 'moderate') ? '#f59e0b' : '#3b82f6',
          backgroundColor: drugInteractions.some(i => i.severity === 'contraindicated' || i.severity === 'severe')
            ? '#fee2e2' : drugInteractions.some(i => i.severity === 'moderate') ? '#fef3c7' : '#dbeafe',
        }}>
          <div className="flex items-start">
            <svg className="w-5 h-5 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <h4 className="font-semibold mb-2">Drug Interaction Warning</h4>
              <div className="space-y-2">
                {drugInteractions.map((interaction, idx) => (
                  <div key={idx} className="text-sm">
                    <strong>{interaction.medication1}</strong> + <strong>{interaction.medication2}</strong>
                    <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                      interaction.severity === 'contraindicated' ? 'bg-red-600 text-white' :
                      interaction.severity === 'severe' ? 'bg-red-500 text-white' :
                      interaction.severity === 'moderate' ? 'bg-yellow-500 text-white' :
                      'bg-blue-500 text-white'
                    }`}>
                      {interaction.severity.toUpperCase()}
                    </span>
                    <p className="mt-1 text-gray-700">{interaction.description}</p>
                    {interaction.recommendation && (
                      <p className="mt-1 text-gray-600 italic">{interaction.recommendation}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Medications */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Medications</h3>
          <div className="flex items-center space-x-3">
            {checkingInteractions && (
              <span className="text-xs text-gray-500">Checking interactions...</span>
            )}
            <button
              type="button"
              onClick={() => formData.medications.length >= 2 && checkInteractions(formData.medications)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              disabled={formData.medications.length < 2 || checkingInteractions}
            >
              🔍 Check Interactions
            </button>
            <button
              type="button"
              onClick={addMedication}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              + Add Medication
            </button>
          </div>
        </div>

        {formData.medications.length === 0 ? (
          <p className="text-sm text-gray-500">No medications added. Click "Add Medication" to add one.</p>
        ) : (
          <div className="space-y-4">
            {formData.medications.map((medication, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="text-sm font-semibold text-gray-900">Medication {index + 1}</h4>
                  <button
                    type="button"
                    onClick={() => removeMedication(index)}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>

                {/* Medicine Search */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Search Medicine</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={medicineSearch}
                      onChange={(e) => {
                        setMedicineSearch(e.target.value);
                        setShowMedicineSearch(true);
                      }}
                      onFocus={() => setShowMedicineSearch(true)}
                      placeholder="Type to search medicines..."
                      className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    {showMedicineSearch && medicineResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {medicineResults.map((medicine) => (
                          <button
                            key={medicine._id}
                            type="button"
                            onClick={() => {
                              selectMedicine(medicine, index);
                              setShowMedicineSearch(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                          >
                            <div className="font-medium">{medicine.name}</div>
                            {medicine.genericName && (
                              <div className="text-xs text-gray-500">{medicine.genericName}</div>
                            )}
                            <div className="text-xs text-gray-400">
                              {medicine.strength} • {medicine.form} • {medicine.category}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Medication Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      value={medication.name}
                      onChange={(e) => updateMedication(index, 'name', e.target.value)}
                      className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  {medication.genericName && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Generic Name</label>
                      <input
                        type="text"
                        value={medication.genericName}
                        readOnly
                        className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm bg-gray-50"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Form</label>
                    <input
                      type="text"
                      value={medication.form || ''}
                      onChange={(e) => updateMedication(index, 'form', e.target.value)}
                      placeholder="tablet, capsule, etc."
                      className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Strength</label>
                    <input
                      type="text"
                      value={medication.strength || ''}
                      onChange={(e) => updateMedication(index, 'strength', e.target.value)}
                      placeholder="500 mg"
                      className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Dose *</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        required
                        value={medication.dose || ''}
                        onChange={(e) => updateMedication(index, 'dose', e.target.value)}
                        placeholder="500 mg"
                        className="flex-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      />
                      {medication.medicineId && selectedPatient && (
                        <button
                          type="button"
                          onClick={() => calculateDosageForMedication(index)}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          title="Recalculate dosage based on patient info"
                        >
                          ↻
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Frequency *</label>
                    <input
                      type="text"
                      required
                      value={medication.frequency || ''}
                      onChange={(e) => updateMedication(index, 'frequency', e.target.value)}
                      placeholder="BID, TID, QID, etc."
                      className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Duration (days)</label>
                    <input
                      type="number"
                      min="1"
                      value={medication.durationDays || 7}
                      onChange={(e) => updateMedication(index, 'durationDays', parseInt(e.target.value) || 7)}
                      className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={medication.quantity || 0}
                      onChange={(e) => updateMedication(index, 'quantity', parseInt(e.target.value) || 0)}
                      className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Instructions</label>
                    <textarea
                      value={medication.instructions || ''}
                      onChange={(e) => updateMedication(index, 'instructions', e.target.value)}
                      rows={2}
                      placeholder="Take with food, etc."
                      className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Additional Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Additional Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
          className="mt-1 block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Digital Signature */}
      <div>
        {digitalSignature ? (
          <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
            <div>
              <p className="text-sm font-medium text-green-800">Digital Signature Added</p>
              <p className="text-xs text-green-600">Signed by: {providerName}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDigitalSignature(null);
                setShowSignaturePad(true);
              }}
              className="text-sm text-green-700 hover:text-green-800"
            >
              Change
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSignaturePad(true)}
            className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-blue-500 hover:text-blue-600"
          >
            + Add Digital Signature
          </button>
        )}
      </div>

      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black/30 backdrop-blur-md" onClick={() => setShowSignaturePad(false)} />
            <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-2xl w-full z-10">
              <SignaturePad
                onSave={(signatureData) => {
                  setDigitalSignature(signatureData);
                  setShowSignaturePad(false);
                }}
                onCancel={() => setShowSignaturePad(false)}
                providerName={providerName}
              />
            </div>
          </div>
        </div>
      )}

      {/* Form Actions */}
      <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 border border-gray-200 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-3 py-1.5 border border-transparent rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          Create Prescription
        </button>
      </div>
    </form>
  );
}

