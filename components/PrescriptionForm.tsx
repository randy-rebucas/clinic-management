'use client';

import { useState, useEffect, FormEvent } from 'react';
import SignaturePad from './SignaturePad';
import { calculateDosage, calculateQuantity, formatDosageInstructions } from '@/lib/dosage-calculator';
import { AlertDialog } from './ui/Modal';

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
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [digitalSignature, setDigitalSignature] = useState<string | null>(null);
  const [showInteractionAlert, setShowInteractionAlert] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);
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
      if (patient) {
        setPatientSearch(`${patient.firstName} ${patient.lastName}`);
      }
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.patient-search-container')) {
        setShowPatientSearch(false);
      }
    };

    if (showPatientSearch) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPatientSearch]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.patient || !selectedPatient) {
      alert('Please select a valid patient');
      setShowPatientSearch(true);
      return;
    }
    if (formData.medications.length === 0) {
      alert('Please add at least one medication');
      return;
    }
    
    // Warn about severe interactions
    const severeInteractions = drugInteractions.filter(
      i => i.severity === 'contraindicated' || i.severity === 'severe'
    );
    if (severeInteractions.length > 0) {
      setPendingSubmit(true);
      setShowInteractionAlert(true);
      return;
    }
    
    handleSubmitConfirm();
  };

  const handleSubmitConfirm = () => {
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

  const filteredPatients = patients.filter((patient) => {
    if (!patientSearch.trim()) return true;
    const searchLower = patientSearch.toLowerCase();
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    return fullName.includes(searchLower);
  });

  const selectPatient = (patient: Patient) => {
    setFormData({ ...formData, patient: patient._id });
    setSelectedPatient(patient);
    setPatientSearch(`${patient.firstName} ${patient.lastName}`);
    setShowPatientSearch(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="max-h-[80vh] overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          {/* Patient Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Patient <span className="text-red-500">*</span>
            </label>
            <div className="relative patient-search-container">
          <input
            type="text"
            required
            value={patientSearch}
            onChange={(e) => {
              setPatientSearch(e.target.value);
              setShowPatientSearch(true);
              if (!e.target.value) {
                setFormData({ ...formData, patient: '' });
                setSelectedPatient(null);
              }
            }}
            onFocus={() => setShowPatientSearch(true)}
            placeholder="Type to search patients..."
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          {showPatientSearch && filteredPatients.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
            {filteredPatients.length > 0 ? (
              <div className="flex flex-col gap-1">
                {filteredPatients.map((patient) => {
                  const age = patient.dateOfBirth
                    ? Math.floor((new Date().getTime() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                    : null;
                  return (
                    <button
                      key={patient._id}
                      type="button"
                      onClick={() => {
                        selectPatient(patient);
                        setShowPatientSearch(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded transition-colors flex flex-col items-start"
                    >
                      <span className="font-medium text-sm">{patient.firstName} {patient.lastName}</span>
                      <span className="text-xs text-gray-600">
                        {age && `Age: ${age} years`}
                        {age && patient.weight && ' • '}
                        {patient.weight && `${patient.weight} kg`}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : patientSearch ? (
              <span className="text-sm text-gray-600 p-2">No patients found</span>
            ) : (
              <span className="text-sm text-gray-600 p-2">Start typing to search...</span>
            )}
          </div>
          )}
        </div>
        {formData.patient && !selectedPatient && (
          <p className="text-xs text-red-600 mt-1">Please select a valid patient from the list</p>
        )}
      </div>

          {/* Drug Interactions Warning */}
          {drugInteractions.length > 0 && (
            <div
              className={
                drugInteractions.some(i => i.severity === 'contraindicated' || i.severity === 'severe')
                  ? 'bg-red-50 border border-red-200 rounded-md p-3'
                  : drugInteractions.some(i => i.severity === 'moderate')
                  ? 'bg-yellow-50 border border-yellow-200 rounded-md p-3'
                  : 'bg-blue-50 border border-blue-200 rounded-md p-3'
              }
            >
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <div className="text-sm font-bold mb-2">Drug Interaction Warning</div>
                  <div className="flex flex-col gap-2">
                    {drugInteractions.map((interaction, idx) => (
                      <div key={idx}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">
                            {interaction.medication1} + {interaction.medication2}
                          </span>
                          <span
                            className={
                              interaction.severity === 'contraindicated' || interaction.severity === 'severe'
                                ? 'px-2 py-0.5 bg-red-600 text-white text-xs rounded-full'
                                : interaction.severity === 'moderate'
                                ? 'px-2 py-0.5 bg-yellow-600 text-white text-xs rounded-full'
                                : 'px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full'
                            }
                          >
                            {interaction.severity.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-xs mb-1">{interaction.description}</div>
                        {interaction.recommendation && (
                          <div className="text-xs italic">{interaction.recommendation}</div>
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
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold">Medications</h2>
              <div className="flex items-center gap-3">
                {checkingInteractions && (
                  <span className="text-xs text-gray-600">Checking interactions...</span>
                )}
                <button
                  type="button"
                  onClick={() => formData.medications.length >= 2 && checkInteractions(formData.medications)}
                  disabled={formData.medications.length < 2 || checkingInteractions}
                  className="px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🔍 Check Interactions
                </button>
                <button
                  type="button"
                  onClick={addMedication}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                >
                  + Add Medication
                </button>
              </div>
            </div>

            {formData.medications.length === 0 ? (
              <p className="text-sm text-gray-600">No medications added. Click &quot;Add Medication&quot; to add one.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {formData.medications.map((medication, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg border border-gray-200">
                    <div className="p-3">
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="text-lg font-semibold">Medication {index + 1}</h3>
                        <button
                          type="button"
                          onClick={() => removeMedication(index)}
                          className="px-2 py-1 text-xs text-red-700 hover:bg-red-100 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>

                      {/* Medicine Search */}
                      <div className="mb-3">
                        <label className="block text-xs font-medium mb-1">Search Medicine</label>
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                          {showMedicineSearch && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                              {medicineResults.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                  {medicineResults.map((medicine) => (
                                    <button
                                      key={medicine._id}
                                      type="button"
                                      onClick={() => {
                                        selectMedicine(medicine, index);
                                        setShowMedicineSearch(false);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded transition-colors flex flex-col items-start"
                                    >
                                      <span className="font-medium text-sm">{medicine.name}</span>
                                      {medicine.genericName && (
                                        <span className="text-xs text-gray-600">{medicine.genericName}</span>
                                      )}
                                      <span className="text-xs text-gray-600">
                                        {medicine.strength} • {medicine.form} • {medicine.category}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              ) : medicineSearch ? (
                                <p className="text-sm text-gray-600 p-2">No medicines found</p>
                              ) : (
                                <p className="text-sm text-gray-600 p-2">Start typing to search...</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Medication Details */}
                      <div className="flex flex-col gap-3">
                        <div className="flex gap-3 flex-wrap">
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-medium mb-2">
                              Name <span className="text-red-600">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={medication.name}
                              onChange={(e) => updateMedication(index, 'name', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                          {medication.genericName && (
                            <div className="flex-1 min-w-[200px]">
                              <label className="block text-xs font-medium mb-2">Generic Name</label>
                              <input
                                type="text"
                                value={medication.genericName}
                                readOnly
                                disabled
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm cursor-not-allowed"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-medium mb-2">Form</label>
                            <input
                              type="text"
                              value={medication.form || ''}
                              onChange={(e) => updateMedication(index, 'form', e.target.value)}
                              placeholder="tablet, capsule, etc."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-medium mb-2">Strength</label>
                            <input
                              type="text"
                              value={medication.strength || ''}
                              onChange={(e) => updateMedication(index, 'strength', e.target.value)}
                              placeholder="500 mg"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-medium mb-2">
                              Dose <span className="text-red-600">*</span>
                            </label>
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <input
                                  type="text"
                                  required
                                  value={medication.dose || ''}
                                  onChange={(e) => updateMedication(index, 'dose', e.target.value)}
                                  placeholder="500 mg"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                />
                              </div>
                              {medication.medicineId && selectedPatient && (
                                <button
                                  type="button"
                                  onClick={() => calculateDosageForMedication(index)}
                                  title="Recalculate dosage based on patient info"
                                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                                >
                                  ↻
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-medium mb-2">
                              Frequency <span className="text-red-600">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={medication.frequency || ''}
                              onChange={(e) => updateMedication(index, 'frequency', e.target.value)}
                              placeholder="BID, TID, QID, etc."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-medium mb-2">Duration (days)</label>
                            <input
                              type="number"
                              min="1"
                              value={medication.durationDays || 7}
                              onChange={(e) => updateMedication(index, 'durationDays', parseInt(e.target.value) || 7)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-medium mb-2">Quantity</label>
                            <input
                              type="number"
                              min="1"
                              value={medication.quantity || 0}
                              onChange={(e) => updateMedication(index, 'quantity', parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-2">Instructions</label>
                          <textarea
                            value={medication.instructions || ''}
                            onChange={(e) => updateMedication(index, 'instructions', e.target.value)}
                            rows={2}
                            placeholder="Take with food, etc."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-y"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Additional Notes */}
          <div>
            <label className="block text-sm font-medium mb-2">Additional Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-y"
            />
          </div>

          {/* Digital Signature */}
          <div>
            {digitalSignature ? (
              <div className="bg-green-50 border border-green-200 rounded-lg">
                <div className="flex justify-between items-center p-3">
                  <div>
                    <p className="text-sm font-medium text-green-800">Digital Signature Added</p>
                    <p className="text-xs text-green-700">Signed by: {providerName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDigitalSignature(null);
                      setShowSignaturePad(true);
                    }}
                    className="px-2 py-1 text-xs text-green-700 hover:bg-green-100 rounded transition-colors"
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSignaturePad(true)}
                className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
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
          <hr className="border-gray-200" />
          <div className="flex justify-end gap-2">
            {onCancel && (
              <button 
                type="button" 
                onClick={onCancel}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            )}
            <button 
              type="submit"
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Create Prescription
            </button>
          </div>
        </div>
      </div>

      {/* Drug Interaction Alert Dialog */}
      <AlertDialog 
        open={showInteractionAlert} 
        onOpenChange={setShowInteractionAlert}
        title="Drug Interaction Warning"
        description={
          <div>
            <p className="mb-3">
              {drugInteractions.filter(i => i.severity === 'contraindicated' || i.severity === 'severe').length} severe or contraindicated drug interaction(s) detected.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm">
                Are you sure you want to proceed with this prescription?
              </p>
            </div>
          </div>
        }
      >
        <button
          onClick={() => {
            setShowInteractionAlert(false);
            setPendingSubmit(false);
          }}
          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            setShowInteractionAlert(false);
            handleSubmitConfirm();
            setPendingSubmit(false);
          }}
          className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
        >
          Proceed Anyway
        </button>
      </AlertDialog>
    </form>
  );
}

