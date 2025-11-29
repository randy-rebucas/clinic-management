'use client';

import { useState, useEffect, FormEvent } from 'react';
import SignaturePad from './SignaturePad';

interface VisitFormData {
  patient: string;
  visitType: 'consultation' | 'follow-up' | 'checkup' | 'emergency' | 'teleconsult';
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  vitals?: {
    bp?: string;
    hr?: number;
    rr?: number;
    tempC?: number;
    spo2?: number;
    heightCm?: number;
    weightKg?: number;
    bmi?: number;
  };
  physicalExam?: {
    general?: string;
    heent?: string;
    chest?: string;
    cardiovascular?: string;
    abdomen?: string;
    neuro?: string;
    skin?: string;
    other?: string;
  };
  diagnoses: Array<{
    code?: string;
    description?: string;
    primary?: boolean;
  }>;
  soapNotes?: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
  treatmentPlan?: {
    medications?: Array<{
      name: string;
      dosage: string;
      frequency: string;
      duration: string;
      instructions?: string;
    }>;
    procedures?: Array<{
      name: string;
      description?: string;
      scheduledDate?: string;
    }>;
    lifestyle?: Array<{
      category: string;
      instructions: string;
    }>;
    followUp?: {
      date?: string;
      instructions?: string;
    };
  };
  followUpDate?: string;
  notes?: string;
  digitalSignature?: {
    providerName: string;
    signatureData: string;
  };
}

interface VisitFormProps {
  initialData?: Partial<VisitFormData>;
  patients: Array<{ _id: string; firstName: string; lastName: string; email?: string; phone?: string; patientCode?: string }>;
  onSubmit: (data: VisitFormData) => void;
  onCancel?: () => void;
  providerName: string;
}

export default function VisitForm({
  initialData,
  patients,
  onSubmit,
  onCancel,
  providerName,
}: VisitFormProps) {
  const [formData, setFormData] = useState<VisitFormData>({
    patient: initialData?.patient || '',
    visitType: initialData?.visitType || 'consultation',
    chiefComplaint: initialData?.chiefComplaint || '',
    historyOfPresentIllness: initialData?.historyOfPresentIllness || '',
    vitals: initialData?.vitals || {},
    physicalExam: initialData?.physicalExam || {},
    diagnoses: initialData?.diagnoses || [],
    soapNotes: initialData?.soapNotes || {},
    treatmentPlan: initialData?.treatmentPlan || {},
    followUpDate: initialData?.followUpDate || '',
    notes: initialData?.notes || '',
  });

  const [icd10Search, setIcd10Search] = useState('');
  const [icd10Results, setIcd10Results] = useState<Array<{ code: string; description: string }>>([]);
  const [showIcd10Search, setShowIcd10Search] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<{ _id: string; firstName: string; lastName: string; email?: string; phone?: string; patientCode?: string } | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [activeTab, setActiveTab] = useState<'soap' | 'traditional' | 'treatment'>('soap');

  useEffect(() => {
    if (icd10Search.length >= 2) {
      const timer = setTimeout(() => {
        fetch(`/api/icd10/search?q=${encodeURIComponent(icd10Search)}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              setIcd10Results(data.data.slice(0, 10)); // Limit to 10 results
            }
          })
          .catch(console.error);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      // Using setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        setIcd10Results([]);
      }, 0);
    }
  }, [icd10Search]);

  // Sync selected patient when formData.patient changes
  useEffect(() => {
    if (formData.patient) {
      const patient = patients.find((p) => p._id === formData.patient);
      // Using setTimeout to avoid synchronous setState in effect
      const timer = setTimeout(() => {
        setSelectedPatient(patient || null);
        if (patient) {
          setPatientSearch(`${patient.firstName} ${patient.lastName}`);
        }
      }, 0);
      return () => clearTimeout(timer);
    } else {
      setSelectedPatient(null);
      setPatientSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.patient, patients]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.patient-search-container')) {
        setShowPatientSearch(false);
        setHighlightedIndex(-1);
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
    onSubmit(formData);
  };

  const filteredPatients = patients.filter((patient) => {
    if (!patientSearch.trim()) return true;
    const searchLower = patientSearch.toLowerCase();
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    const email = (patient.email || '').toLowerCase();
    const phone = (patient.phone || '').toLowerCase();
    const patientCode = (patient.patientCode || '').toLowerCase();
    return fullName.includes(searchLower) || email.includes(searchLower) || phone.includes(searchLower) || patientCode.includes(searchLower);
  });

  const selectPatient = (patient: { _id: string; firstName: string; lastName: string; email?: string; phone?: string; patientCode?: string }) => {
    setFormData({ ...formData, patient: patient._id });
    setSelectedPatient(patient);
    setPatientSearch(`${patient.firstName} ${patient.lastName}`);
    setShowPatientSearch(false);
    setHighlightedIndex(-1);
  };

  const addDiagnosis = () => {
    setFormData({
      ...formData,
      diagnoses: [...formData.diagnoses, { code: '', description: '', primary: false }],
    });
  };

  const removeDiagnosis = (index: number) => {
    setFormData({
      ...formData,
      diagnoses: formData.diagnoses.filter((_, i) => i !== index),
    });
  };

  const updateDiagnosis = (index: number, field: string, value: any) => {
    const updated = [...formData.diagnoses];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, diagnoses: updated });
  };

  const selectIcd10 = (code: string, description: string) => {
    const lastIndex = formData.diagnoses.length - 1;
    if (lastIndex >= 0) {
      updateDiagnosis(lastIndex, 'code', code);
      updateDiagnosis(lastIndex, 'description', description);
    }
    setShowIcd10Search(false);
    setIcd10Search('');
  };

  const addMedication = () => {
    setFormData({
      ...formData,
      treatmentPlan: {
        ...formData.treatmentPlan,
        medications: [
          ...(formData.treatmentPlan?.medications || []),
          { name: '', dosage: '', frequency: '', duration: '', instructions: '' },
        ],
      },
    });
  };

  const removeMedication = (index: number) => {
    const medications = formData.treatmentPlan?.medications || [];
    setFormData({
      ...formData,
      treatmentPlan: {
        ...formData.treatmentPlan,
        medications: medications.filter((_, i) => i !== index),
      },
    });
  };

  const handleSignatureSave = (signatureData: string) => {
    setFormData({
      ...formData,
      digitalSignature: {
        providerName,
        signatureData,
      },
    });
    setShowSignaturePad(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col gap-4">
          {/* Basic Information */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Basic Information</h2>
            <div className="flex flex-col md:flex-row gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium mb-2">
                  Patient <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">Search by name, email, phone, or patient code</p>
                <div className="relative patient-search-container">
              <input
                type="text"
                required
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value);
                  setShowPatientSearch(true);
                  setHighlightedIndex(-1);
                  if (!e.target.value) {
                    setFormData({ ...formData, patient: '' });
                    setSelectedPatient(null);
                  }
                }}
                onFocus={() => {
                  setShowPatientSearch(true);
                  setHighlightedIndex(-1);
                }}
                onKeyDown={(e) => {
                  if (!showPatientSearch || filteredPatients.length === 0) return;
                  
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightedIndex(prev => 
                      prev < filteredPatients.length - 1 ? prev + 1 : prev
                    );
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
                  } else if (e.key === 'Enter' && highlightedIndex >= 0) {
                    e.preventDefault();
                    selectPatient(filteredPatients[highlightedIndex]);
                  } else if (e.key === 'Escape') {
                    setShowPatientSearch(false);
                    setHighlightedIndex(-1);
                  }
                }}
                placeholder="Type to search patients..."
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              {showPatientSearch && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {filteredPatients.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {filteredPatients.map((patient, index) => (
                      <button
                        key={patient._id}
                        type="button"
                        onClick={() => {
                          selectPatient(patient);
                          setShowPatientSearch(false);
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={`w-full text-left px-3 py-2 rounded transition-colors ${
                          highlightedIndex === index 
                            ? 'bg-blue-50 hover:bg-blue-100' 
                            : 'hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{patient.firstName} {patient.lastName}</span>
                          {(patient.email || patient.phone) && (
                            <span className="text-xs text-gray-500 mt-0.5">
                              {patient.email && patient.phone 
                                ? `${patient.email} • ${patient.phone}`
                                : patient.email || patient.phone}
                              {patient.patientCode && ` • ${patient.patientCode}`}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : patientSearch.trim() ? (
                  <div className="p-2">
                    <p className="text-sm text-gray-500">No patients found</p>
                  </div>
                ) : (
                  <div className="p-2">
                    <p className="text-sm text-gray-500">All patients ({patients.length})</p>
                  </div>
                )}
              </div>
              )}
            </div>
            {formData.patient && !selectedPatient && (
              <p className="text-xs text-red-600 mt-1">Please select a valid patient from the list</p>
            )}
          </div>
          <div className="flex-1" style={{ minWidth: '200px' }}>
            <label className="block text-sm font-medium mb-2">
              Visit Type <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">Select the type of visit being documented</p>
            <select
              value={formData.visitType}
              onChange={(e) => setFormData({ ...formData, visitType: e.target.value as any })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="consultation">Consultation</option>
              <option value="follow-up">Follow-up</option>
              <option value="checkup">Checkup</option>
              <option value="emergency">Emergency</option>
              <option value="teleconsult">Teleconsult</option>
            </select>
          </div>
          <div className="w-full">
            <label className="block text-sm font-medium mb-2">Chief Complaint</label>
            <p className="text-xs text-gray-500 mb-2">Primary reason for the visit in the patient&apos;s own words</p>
            <input
              type="text"
              value={formData.chiefComplaint}
              onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>
      </div>

          {/* Tabs for different note formats */}
          <div className="border-b border-gray-200 mb-4">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('soap')}
                className={`px-4 py-2 border-b-2 transition-colors ${
                  activeTab === 'soap'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                SOAP Notes
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('traditional')}
                className={`px-4 py-2 border-b-2 transition-colors ${
                  activeTab === 'traditional'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                Traditional Format
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('treatment')}
                className={`px-4 py-2 border-b-2 transition-colors ${
                  activeTab === 'treatment'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                Treatment Plan
              </button>
            </div>
          </div>

          {/* SOAP Notes Tab */}
          {activeTab === 'soap' && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-medium mb-2">
                  S - Subjective
                </label>
                <p className="text-xs text-gray-500 mb-2">Patient&apos;s description of symptoms, history, and concerns</p>
                <textarea
                  value={formData.soapNotes?.subjective || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      soapNotes: { ...formData.soapNotes, subjective: e.target.value },
                    })
                  }
                  rows={4}
                  placeholder="Patient reports..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  O - Objective
                </label>
                <p className="text-xs text-gray-500 mb-2">Measurable observations, vital signs, and physical examination findings</p>
                <textarea
                  value={formData.soapNotes?.objective || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      soapNotes: { ...formData.soapNotes, objective: e.target.value },
                    })
                  }
                  rows={4}
                  placeholder="Vitals: BP 120/80, HR 72, Temp 37°C. Physical exam findings..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  A - Assessment
                </label>
                <p className="text-xs text-gray-500 mb-2">Clinical impression, diagnosis, or differential diagnosis</p>
                <textarea
                  value={formData.soapNotes?.assessment || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      soapNotes: { ...formData.soapNotes, assessment: e.target.value },
                    })
                  }
                  rows={3}
                  placeholder="Clinical impression..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  P - Plan
                </label>
                <p className="text-xs text-gray-500 mb-2">Treatment plan, medications, procedures, and follow-up instructions</p>
                <textarea
                  value={formData.soapNotes?.plan || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      soapNotes: { ...formData.soapNotes, plan: e.target.value },
                    })
                  }
                  rows={4}
                  placeholder="Plan: Medications, procedures, follow-up..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y"
                />
              </div>
            </div>
          )}

          {/* Traditional Format Tab */}
          {activeTab === 'traditional' && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-medium mb-2">History of Present Illness</label>
                <p className="text-xs text-gray-500 mb-2">Detailed chronological description of the current illness or problem</p>
                <textarea
                  value={formData.historyOfPresentIllness}
                  onChange={(e) => setFormData({ ...formData, historyOfPresentIllness: e.target.value })}
                  rows={4}
                  placeholder="Describe the onset, progression, and characteristics of the current problem..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Vitals</label>
                <p className="text-xs text-gray-500 mb-2">Record patient&apos;s vital signs during the visit</p>
                <div className="flex gap-3 flex-wrap">
                  <div className="min-w-[120px]">
                    <label className="block text-xs text-gray-500 mb-2">BP (Blood Pressure)</label>
                    <p className="text-xs text-gray-400 mb-1">Format: 120/80</p>
                    <input
                        type="text"
                        value={formData.vitals?.bp || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            vitals: { ...formData.vitals, bp: e.target.value },
                          })
                        }
                        placeholder="120/80"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                  </div>
                  <div className="min-w-[120px]">
                    <label className="block text-xs text-gray-500 mb-2">HR (Heart Rate)</label>
                    <p className="text-xs text-gray-400 mb-1">Beats per minute</p>
                    <input
                        type="number"
                        value={formData.vitals?.hr || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            vitals: { ...formData.vitals, hr: parseInt(e.target.value) || undefined },
                          })
                        }
                        placeholder="72"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                  </div>
                  <div className="min-w-[120px]">
                    <label className="block text-xs text-gray-500 mb-2">Temp (°C)</label>
                    <p className="text-xs text-gray-400 mb-1">Temperature in Celsius</p>
                    <input
                        type="number"
                        step="0.1"
                        value={formData.vitals?.tempC || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            vitals: { ...formData.vitals, tempC: parseFloat(e.target.value) || undefined },
                          })
                        }
                        placeholder="37.0"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                  </div>
                  <div className="min-w-[120px]">
                    <label className="block text-xs text-gray-500 mb-2">SpO2 (%)</label>
                    <p className="text-xs text-gray-400 mb-1">Oxygen saturation</p>
                    <input
                        type="number"
                        value={formData.vitals?.spo2 || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            vitals: { ...formData.vitals, spo2: parseInt(e.target.value) || undefined },
                          })
                        }
                        placeholder="98"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Physical Examination</label>
                <p className="text-xs text-gray-500 mb-2">Document findings for each body system examined</p>
                <div className="flex gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-gray-500 mb-2">General</label>
                    <p className="text-xs text-gray-400 mb-1">Overall appearance, alertness, distress level</p>
                    <textarea
                      value={formData.physicalExam?.general || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          physicalExam: { ...formData.physicalExam, general: e.target.value },
                        })
                      }
                      rows={2}
                      placeholder="General appearance..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y"
                    />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-gray-500 mb-2">HEENT</label>
                    <p className="text-xs text-gray-400 mb-1">Head, Eyes, Ears, Nose, Throat</p>
                    <textarea
                      value={formData.physicalExam?.heent || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          physicalExam: { ...formData.physicalExam, heent: e.target.value },
                        })
                      }
                      rows={2}
                      placeholder="HEENT findings..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y"
                    />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-gray-500 mb-2">Cardiovascular</label>
                    <p className="text-xs text-gray-400 mb-1">Heart sounds, pulses, peripheral circulation</p>
                    <textarea
                      value={formData.physicalExam?.cardiovascular || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          physicalExam: { ...formData.physicalExam, cardiovascular: e.target.value },
                        })
                      }
                      rows={2}
                      placeholder="Cardiovascular findings..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y"
                    />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-gray-500 mb-2">Abdomen</label>
                    <p className="text-xs text-gray-400 mb-1">Inspection, auscultation, palpation, percussion</p>
                    <textarea
                      value={formData.physicalExam?.abdomen || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          physicalExam: { ...formData.physicalExam, abdomen: e.target.value },
                        })
                      }
                      rows={2}
                      placeholder="Abdominal findings..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Diagnoses Section */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <div>
                <h2 className="text-lg font-semibold">Diagnoses (ICD-10)</h2>
                <p className="text-xs text-gray-500 mt-1">Add ICD-10 coded diagnoses for this visit. Mark the primary diagnosis.</p>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm"
                onClick={addDiagnosis}
              >
                + Add Diagnosis
              </button>
            </div>
            {formData.diagnoses.length === 0 ? (
              <p className="text-sm text-gray-500">No diagnoses added. Click "Add Diagnosis" to add one.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {formData.diagnoses.map((diagnosis, index) => (
                  <div key={index} className="bg-white border border-gray-200 rounded-lg">
                    <div className="p-3">
                      <div className="flex flex-col md:flex-row gap-3 flex-wrap">
                        <div className="flex-1 relative" style={{ minWidth: '200px' }}>
                          <label className="block text-xs font-medium text-gray-500 mb-2">ICD-10 Code</label>
                          <p className="text-xs text-gray-400 mb-1">Start typing to search ICD-10 codes</p>
                          <input
                              type="text"
                              value={diagnosis.code || ''}
                              onChange={(e) => {
                                updateDiagnosis(index, 'code', e.target.value);
                                if (e.target.value.length >= 2) {
                                  setIcd10Search(e.target.value);
                                  setShowIcd10Search(true);
                                }
                              }}
                              placeholder="E.g., E11.9"
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                          {showIcd10Search && icd10Results.length > 0 && (
                            <div
                              className="absolute"
                              style={{
                                zIndex: 10,
                                marginTop: '4px',
                                width: '100%',
                                backgroundColor: 'white',
                                border: '1px solid var(--gray-6)',
                                borderRadius: '6px',
                                boxShadow: 'var(--shadow-4)',
                                maxHeight: '192px',
                                overflowY: 'auto',
                              }}
                            >
                              {icd10Results.map((result, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded transition-colors"
                                  onClick={() => selectIcd10(result.code, result.description)}
                                >
                                  <div className="flex flex-col items-start gap-1">
                                    <span className="text-sm font-medium">{result.code}</span>
                                    <span className="text-xs text-gray-500">{result.description}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-[200px]">
                          <label className="block text-xs font-medium text-gray-500 mb-2">Description</label>
                          <p className="text-xs text-gray-400 mb-1">Full diagnosis description</p>
                          <input
                              type="text"
                              value={diagnosis.description || ''}
                              onChange={(e) => updateDiagnosis(index, 'description', e.target.value)}
                              placeholder="Diagnosis description"
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex items-center gap-2">
                            <input type="checkbox"
                              checked={diagnosis.primary || false}
                              onChange={(e) => updateDiagnosis(index, 'primary', e.target.checked)}
                            />
                            <span className="text-xs">Primary</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDiagnosis(index)}
                            className="px-3 py-1.5 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Treatment Plan Tab */}
          {activeTab === 'treatment' && (
            <div className="flex flex-col gap-3">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <label className="block text-sm font-medium">Medications</label>
                    <p className="text-xs text-gray-500 mt-1">Prescribed medications with dosage, frequency, and duration</p>
                  </div>
                  <button
                    type="button"
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm"
                    onClick={addMedication}
                  >
                    + Add Medication
                  </button>
                </div>
                {formData.treatmentPlan?.medications && formData.treatmentPlan.medications.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {formData.treatmentPlan.medications.map((med, index) => (
                      <div key={index} className="bg-white border border-gray-200 rounded-lg">
                        <div className="p-2">
                          <div className="flex gap-2 flex-wrap">
                            <div className="flex-1 min-w-[150px]">
                              <label className="block text-xs text-gray-500 mb-1">Medication Name</label>
                              <input
                                  type="text"
                                  placeholder="e.g., Amoxicillin"
                                  value={med.name}
                                  onChange={(e) => {
                                    const medications = [...(formData.treatmentPlan?.medications || [])];
                                    medications[index] = { ...med, name: e.target.value };
                                    setFormData({
                                      ...formData,
                                      treatmentPlan: { ...formData.treatmentPlan, medications },
                                    });
                                  }}
                                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                                />
                            </div>
                            <div className="min-w-[100px]">
                              <label className="block text-xs text-gray-500 mb-1">Dosage</label>
                              <input
                                  type="text"
                                  placeholder="e.g., 500mg"
                                  value={med.dosage}
                                  onChange={(e) => {
                                    const medications = [...(formData.treatmentPlan?.medications || [])];
                                    medications[index] = { ...med, dosage: e.target.value };
                                    setFormData({
                                      ...formData,
                                      treatmentPlan: { ...formData.treatmentPlan, medications },
                                    });
                                  }}
                                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                                />
                            </div>
                            <div className="min-w-[100px]">
                              <label className="block text-xs text-gray-500 mb-1">Frequency</label>
                              <input
                                  type="text"
                                  placeholder="e.g., 3x daily"
                                  value={med.frequency}
                                  onChange={(e) => {
                                    const medications = [...(formData.treatmentPlan?.medications || [])];
                                    medications[index] = { ...med, frequency: e.target.value };
                                    setFormData({
                                      ...formData,
                                      treatmentPlan: { ...formData.treatmentPlan, medications },
                                    });
                                  }}
                                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                                />
                            </div>
                            <div className="min-w-[100px]">
                              <label className="block text-xs text-gray-500 mb-1">Duration</label>
                              <input
                                  type="text"
                                  placeholder="e.g., 7 days"
                                  value={med.duration}
                                  onChange={(e) => {
                                    const medications = [...(formData.treatmentPlan?.medications || [])];
                                    medications[index] = { ...med, duration: e.target.value };
                                    setFormData({
                                      ...formData,
                                      treatmentPlan: { ...formData.treatmentPlan, medications },
                                    });
                                  }}
                                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                                />
                            </div>
                            <button
                              type="button"
                              className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded transition-colors text-sm"
                              onClick={() => removeMedication(index)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No medications added</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Follow-up Date</label>
                <p className="text-xs text-gray-500 mb-2">Schedule the next appointment or follow-up date</p>
                <input
                    type="date"
                    value={formData.followUpDate}
                    onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Follow-up Instructions</label>
                <p className="text-xs text-gray-500 mb-2">Instructions for the patient regarding follow-up care</p>
                <textarea
                  value={formData.treatmentPlan?.followUp?.instructions || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      treatmentPlan: {
                        ...formData.treatmentPlan,
                        followUp: {
                          ...formData.treatmentPlan?.followUp,
                          instructions: e.target.value,
                          date: formData.followUpDate,
                        },
                      },
                    })
                  }
                  rows={3}
                  placeholder="Follow-up instructions..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y"
                />
              </div>
            </div>
          )}

          {/* Digital Signature */}
          <div>
            {formData.digitalSignature ? (
              <div className="bg-green-50 border border-green-300 rounded-lg p-3">
                <div className="flex justify-between items-center p-3">
                  <div>
                    <p className="text-sm font-medium text-green-700">Digital Signature Added</p>
                    <p className="text-xs text-green-600">Signed by: {formData.digitalSignature.providerName}</p>
                  </div>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-green-600 hover:bg-green-50 rounded transition-colors text-sm"
                    onClick={() => {
                      setFormData({ ...formData, digitalSignature: undefined });
                      setShowSignaturePad(true);
                    }}
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm"
                onClick={() => setShowSignaturePad(true)}
                style={{ width: '100%' }}
              >
                + Add Digital Signature
              </button>
            )}
          </div>

          {/* Signature Pad Modal */}
          {showSignaturePad && (
            <div
              className="fixed"
              style={{
                inset: 0,
                zIndex: 50,
                overflowY: 'auto',
              }}
            >
              <div className="flex items-center justify-center" style={{ minHeight: '100vh', padding: '16px' }}>
                <div
                  className="fixed"
                  style={{
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    backdropFilter: 'blur(4px)',
                  }}
                  onClick={() => setShowSignaturePad(false)}
                />
                <div
                  className="relative"
                  style={{
                    zIndex: 10,
                    maxWidth: '672px',
                    width: '100%',
                  }}
                >
                  <div>
                    <div className="p-3">
                      <SignaturePad
                        onSave={handleSignatureSave}
                        onCancel={() => setShowSignaturePad(false)}
                        providerName={providerName}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Clinical Images Upload */}
          <div>
            <label className="block text-sm font-medium mb-2">Clinical Images & Attachments</label>
            <p className="text-xs text-gray-500 mb-3">
              Upload clinical images, X-rays, or other documents related to this visit
            </p>
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-3">
                <input
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  multiple
                  onChange={(e) => {
                    // Note: File uploads should be handled separately via API
                    // This is just a placeholder - actual upload should be done after visit creation
                    console.log('Files selected:', e.target.files);
                  }}
                  style={{
                    width: '100%',
                    fontSize: 'var(--font-size-2)',
                  }}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Note: Files can be uploaded after saving the visit from the visit detail page.
                </p>
              </div>
            </div>
          </div>

          {/* Additional Notes */}
          <div>
            <label className="block text-sm font-medium mb-2">Additional Notes</label>
            <p className="text-xs text-gray-500 mb-2">Any additional information, observations, or comments about this visit</p>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Additional notes..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y"
            />
          </div>

          {/* Form Actions */}
          <hr />
          <div className="flex justify-end gap-2">
            {onCancel && (
              <button type="button" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
              Save Visit
            </button>
          </div>
        </div>
    </form>
  );
}

