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
  patients: Array<{ _id: string; firstName: string; lastName: string }>;
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
      setIcd10Results([]);
    }
  }, [icd10Search]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
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
    <form onSubmit={handleSubmit} className="space-y-6 max-h-[80vh] overflow-y-auto">
      {/* Basic Information */}
      <div className="border-b pb-4">
        <h3 className="text-lg font-medium mb-4">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Patient *</label>
            <select
              required
              value={formData.patient}
              onChange={(e) => setFormData({ ...formData, patient: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Select a patient</option>
              {patients.map((patient) => (
                <option key={patient._id} value={patient._id}>
                  {patient.firstName} {patient.lastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Visit Type *</label>
            <select
              required
              value={formData.visitType}
              onChange={(e) => setFormData({ ...formData, visitType: e.target.value as any })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="consultation">Consultation</option>
              <option value="follow-up">Follow-up</option>
              <option value="checkup">Checkup</option>
              <option value="emergency">Emergency</option>
              <option value="teleconsult">Teleconsult</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Chief Complaint</label>
            <input
              type="text"
              value={formData.chiefComplaint}
              onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Tabs for different note formats */}
      <div className="border-b">
        <nav className="flex -mb-px">
          <button
            type="button"
            onClick={() => setActiveTab('soap')}
            className={`py-2 px-4 text-sm font-medium border-b-2 ${
              activeTab === 'soap'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            SOAP Notes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('traditional')}
            className={`py-2 px-4 text-sm font-medium border-b-2 ${
              activeTab === 'traditional'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Traditional Format
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('treatment')}
            className={`py-2 px-4 text-sm font-medium border-b-2 ${
              activeTab === 'treatment'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Treatment Plan
          </button>
        </nav>
      </div>

      {/* SOAP Notes Tab */}
      {activeTab === 'soap' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              S - Subjective (Patient's description of symptoms)
            </label>
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
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              O - Objective (Measurable observations, vitals, physical exam)
            </label>
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
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              A - Assessment (Clinical impression/diagnosis)
            </label>
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
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              P - Plan (Treatment plan and follow-up)
            </label>
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
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* Traditional Format Tab */}
      {activeTab === 'traditional' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">History of Present Illness</label>
            <textarea
              value={formData.historyOfPresentIllness}
              onChange={(e) => setFormData({ ...formData, historyOfPresentIllness: e.target.value })}
              rows={4}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Vitals</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-600">BP</label>
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600">HR</label>
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600">Temp (°C)</label>
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600">SpO2 (%)</label>
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Physical Examination</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600">General</label>
                <textarea
                  value={formData.physicalExam?.general || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      physicalExam: { ...formData.physicalExam, general: e.target.value },
                    })
                  }
                  rows={2}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600">HEENT</label>
                <textarea
                  value={formData.physicalExam?.heent || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      physicalExam: { ...formData.physicalExam, heent: e.target.value },
                    })
                  }
                  rows={2}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600">Cardiovascular</label>
                <textarea
                  value={formData.physicalExam?.cardiovascular || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      physicalExam: { ...formData.physicalExam, cardiovascular: e.target.value },
                    })
                  }
                  rows={2}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600">Abdomen</label>
                <textarea
                  value={formData.physicalExam?.abdomen || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      physicalExam: { ...formData.physicalExam, abdomen: e.target.value },
                    })
                  }
                  rows={2}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Diagnoses Section */}
      <div className="border-t pt-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Diagnoses (ICD-10)</h3>
          <button
            type="button"
            onClick={addDiagnosis}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            + Add Diagnosis
          </button>
        </div>
        {formData.diagnoses.length === 0 ? (
          <p className="text-sm text-gray-500">No diagnoses added. Click "Add Diagnosis" to add one.</p>
        ) : (
          <div className="space-y-3">
            {formData.diagnoses.map((diagnosis, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">ICD-10 Code</label>
                    <div className="relative">
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
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      />
                      {showIcd10Search && icd10Results.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {icd10Results.map((result, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => selectIcd10(result.code, result.description)}
                              className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                            >
                              <div className="font-medium">{result.code}</div>
                              <div className="text-xs text-gray-500">{result.description}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <input
                      type="text"
                      value={diagnosis.description || ''}
                      onChange={(e) => updateDiagnosis(index, 'description', e.target.value)}
                      placeholder="Diagnosis description"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div className="flex items-end space-x-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={diagnosis.primary || false}
                        onChange={(e) => updateDiagnosis(index, 'primary', e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label className="ml-2 text-xs text-gray-700">Primary</label>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDiagnosis(index)}
                      className="px-2 py-1 text-xs text-red-600 hover:text-red-700"
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

      {/* Treatment Plan Tab */}
      {activeTab === 'treatment' && (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-medium text-gray-700">Medications</h4>
              <button
                type="button"
                onClick={addMedication}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                + Add Medication
              </button>
            </div>
            {formData.treatmentPlan?.medications && formData.treatmentPlan.medications.length > 0 ? (
              <div className="space-y-2">
                {formData.treatmentPlan.medications.map((med, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-3">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                      <input
                        type="text"
                        placeholder="Medication name"
                        value={med.name}
                        onChange={(e) => {
                          const medications = [...(formData.treatmentPlan?.medications || [])];
                          medications[index] = { ...med, name: e.target.value };
                          setFormData({
                            ...formData,
                            treatmentPlan: { ...formData.treatmentPlan, medications },
                          });
                        }}
                        className="text-sm rounded-md border-gray-300 shadow-sm focus:border-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Dosage"
                        value={med.dosage}
                        onChange={(e) => {
                          const medications = [...(formData.treatmentPlan?.medications || [])];
                          medications[index] = { ...med, dosage: e.target.value };
                          setFormData({
                            ...formData,
                            treatmentPlan: { ...formData.treatmentPlan, medications },
                          });
                        }}
                        className="text-sm rounded-md border-gray-300 shadow-sm focus:border-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Frequency"
                        value={med.frequency}
                        onChange={(e) => {
                          const medications = [...(formData.treatmentPlan?.medications || [])];
                          medications[index] = { ...med, frequency: e.target.value };
                          setFormData({
                            ...formData,
                            treatmentPlan: { ...formData.treatmentPlan, medications },
                          });
                        }}
                        className="text-sm rounded-md border-gray-300 shadow-sm focus:border-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Duration"
                        value={med.duration}
                        onChange={(e) => {
                          const medications = [...(formData.treatmentPlan?.medications || [])];
                          medications[index] = { ...med, duration: e.target.value };
                          setFormData({
                            ...formData,
                            treatmentPlan: { ...formData.treatmentPlan, medications },
                          });
                        }}
                        className="text-sm rounded-md border-gray-300 shadow-sm focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeMedication(index)}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No medications added</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Follow-up Date</label>
            <input
              type="date"
              value={formData.followUpDate}
              onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Follow-up Instructions</label>
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
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* Digital Signature */}
      <div className="border-t pt-4">
        {formData.digitalSignature ? (
          <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
            <div>
              <p className="text-sm font-medium text-green-800">Digital Signature Added</p>
              <p className="text-xs text-green-600">Signed by: {formData.digitalSignature.providerName}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormData({ ...formData, digitalSignature: undefined });
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
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSignaturePad(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-2xl w-full z-10">
              <SignaturePad
                onSave={handleSignatureSave}
                onCancel={() => setShowSignaturePad(false)}
                providerName={providerName}
              />
            </div>
          </div>
        </div>
      )}

      {/* Additional Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Additional Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3 pt-4 border-t">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          Save Visit
        </button>
      </div>
    </form>
  );
}

