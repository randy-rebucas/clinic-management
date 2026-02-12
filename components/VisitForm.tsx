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
      setTimeout(() => {
        setSelectedPatient(null);
        setPatientSearch('');
      }, 0);
    }

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
      <div className="flex flex-col gap-6">
        {/* Basic Information */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900">Basic Information</h2>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Patient <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-600 mb-2">Search by name, email, phone, or patient code</p>
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  />
                  {showPatientSearch && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {filteredPatients.length > 0 ? (
                        <div className="flex flex-col gap-1 p-1">
                          {filteredPatients.map((patient, index) => (
                            <button
                              key={patient._id}
                              type="button"
                              onClick={() => {
                                selectPatient(patient);
                                setShowPatientSearch(false);
                              }}
                              onMouseEnter={() => setHighlightedIndex(index)}
                              className={`w-full text-left px-4 py-2.5 rounded-lg transition-colors ${highlightedIndex === index
                                ? 'bg-blue-50 hover:bg-blue-100 border border-blue-200'
                                : 'hover:bg-gray-50 border border-transparent'
                                }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold text-sm text-gray-900">{patient.firstName} {patient.lastName}</span>
                                {(patient.email || patient.phone) && (
                                  <span className="text-xs text-gray-600 mt-0.5">
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
                        <div className="p-4 text-center">
                          <p className="text-sm text-gray-600">No patients found</p>
                        </div>
                      ) : (
                        <div className="p-4 text-center">
                          <p className="text-sm text-gray-600">All patients ({patients.length})</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {formData.patient && !selectedPatient && (
                  <p className="text-xs text-red-600 mt-1.5 font-medium">Please select a valid patient from the list</p>
                )}
              </div>
              <div className="flex-1" style={{ minWidth: '200px' }}>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Visit Type <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-600 mb-2">Select the type of visit being documented</p>
                <select
                  value={formData.visitType}
                  onChange={(e) => setFormData({ ...formData, visitType: e.target.value as any })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                >
                  <option value="consultation">Consultation</option>
                  <option value="follow-up">Follow-up</option>
                  <option value="checkup">Checkup</option>
                  <option value="emergency">Emergency</option>
                  <option value="teleconsult">Teleconsult</option>
                </select>
              </div>
            </div>
            <div className="w-full">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Chief Complaint</label>
              <p className="text-xs text-gray-600 mb-2">Primary reason for the visit in the patient&apos;s own words</p>
              <input
                type="text"
                value={formData.chiefComplaint}
                onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
              />
            </div>
          </div>
        </div>

        {/* Tabs for different note formats */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50/50">
            <div className="flex">
              <button
                type="button"
                onClick={() => setActiveTab('soap')}
                className={`px-6 py-3 border-b-2 transition-all relative text-sm font-semibold ${activeTab === 'soap'
                  ? 'text-teal-600 bg-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
              >
                {activeTab === 'soap' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500 to-teal-600"></span>
                )}
                SOAP Notes
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('traditional')}
                className={`px-6 py-3 border-b-2 transition-all relative text-sm font-semibold ${activeTab === 'traditional'
                  ? 'text-teal-600 bg-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
              >
                {activeTab === 'traditional' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500 to-teal-600"></span>
                )}
                Traditional Format
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('treatment')}
                className={`px-6 py-3 border-b-2 transition-all relative text-sm font-semibold ${activeTab === 'treatment'
                  ? 'text-teal-600 bg-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
              >
                {activeTab === 'treatment' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500 to-teal-600"></span>
                )}
                Treatment Plan
              </button>
            </div>
          </div>
          <div className="p-5">
            <>
              {/* SOAP Notes Tab */}
              {activeTab === 'soap' && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      S - Subjective
                    </label>
                    <p className="text-xs text-gray-600 mb-2">Patient&apos;s description of symptoms, history, and concerns</p>
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm resize-y bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      O - Objective
                    </label>
                    <p className="text-xs text-gray-600 mb-2">Measurable observations, vital signs, and physical examination findings</p>
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm resize-y bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      A - Assessment
                    </label>
                    <p className="text-xs text-gray-600 mb-2">Clinical impression, diagnosis, or differential diagnosis</p>
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm resize-y bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      P - Plan
                    </label>
                    <p className="text-xs text-gray-600 mb-2">Treatment plan, medications, procedures, and follow-up instructions</p>
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm resize-y bg-white"
                    />
                  </div>
                </div>
              )}

              {/* Traditional Format Tab */}
              {activeTab === 'traditional' && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">History of Present Illness</label>
                    <p className="text-xs text-gray-600 mb-2">Detailed chronological description of the current illness or problem</p>
                    <textarea
                      value={formData.historyOfPresentIllness}
                      onChange={(e) => setFormData({ ...formData, historyOfPresentIllness: e.target.value })}
                      rows={4}
                      placeholder="Describe the onset, progression, and characteristics of the current problem..."
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm resize-y bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Vitals</label>
                    <p className="text-xs text-gray-600 mb-2">Record patient&apos;s vital signs during the visit</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-2">BP (Blood Pressure)</label>
                        <p className="text-xs text-gray-500 mb-1.5">Format: 120/80</p>
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
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-2">HR (Heart Rate)</label>
                        <p className="text-xs text-gray-500 mb-1.5">Beats per minute</p>
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
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-2">Temp (°C)</label>
                        <p className="text-xs text-gray-500 mb-1.5">Temperature in Celsius</p>
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
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-2">SpO2 (%)</label>
                        <p className="text-xs text-gray-500 mb-1.5">Oxygen saturation</p>
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
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Physical Examination</label>
                    <p className="text-xs text-gray-600 mb-2">Document findings for each body system examined</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-2">General</label>
                        <p className="text-xs text-gray-500 mb-1.5">Overall appearance, alertness, distress level</p>
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
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm resize-y bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-2">HEENT</label>
                        <p className="text-xs text-gray-500 mb-1.5">Head, Eyes, Ears, Nose, Throat</p>
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
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm resize-y bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-2">Cardiovascular</label>
                        <p className="text-xs text-gray-500 mb-1.5">Heart sounds, pulses, peripheral circulation</p>
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
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm resize-y bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-2">Abdomen</label>
                        <p className="text-xs text-gray-500 mb-1.5">Inspection, auscultation, palpation, percussion</p>
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
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm resize-y bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Treatment Plan Tab */}
              {activeTab === 'treatment' && (
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700">Medications</label>
                        <p className="text-xs text-gray-600 mt-1">Prescribed medications with dosage, frequency, and duration</p>
                      </div>
                      <button
                        type="button"
                        className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-semibold flex items-center gap-2 shadow-md"
                        onClick={addMedication}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Medication
                      </button>
                    </div>
                    {formData.treatmentPlan?.medications && formData.treatmentPlan.medications.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        {formData.treatmentPlan.medications.map((med, index) => (
                          <div key={index} className="bg-gradient-to-r from-white to-emerald-50/50 border border-emerald-200 rounded-lg p-4 hover:shadow-md transition-all">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                              <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-gray-700 mb-2">Medication Name</label>
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
                                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-2">Dosage</label>
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
                                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-2">Frequency</label>
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
                                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                                />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-gray-700 mb-2">Duration</label>
                                <div className="flex items-center gap-2">
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
                                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                                  />
                                  <button
                                    type="button"
                                    className="px-3 py-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-semibold border border-red-200 whitespace-nowrap"
                                    onClick={() => removeMedication(index)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                              {med.instructions && (
                                <div className="md:col-span-4">
                                  <label className="block text-xs font-semibold text-gray-700 mb-2">Instructions</label>
                                  <input
                                    type="text"
                                    placeholder="Additional instructions..."
                                    value={med.instructions}
                                    onChange={(e) => {
                                      const medications = [...(formData.treatmentPlan?.medications || [])];
                                      medications[index] = { ...med, instructions: e.target.value };
                                      setFormData({
                                        ...formData,
                                        treatmentPlan: { ...formData.treatmentPlan, medications },
                                      });
                                    }}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-white/50 rounded-lg border-2 border-dashed border-emerald-200">
                        <p className="text-sm text-gray-600 font-medium">No medications added</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Follow-up Date</label>
                    <p className="text-xs text-gray-600 mb-2">Schedule the next appointment or follow-up date</p>
                    <input
                      type="date"
                      value={formData.followUpDate}
                      onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Follow-up Instructions</label>
                    <p className="text-xs text-gray-600 mb-2">Instructions for the patient regarding follow-up care</p>
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm resize-y bg-white"
                    />
                  </div>
                </div>
              )}
            </>
          </div>
        </div>

        {/* Diagnoses Section */}
        <div className="bg-gradient-to-br from-red-50 to-red-100/50 border border-red-200 rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <div className='flex flex-col gap-1 md:flex-row md:items-center md:gap-2'>
                  <h2 className="text-lg font-bold text-gray-900">Diagnoses (ICD-10)</h2>
                  <a
                    href="https://icd.who.int/browse10/2019/en"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded text-xs font-medium transition-colors border border-blue-200"
                    title="Open WHO ICD-10 Browser"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Browse ICD-10
                  </a>
                </div>
                <p className="text-xs text-gray-600 mt-1">Add ICD-10 coded diagnoses for this visit. Mark the primary diagnosis.</p>
              </div>
            </div>
            <button
              type="button"
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-semibold flex items-center gap-2 shadow-md"
              onClick={addDiagnosis}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Diagnosis
            </button>
          </div>
          {formData.diagnoses.length === 0 ? (
            <div className="text-center py-8 bg-white/50 rounded-lg border-2 border-dashed border-red-200">
              <p className="text-sm text-gray-600 font-medium">No diagnoses added. Click &quot;Add Diagnosis&quot; to add one.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {formData.diagnoses.map((diagnosis, index) => (
                <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all">
                  <div className="flex flex-col md:flex-row gap-4 flex-wrap">
                    <div className="flex-1 relative" style={{ minWidth: '200px' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <label className="block text-xs font-semibold text-gray-700">ICD-10 Code</label>

                      </div>
                      <p className="text-xs text-gray-500 mb-1.5">Start typing to search ICD-10 codes</p>
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
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                      />
                      {showIcd10Search && icd10Results.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                          {icd10Results.map((result, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-200"
                              onClick={() => selectIcd10(result.code, result.description)}
                            >
                              <div className="flex flex-col items-start gap-1">
                                <span className="text-sm font-semibold text-gray-900">{result.code}</span>
                                <span className="text-xs text-gray-600">{result.description}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs font-semibold text-gray-700 mb-2">Description</label>
                      <p className="text-xs text-gray-500 mb-1.5">Full diagnosis description</p>
                      <input
                        type="text"
                        value={diagnosis.description || ''}
                        onChange={(e) => updateDiagnosis(index, 'description', e.target.value)}
                        placeholder="Diagnosis description"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                      />
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                        <input type="checkbox"
                          checked={diagnosis.primary || false}
                          onChange={(e) => updateDiagnosis(index, 'primary', e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-xs font-semibold text-blue-700">Primary</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDiagnosis(index)}
                        className="px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-semibold border border-red-200"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Digital Signature */}
        <div className="bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Digital Signature</h3>
          </div>
          {formData.digitalSignature ? (
            <div className="bg-white border border-green-300 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold text-green-700">Digital Signature Added</p>
                  <p className="text-xs text-green-600 font-medium mt-1">Signed by: {formData.digitalSignature.providerName}</p>
                </div>
                <button
                  type="button"
                  className="px-4 py-2 text-green-700 hover:bg-green-50 rounded-lg transition-colors text-sm font-semibold border border-green-200"
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
              className="w-full px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all text-sm font-semibold shadow-md flex items-center justify-center gap-2"
              onClick={() => setShowSignaturePad(true)}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Digital Signature
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
        <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-500 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900">Clinical Images & Attachments</label>
              <p className="text-xs text-gray-600 mt-1">
                Upload clinical images, X-rays, or other documents related to this visit
              </p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              multiple
              onChange={(e) => {
                // Note: File uploads should be handled separately via API
                // This is just a placeholder - actual upload should be done after visit creation
                console.log('Files selected:', e.target.files);
              }}
              className="w-full text-sm px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all bg-white"
            />
            <p className="text-xs text-gray-600 mt-3 font-medium">
              Note: Files can be uploaded after saving the visit from the visit detail page.
            </p>
          </div>
        </div>

        {/* Additional Notes */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gray-500 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900">Additional Notes</label>
              <p className="text-xs text-gray-600 mt-1">Any additional information, observations, or comments about this visit</p>
            </div>
          </div>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
            placeholder="Additional notes..."
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm resize-y bg-white"
          />
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 mt-6">
          {onCancel && (
            <button type="button" className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all text-sm font-semibold shadow-md">
            Save Visit
          </button>
        </div>
      </div>
    </form>
  );
}

