'use client';

import { useState, useEffect, FormEvent } from 'react';
import SignaturePad from './SignaturePad';
import { Button, TextField, Flex, Box, Text, Checkbox, Popover, Select, TextArea, Heading, Separator, Card, Tabs, IconButton } from '@radix-ui/themes';

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
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<{ _id: string; firstName: string; lastName: string } | null>(null);
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
    return fullName.includes(searchLower);
  });

  const selectPatient = (patient: { _id: string; firstName: string; lastName: string }) => {
    setFormData({ ...formData, patient: patient._id });
    setSelectedPatient(patient);
    setPatientSearch(`${patient.firstName} ${patient.lastName}`);
    setShowPatientSearch(false);
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
      <Box style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <Flex direction="column" gap="4" p="4">
          {/* Basic Information */}
          <Box>
            <Heading size="3" mb="3">Basic Information</Heading>
            <Flex direction={{ initial: 'column', md: 'row' }} gap="3" wrap="wrap">
              <Box flexGrow="1" style={{ minWidth: '200px' }}>
                <Text size="2" weight="medium" mb="2" as="div">
                  Patient <Text color="red">*</Text>
                </Text>
            <Popover.Root open={showPatientSearch} onOpenChange={setShowPatientSearch}>
              <Popover.Trigger>
                <TextField.Root size="2" style={{ width: '100%' }}>
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
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Popover.Trigger>
              <Popover.Content style={{ width: 'var(--radix-popover-trigger-width)', maxHeight: '200px', overflowY: 'auto' }}>
                {filteredPatients.length > 0 ? (
                  <Flex direction="column" gap="1">
                    {filteredPatients.map((patient) => (
                      <Button
                        key={patient._id}
                        variant="ghost"
                        onClick={() => {
                          selectPatient(patient);
                          setShowPatientSearch(false);
                        }}
                        style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                      >
                        <Text weight="medium">{patient.firstName} {patient.lastName}</Text>
                      </Button>
                    ))}
                  </Flex>
                ) : patientSearch ? (
                  <Text size="2" color="gray">No patients found</Text>
                ) : (
                  <Text size="2" color="gray">Start typing to search...</Text>
                )}
              </Popover.Content>
            </Popover.Root>
            {formData.patient && !selectedPatient && (
              <Text size="1" color="red" mt="1" as="div">Please select a valid patient from the list</Text>
            )}
          </Box>
          <Box flexGrow="1" style={{ minWidth: '200px' }}>
            <Text size="2" weight="medium" mb="2" as="div">
              Visit Type <Text color="red">*</Text>
            </Text>
            <Select.Root
              size="2"
              value={formData.visitType}
              onValueChange={(value) => setFormData({ ...formData, visitType: value as any })}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="consultation">Consultation</Select.Item>
                <Select.Item value="follow-up">Follow-up</Select.Item>
                <Select.Item value="checkup">Checkup</Select.Item>
                <Select.Item value="emergency">Emergency</Select.Item>
                <Select.Item value="teleconsult">Teleconsult</Select.Item>
              </Select.Content>
            </Select.Root>
          </Box>
          <Box style={{ width: '100%' }}>
            <Text size="2" weight="medium" mb="2" as="div">Chief Complaint</Text>
            <TextField.Root size="2">
              <input
                type="text"
                value={formData.chiefComplaint}
                onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>
        </Flex>
      </Box>

          {/* Tabs for different note formats */}
          <Tabs.Root value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
            <Tabs.List>
              <Tabs.Trigger value="soap">SOAP Notes</Tabs.Trigger>
              <Tabs.Trigger value="traditional">Traditional Format</Tabs.Trigger>
              <Tabs.Trigger value="treatment">Treatment Plan</Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>

          {/* SOAP Notes Tab */}
          {activeTab === 'soap' && (
            <Flex direction="column" gap="3">
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">
                  S - Subjective (Patient&apos;s description of symptoms)
                </Text>
                <TextArea
                  size="2"
                  value={formData.soapNotes?.subjective || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      soapNotes: { ...formData.soapNotes, subjective: e.target.value },
                    })
                  }
                  rows={4}
                  placeholder="Patient reports..."
                />
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">
                  O - Objective (Measurable observations, vitals, physical exam)
                </Text>
                <TextArea
                  size="2"
                  value={formData.soapNotes?.objective || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      soapNotes: { ...formData.soapNotes, objective: e.target.value },
                    })
                  }
                  rows={4}
                  placeholder="Vitals: BP 120/80, HR 72, Temp 37°C. Physical exam findings..."
                />
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">
                  A - Assessment (Clinical impression/diagnosis)
                </Text>
                <TextArea
                  size="2"
                  value={formData.soapNotes?.assessment || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      soapNotes: { ...formData.soapNotes, assessment: e.target.value },
                    })
                  }
                  rows={3}
                  placeholder="Clinical impression..."
                />
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">
                  P - Plan (Treatment plan and follow-up)
                </Text>
                <TextArea
                  size="2"
                  value={formData.soapNotes?.plan || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      soapNotes: { ...formData.soapNotes, plan: e.target.value },
                    })
                  }
                  rows={4}
                  placeholder="Plan: Medications, procedures, follow-up..."
                />
              </Box>
            </Flex>
          )}

          {/* Traditional Format Tab */}
          {activeTab === 'traditional' && (
            <Flex direction="column" gap="3">
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">History of Present Illness</Text>
                <TextArea
                  size="2"
                  value={formData.historyOfPresentIllness}
                  onChange={(e) => setFormData({ ...formData, historyOfPresentIllness: e.target.value })}
                  rows={4}
                />
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">Vitals</Text>
                <Flex gap="3" wrap="wrap">
                  <Box style={{ minWidth: '120px' }}>
                    <Text size="1" color="gray" mb="2" as="div">BP</Text>
                    <TextField.Root size="2">
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
                        style={{ all: 'unset', flex: 1 }}
                      />
                    </TextField.Root>
                  </Box>
                  <Box style={{ minWidth: '120px' }}>
                    <Text size="1" color="gray" mb="2" as="div">HR</Text>
                    <TextField.Root size="2" type="number">
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
                        style={{ all: 'unset', flex: 1 }}
                      />
                    </TextField.Root>
                  </Box>
                  <Box style={{ minWidth: '120px' }}>
                    <Text size="1" color="gray" mb="2" as="div">Temp (°C)</Text>
                    <TextField.Root size="2" type="number">
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
                        style={{ all: 'unset', flex: 1 }}
                      />
                    </TextField.Root>
                  </Box>
                  <Box style={{ minWidth: '120px' }}>
                    <Text size="1" color="gray" mb="2" as="div">SpO2 (%)</Text>
                    <TextField.Root size="2" type="number">
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
                        style={{ all: 'unset', flex: 1 }}
                      />
                    </TextField.Root>
                  </Box>
                </Flex>
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">Physical Examination</Text>
                <Flex gap="3" wrap="wrap">
                  <Box flexGrow="1" style={{ minWidth: '200px' }}>
                    <Text size="1" color="gray" mb="2" as="div">General</Text>
                    <TextArea
                      size="2"
                      value={formData.physicalExam?.general || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          physicalExam: { ...formData.physicalExam, general: e.target.value },
                        })
                      }
                      rows={2}
                    />
                  </Box>
                  <Box flexGrow="1" style={{ minWidth: '200px' }}>
                    <Text size="1" color="gray" mb="2" as="div">HEENT</Text>
                    <TextArea
                      size="2"
                      value={formData.physicalExam?.heent || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          physicalExam: { ...formData.physicalExam, heent: e.target.value },
                        })
                      }
                      rows={2}
                    />
                  </Box>
                  <Box flexGrow="1" style={{ minWidth: '200px' }}>
                    <Text size="1" color="gray" mb="2" as="div">Cardiovascular</Text>
                    <TextArea
                      size="2"
                      value={formData.physicalExam?.cardiovascular || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          physicalExam: { ...formData.physicalExam, cardiovascular: e.target.value },
                        })
                      }
                      rows={2}
                    />
                  </Box>
                  <Box flexGrow="1" style={{ minWidth: '200px' }}>
                    <Text size="1" color="gray" mb="2" as="div">Abdomen</Text>
                    <TextArea
                      size="2"
                      value={formData.physicalExam?.abdomen || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          physicalExam: { ...formData.physicalExam, abdomen: e.target.value },
                        })
                      }
                      rows={2}
                    />
                  </Box>
                </Flex>
              </Box>
            </Flex>
          )}

          {/* Diagnoses Section */}
          <Box>
            <Flex justify="between" align="center" mb="3">
              <Heading size="3">Diagnoses (ICD-10)</Heading>
              <Button
                type="button"
                variant="soft"
                size="1"
                onClick={addDiagnosis}
              >
                + Add Diagnosis
              </Button>
            </Flex>
            {formData.diagnoses.length === 0 ? (
              <Text size="2" color="gray" as="div">No diagnoses added. Click "Add Diagnosis" to add one.</Text>
            ) : (
              <Flex direction="column" gap="2">
                {formData.diagnoses.map((diagnosis, index) => (
                  <Card key={index} variant="surface">
                    <Box p="3">
                      <Flex direction={{ initial: 'column', md: 'row' }} gap="3" wrap="wrap">
                        <Box flexGrow="1" style={{ minWidth: '200px' }} position="relative">
                          <Text size="1" weight="medium" color="gray" mb="2" as="div">ICD-10 Code</Text>
                          <TextField.Root size="2">
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
                              style={{ all: 'unset', flex: 1 }}
                            />
                          </TextField.Root>
                          {showIcd10Search && icd10Results.length > 0 && (
                            <Box
                              position="absolute"
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
                                <Button
                                  key={idx}
                                  type="button"
                                  variant="ghost"
                                  onClick={() => selectIcd10(result.code, result.description)}
                                  style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
                                >
                                  <Flex direction="column" align="start" gap="1">
                                    <Text size="2" weight="medium">{result.code}</Text>
                                    <Text size="1" color="gray">{result.description}</Text>
                                  </Flex>
                                </Button>
                              ))}
                            </Box>
                          )}
                        </Box>
                        <Box flexGrow="1" style={{ minWidth: '200px' }}>
                          <Text size="1" weight="medium" color="gray" mb="2" as="div">Description</Text>
                          <TextField.Root size="2">
                            <input
                              type="text"
                              value={diagnosis.description || ''}
                              onChange={(e) => updateDiagnosis(index, 'description', e.target.value)}
                              placeholder="Diagnosis description"
                              style={{ all: 'unset', flex: 1 }}
                            />
                          </TextField.Root>
                        </Box>
                        <Flex align="end" gap="2">
                          <Flex align="center" gap="2">
                            <Checkbox
                              checked={diagnosis.primary || false}
                              onCheckedChange={(checked) => updateDiagnosis(index, 'primary', checked as boolean)}
                              size="1"
                            />
                            <Text size="1">Primary</Text>
                          </Flex>
                          <Button
                            type="button"
                            onClick={() => removeDiagnosis(index)}
                            variant="soft"
                            color="red"
                            size="1"
                          >
                            Remove
                          </Button>
                        </Flex>
                      </Flex>
                    </Box>
                  </Card>
                ))}
              </Flex>
            )}
          </Box>

          {/* Treatment Plan Tab */}
          {activeTab === 'treatment' && (
            <Flex direction="column" gap="3">
              <Box>
                <Flex justify="between" align="center" mb="2">
                  <Text size="2" weight="medium" as="div">Medications</Text>
                  <Button
                    type="button"
                    variant="soft"
                    size="1"
                    onClick={addMedication}
                  >
                    + Add Medication
                  </Button>
                </Flex>
                {formData.treatmentPlan?.medications && formData.treatmentPlan.medications.length > 0 ? (
                  <Flex direction="column" gap="2">
                    {formData.treatmentPlan.medications.map((med, index) => (
                      <Card key={index} variant="surface">
                        <Box p="2">
                          <Flex gap="2" wrap="wrap">
                            <Box flexGrow="1" style={{ minWidth: '150px' }}>
                              <TextField.Root size="1">
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
                                  style={{ all: 'unset', flex: 1 }}
                                />
                              </TextField.Root>
                            </Box>
                            <Box style={{ minWidth: '100px' }}>
                              <TextField.Root size="1">
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
                                  style={{ all: 'unset', flex: 1 }}
                                />
                              </TextField.Root>
                            </Box>
                            <Box style={{ minWidth: '100px' }}>
                              <TextField.Root size="1">
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
                                  style={{ all: 'unset', flex: 1 }}
                                />
                              </TextField.Root>
                            </Box>
                            <Box style={{ minWidth: '100px' }}>
                              <TextField.Root size="1">
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
                                  style={{ all: 'unset', flex: 1 }}
                                />
                              </TextField.Root>
                            </Box>
                            <IconButton
                              type="button"
                              variant="ghost"
                              color="red"
                              size="1"
                              onClick={() => removeMedication(index)}
                            >
                              Remove
                            </IconButton>
                          </Flex>
                        </Box>
                      </Card>
                    ))}
                  </Flex>
                ) : (
                  <Text size="2" color="gray" as="div">No medications added</Text>
                )}
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">Follow-up Date</Text>
                <TextField.Root size="2" type="date">
                  <input
                    type="date"
                    value={formData.followUpDate}
                    onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">Follow-up Instructions</Text>
                <TextArea
                  size="2"
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
                />
              </Box>
            </Flex>
          )}

          {/* Digital Signature */}
          <Box>
            {formData.digitalSignature ? (
              <Card variant="surface" style={{ backgroundColor: 'var(--green-2)', borderColor: 'var(--green-6)' }}>
                <Flex justify="between" align="center" p="3">
                  <Box>
                    <Text size="2" weight="medium" color="green" as="div">Digital Signature Added</Text>
                    <Text size="1" color="green" as="div">Signed by: {formData.digitalSignature.providerName}</Text>
                  </Box>
                  <Button
                    type="button"
                    variant="ghost"
                    size="1"
                    color="green"
                    onClick={() => {
                      setFormData({ ...formData, digitalSignature: undefined });
                      setShowSignaturePad(true);
                    }}
                  >
                    Change
                  </Button>
                </Flex>
              </Card>
            ) : (
              <Button
                type="button"
                variant="soft"
                size="2"
                onClick={() => setShowSignaturePad(true)}
                style={{ width: '100%' }}
              >
                + Add Digital Signature
              </Button>
            )}
          </Box>

          {/* Signature Pad Modal */}
          {showSignaturePad && (
            <Box
              position="fixed"
              style={{
                inset: 0,
                zIndex: 50,
                overflowY: 'auto',
              }}
            >
              <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: '16px' }}>
                <Box
                  position="fixed"
                  style={{
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    backdropFilter: 'blur(4px)',
                  }}
                  onClick={() => setShowSignaturePad(false)}
                />
                <Box
                  position="relative"
                  style={{
                    zIndex: 10,
                    maxWidth: '672px',
                    width: '100%',
                  }}
                >
                  <Card>
                    <Box p="3">
                      <SignaturePad
                        onSave={handleSignatureSave}
                        onCancel={() => setShowSignaturePad(false)}
                        providerName={providerName}
                      />
                    </Box>
                  </Card>
                </Box>
              </Flex>
            </Box>
          )}

          {/* Clinical Images Upload */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Clinical Images & Attachments</Text>
            <Text size="1" color="gray" mb="3" as="div">
              Upload clinical images, X-rays, or other documents related to this visit
            </Text>
            <Card variant="surface">
              <Box p="3">
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
                <Text size="1" color="gray" mt="2" as="div">
                  Note: Files can be uploaded after saving the visit from the visit detail page.
                </Text>
              </Box>
            </Card>
          </Box>

          {/* Additional Notes */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Additional Notes</Text>
            <TextArea
              size="2"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </Box>

          {/* Form Actions */}
          <Separator />
          <Flex justify="end" gap="2">
            {onCancel && (
              <Button type="button" variant="soft" onClick={onCancel} size="2">
                Cancel
              </Button>
            )}
            <Button type="submit" size="2">
              Save Visit
            </Button>
          </Flex>
        </Flex>
      </Box>
    </form>
  );
}

