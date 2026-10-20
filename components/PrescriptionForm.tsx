'use client';

import { useState, useEffect, useId, FormEvent } from 'react';
import dynamic from 'next/dynamic';

const SignaturePad = dynamic(() => import('./SignaturePad'), { ssr: false });
import { calculateDosage, calculateQuantity, formatDosageInstructions } from '@/lib/dosage-calculator';
import { AlertDialog } from './ui/Modal';
import { useModalA11y } from './hooks/useModalA11y';
import { useTemplates } from './templates/useTemplates';
import { SaveTemplateDialog, TemplatePickerDialog } from './templates/TemplateDialogs';
import { durationToDays, mergeMedications, type ClinicalTemplateDTO, type TemplateMedication } from '@/lib/clinical-templates';

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

const medicationFromTemplate = (m: TemplateMedication): Medication => ({
  name: m.name,
  genericName: m.genericName,
  form: m.form ?? '',
  strength: m.strength ?? '',
  dose: m.dosage ?? '',
  route: m.route ?? '',
  frequency: m.frequency ?? '',
  durationDays: durationToDays(m.duration) ?? 7,
  quantity: m.quantity ?? 0,
  instructions: m.instructions,
});

const medicationToTemplate = (m: Medication): TemplateMedication => ({
  name: m.name.trim(),
  ...(m.genericName ? { genericName: m.genericName } : {}),
  ...(m.form ? { form: m.form } : {}),
  ...(m.strength ? { strength: m.strength } : {}),
  ...(m.dose ? { dosage: m.dose } : {}),
  ...(m.route ? { route: m.route } : {}),
  ...(m.frequency ? { frequency: m.frequency } : {}),
  ...(m.durationDays ? { duration: `${m.durationDays} days` } : {}),
  ...(m.quantity ? { quantity: m.quantity } : {}),
  ...(m.instructions ? { instructions: m.instructions } : {}),
});

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
  onSubmit: (data: any) => void | Promise<unknown>;
  onCancel?: () => void;
  providerName: string;
  /** When provided, patient search is done server-side and `patients` holds the results. */
  onPatientSearch?: (query: string) => void;
}

export default function PrescriptionForm({
  initialData,
  patients,
  onSubmit,
  onCancel,
  providerName,
  onPatientSearch,
}: PrescriptionFormProps) {
  const uid = useId();
  const [formData, setFormData] = useState({
    patient: initialData?.patient || '',
    visit: initialData?.visit || '',
    medications: (initialData?.medications || []) as Medication[],
    notes: initialData?.notes || '',
  });

  const [medicineSearch, setMedicineSearch] = useState('');
  const [fetchedMedicines, setMedicineResults] = useState<Medicine[]>([]);
  const [showMedicineSearch, setShowMedicineSearch] = useState(false);
  const [pickedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientSearchInput, setPatientSearch] = useState<string | null>(null);
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
  const [submitting, setSubmitting] = useState(false);
  const signaturePadRef = useModalA11y<HTMLDivElement>(showSignaturePad, () => setShowSignaturePad(false));
  const tpl = useTemplates('prescription');
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // A preset patient (initialData) is resolved once it shows up in `patients`; an explicit pick wins.
  const selectedPatient =
    (pickedPatient && pickedPatient._id === formData.patient ? pickedPatient : null) ??
    (formData.patient ? patients.find((p) => p._id === formData.patient) ?? null : null);
  const patientSearch =
    patientSearchInput ?? (selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : '');

  const medicineResults = medicineSearch.length >= 2 ? fetchedMedicines : [];

  useEffect(() => {
    if (medicineSearch.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/medicines?search=${encodeURIComponent(medicineSearch)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data.success) {
            setMedicineResults(data.data.slice(0, 10));
          }
        })
        .catch(console.error);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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
    if (submitting) return;
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

  const handleSubmitConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
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
    } finally {
      setSubmitting(false);
    }
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

  // --- Saved prescriptions ("my usual") ------------------------------------------
  const applySaved = (t: ClinicalTemplateDTO) => {
    const updated = mergeMedications(formData.medications, t.medications, medicationFromTemplate);
    setFormData({ ...formData, medications: updated });
    setPicker(false);
    tpl.markUsed(t._id);
    if (updated.length >= 2) checkInteractions(updated);
  };

  const saveCurrent = async (input: { name: string; specialty?: string; shared: boolean }) => {
    await tpl.create({
      kind: 'prescription',
      ...input,
      medications: formData.medications.filter((m) => m.name.trim()).map(medicationToTemplate),
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

  const filteredPatients = onPatientSearch ? patients : patients.filter((patient) => {
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
        <div className="flex flex-col gap-6 p-4">
          {/* Patient Selection */}
          <div className="bg-brand-teal-light/60 border border-brand-teal/30 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-brand-teal-dark rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <label htmlFor={`${uid}-patient`} className="block text-sm font-bold text-gray-900">
                Patient <span className="text-red-600">*</span>
              </label>
            </div>
            <div className="relative patient-search-container">
              <input id={`${uid}-patient`}
                type="text"
                required
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value);
                  setShowPatientSearch(true);
                  onPatientSearch?.(e.target.value);
                  if (!e.target.value) {
                    setFormData({ ...formData, patient: '' });
                    setSelectedPatient(null);
                  }
                }}
                onFocus={() => setShowPatientSearch(true)}
                placeholder="Type to search patients..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-teal focus:border-transparent outline-none transition-all text-sm"
              />
              {showPatientSearch && filteredPatients.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {filteredPatients.length > 0 ? (
                    <div className="flex flex-col gap-1 p-1">
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
                            className="w-full text-left px-3 py-2 hover:bg-brand-teal-light/60 rounded transition-colors flex flex-col items-start"
                          >
                            <span className="font-semibold text-sm text-gray-900">{patient.firstName} {patient.lastName}</span>
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
                    <span className="text-sm text-gray-500 p-2">No patients found</span>
                  ) : (
                    <span className="text-sm text-gray-500 p-2">Start typing to search...</span>
                  )}
                </div>
              )}
            </div>
            {formData.patient && !selectedPatient && (
              <p className="text-xs text-red-600 mt-2 font-medium">Please select a valid patient from the list</p>
            )}
          </div>

          {/* Drug Interactions Warning */}
          {drugInteractions.length > 0 && (
            <div
              role="alert"
              className={
                drugInteractions.some(i => i.severity === 'contraindicated' || i.severity === 'severe')
                  ? 'bg-red-50 border border-red-200 rounded-lg p-4 shadow-sm'
                  : drugInteractions.some(i => i.severity === 'moderate')
                  ? 'bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-sm'
                  : 'bg-brand-teal-light/60 border border-brand-teal/30 rounded-lg p-4 shadow-sm'
              }
            >
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <div className="text-sm font-bold mb-3 text-gray-900">Drug Interaction Warning</div>
                  <div className="flex flex-col gap-3">
                    {drugInteractions.map((interaction, idx) => (
                      <div key={idx} className="bg-white/50 p-3 rounded border border-gray-200">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-semibold text-gray-900">
                            {interaction.medication1} + {interaction.medication2}
                          </span>
                          <span
                            className={
                              interaction.severity === 'contraindicated' || interaction.severity === 'severe'
                                ? 'px-2.5 py-1 bg-red-600 text-white text-xs rounded-full font-semibold border border-red-700'
                                : interaction.severity === 'moderate'
                                ? 'px-2.5 py-1 bg-yellow-600 text-white text-xs rounded-full font-semibold border border-yellow-700'
                                : 'px-2.5 py-1 bg-brand-teal-dark text-white text-xs rounded-full font-semibold border border-brand-teal-dark'
                            }
                          >
                            {interaction.severity.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-xs text-gray-700 mb-1">{interaction.description}</div>
                        {interaction.recommendation && (
                          <div className="text-xs italic text-gray-600 bg-gray-50 p-2 rounded border border-gray-200">{interaction.recommendation}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Medications */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">Medications</h2>
              </div>
              <div className="flex items-center gap-3">
                {checkingInteractions && (
                  <span className="text-xs text-gray-600 font-medium">Checking interactions...</span>
                )}
                <button
                  type="button"
                  onClick={() => formData.medications.length >= 2 && checkInteractions(formData.medications)}
                  disabled={formData.medications.length < 2 || checkingInteractions}
                  className="px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200 font-semibold"
                >
                  🔍 Check Interactions
                </button>
                <button
                  type="button"
                  onClick={() => setPicker(true)}
                  className="px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 font-semibold"
                >
                  ★ My usual
                </button>
                {formData.medications.some((m) => m.name.trim()) && (
                  <button
                    type="button"
                    onClick={() => setSaving(true)}
                    className="px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 font-semibold"
                  >
                    Save these
                  </button>
                )}
                <button
                  type="button"
                  onClick={addMedication}
                  className="px-3 py-1.5 text-xs bg-brand-teal-dark text-white rounded-lg hover:bg-brand-teal-deep transition-all font-semibold shadow-sm"
                >
                  + Add Medication
                </button>
              </div>
            </div>

            {formData.medications.length === 0 ? (
              <div className="border-2 border-dashed border-emerald-200 rounded-lg p-8 text-center bg-white/50">
                <p className="text-sm text-gray-600 font-medium">No medications added. Click &quot;Add Medication&quot; to add one.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {formData.medications.map((medication, index) => (
                  <div key={index} className="bg-white border border-emerald-200 rounded-lg p-4 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-bold text-gray-900">Medication {index + 1}</h3>
                      <button
                        type="button"
                        onClick={() => removeMedication(index)}
                        aria-label={`Remove medication ${index + 1}`}
                        className="px-3 py-1.5 text-xs text-red-700 hover:bg-red-100 rounded-lg transition-colors border border-red-200 font-semibold"
                      >
                        Remove
                      </button>
                    </div>

                    {/* Medicine Search */}
                    <div className="mb-4">
                        <label htmlFor={`${uid}-med-${index}-search`} className="block text-xs font-semibold text-gray-700 mb-2">Search Medicine</label>
                        <div className="relative">
                          <input id={`${uid}-med-${index}-search`}
                            type="text"
                            value={medicineSearch}
                            onChange={(e) => {
                              setMedicineSearch(e.target.value);
                              setShowMedicineSearch(true);
                            }}
                            onFocus={() => setShowMedicineSearch(true)}
                            placeholder="Type to search medicines..."
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent text-sm transition-all"
                          />
                          {showMedicineSearch && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-xl max-h-[200px] overflow-y-auto">
                              {medicineResults.length > 0 ? (
                                <div className="flex flex-col gap-1 p-1">
                                  {medicineResults.map((medicine) => (
                                    <button
                                      key={medicine._id}
                                      type="button"
                                      onClick={() => {
                                        selectMedicine(medicine, index);
                                        setShowMedicineSearch(false);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-emerald-50 rounded transition-colors flex flex-col items-start"
                                    >
                                      <span className="font-semibold text-sm text-gray-900">{medicine.name}</span>
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
                                <p className="text-sm text-gray-500 p-2">No medicines found</p>
                              ) : (
                                <p className="text-sm text-gray-500 p-2">Start typing to search...</p>
                              )}
                            </div>
                          )}
                        </div>
                    </div>

                    {/* Medication Details */}
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="md:col-span-2">
                            <label htmlFor={`${uid}-med-${index}-name`} className="block text-xs font-semibold text-gray-700 mb-2">
                              Name <span className="text-red-600">*</span>
                            </label>
                            <input id={`${uid}-med-${index}-name`}
                              type="text"
                              required
                              value={medication.name}
                              onChange={(e) => updateMedication(index, 'name', e.target.value)}
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent text-sm transition-all"
                            />
                          </div>
                          {medication.genericName && (
                            <div className="md:col-span-2">
                              <label htmlFor={`${uid}-med-${index}-generic`} className="block text-xs font-semibold text-gray-700 mb-2">Generic Name</label>
                              <input id={`${uid}-med-${index}-generic`}
                                type="text"
                                value={medication.genericName}
                                readOnly
                                disabled
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-100 text-sm cursor-not-allowed"
                              />
                            </div>
                          )}
                          <div>
                            <label htmlFor={`${uid}-med-${index}-form`} className="block text-xs font-semibold text-gray-700 mb-2">Form</label>
                            <input id={`${uid}-med-${index}-form`}
                              type="text"
                              value={medication.form || ''}
                              onChange={(e) => updateMedication(index, 'form', e.target.value)}
                              placeholder="tablet, capsule, etc."
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent text-sm transition-all"
                            />
                          </div>
                          <div>
                            <label htmlFor={`${uid}-med-${index}-strength`} className="block text-xs font-semibold text-gray-700 mb-2">Strength</label>
                            <input id={`${uid}-med-${index}-strength`}
                              type="text"
                              value={medication.strength || ''}
                              onChange={(e) => updateMedication(index, 'strength', e.target.value)}
                              placeholder="500 mg"
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent text-sm transition-all"
                            />
                          </div>
                          <div>
                            <label htmlFor={`${uid}-med-${index}-dose`} className="block text-xs font-semibold text-gray-700 mb-2">
                              Dose <span className="text-red-600">*</span>
                            </label>
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <input id={`${uid}-med-${index}-dose`}
                                  type="text"
                                  required
                                  value={medication.dose || ''}
                                  onChange={(e) => updateMedication(index, 'dose', e.target.value)}
                                  placeholder="500 mg"
                                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent text-sm transition-all"
                                />
                              </div>
                              {medication.medicineId && selectedPatient && (
                                <button
                                  type="button"
                                  onClick={() => calculateDosageForMedication(index)}
                                  title="Recalculate dosage based on patient info"
                                  aria-label={`Recalculate dosage for medication ${index + 1}`}
                                  className="px-3 py-2.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors text-sm font-semibold border border-emerald-200"
                                >
                                  <span aria-hidden="true">↻</span>
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <label htmlFor={`${uid}-med-${index}-frequency`} className="block text-xs font-semibold text-gray-700 mb-2">
                              Frequency <span className="text-red-600">*</span>
                            </label>
                            <input id={`${uid}-med-${index}-frequency`}
                              type="text"
                              required
                              value={medication.frequency || ''}
                              onChange={(e) => updateMedication(index, 'frequency', e.target.value)}
                              placeholder="BID, TID, QID, etc."
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent text-sm transition-all"
                            />
                          </div>
                          <div>
                            <label htmlFor={`${uid}-med-${index}-duration`} className="block text-xs font-semibold text-gray-700 mb-2">Duration (days)</label>
                            <input id={`${uid}-med-${index}-duration`}
                              type="number"
                              min="1"
                              value={medication.durationDays || 7}
                              onChange={(e) => updateMedication(index, 'durationDays', parseInt(e.target.value) || 7)}
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent text-sm transition-all"
                            />
                          </div>
                          <div>
                            <label htmlFor={`${uid}-med-${index}-quantity`} className="block text-xs font-semibold text-gray-700 mb-2">Quantity</label>
                            <input id={`${uid}-med-${index}-quantity`}
                              type="number"
                              min="1"
                              value={medication.quantity || 0}
                              onChange={(e) => updateMedication(index, 'quantity', parseInt(e.target.value) || 0)}
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent text-sm transition-all"
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor={`${uid}-med-${index}-instructions`} className="block text-xs font-semibold text-gray-700 mb-2">Instructions</label>
                          <textarea id={`${uid}-med-${index}-instructions`}
                            value={medication.instructions || ''}
                            onChange={(e) => updateMedication(index, 'instructions', e.target.value)}
                            rows={2}
                            placeholder="Take with food, etc."
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent text-sm resize-y transition-all"
                          />
                        </div>
                      </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Additional Notes */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gray-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <label htmlFor={`${uid}-notes`} className="block text-sm font-bold text-gray-900">Additional Notes</label>
            </div>
            <textarea id={`${uid}-notes`}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm resize-y transition-all"
            />
          </div>

          {/* Digital Signature */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
              <p className="block text-sm font-bold text-gray-900">Digital Signature</p>
            </div>
            {digitalSignature ? (
              <div className="bg-white border border-green-300 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-green-800 mb-1">Digital Signature Added</p>
                    <p className="text-xs text-green-700 font-medium">Signed by: {providerName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDigitalSignature(null);
                      setShowSignaturePad(true);
                    }}
                    className="px-3 py-1.5 text-xs text-green-700 hover:bg-green-100 rounded-lg transition-colors border border-green-200 font-semibold"
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSignaturePad(true)}
                className="w-full px-4 py-2.5 bg-brand-teal-dark text-white rounded-lg hover:bg-brand-teal-deep transition-all text-sm font-semibold shadow-md"
              >
                + Add Digital Signature
              </button>
            )}
          </div>

          {/* Form Actions */}
          <hr className="border-gray-200" />
          <div className="flex justify-end gap-3 pt-2">
            {onCancel && (
              <button 
                type="button" 
                onClick={onCancel}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold border border-gray-200"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="px-4 py-2.5 bg-brand-teal-dark text-white rounded-lg hover:bg-brand-teal-deep transition-all text-sm font-semibold shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating…' : 'Create Prescription'}
            </button>
          </div>
        </div>
      </div>

      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black/30 backdrop-blur-md" aria-hidden="true" onClick={() => setShowSignaturePad(false)} />
            <div ref={signaturePadRef} role="dialog" aria-modal="true" aria-label="Digital signature" className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-2xl w-full z-10">
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

      {picker && (
        <TemplatePickerDialog
          open
          onClose={() => setPicker(false)}
          title="Add a saved prescription"
          kind="prescription"
          templates={tpl.templates}
          loading={tpl.loading}
          error={tpl.error}
          onPick={applySaved}
          emptyHint="No saved prescriptions yet. Add the medicines you usually give and choose “Save these”."
        />
      )}
      {saving && (
        <SaveTemplateDialog
          open
          onClose={() => setSaving(false)}
          title="Save these medicines"
          description="Saves the medicines with their doses, so you can add them in one step next time."
          onSave={saveCurrent}
        />
      )}

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
          type="button"
          onClick={() => {
            setShowInteractionAlert(false);
            setPendingSubmit(false);
          }}
          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={submitting}
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

