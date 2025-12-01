'use client';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';

import { useState, FormEvent } from 'react';

interface AllergyEntry {
  substance: string;
  reaction: string;
  severity: string;
}

interface PreExistingCondition {
  condition: string;
  diagnosisDate?: string;
  status: 'active' | 'resolved' | 'chronic';
  notes?: string;
}

interface PatientFormData {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex?: 'male' | 'female' | 'other' | 'unknown';
  civilStatus?: string;
  nationality?: string;
  occupation?: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string;
  };
  identifiers?: {
    philHealth?: string;
    govId?: string;
  };
  medicalHistory: string;
  preExistingConditions: PreExistingCondition[];
  allergies: AllergyEntry[];
  familyHistory: Record<string, string>;
}

interface PatientFormProps {
  initialData?: Partial<PatientFormData>;
  onSubmit: (data: PatientFormData) => void;
  onCancel?: () => void;
}

export default function PatientForm({ initialData, onSubmit, onCancel }: PatientFormProps) {
  // Parse initial allergies - support both string array and structured objects
  const parseInitialAllergies = (): AllergyEntry[] => {
    if (!initialData?.allergies) return [];
    const allergies: any = initialData.allergies;
    if (typeof allergies === 'string') {
      // Legacy format: comma-separated string
      return allergies
        .split(',')
        .map((a: string) => a.trim())
        .filter((a: string) => a.length > 0)
        .map((substance: string) => ({ substance, reaction: '', severity: 'unknown' }));
    }
    if (Array.isArray(allergies)) {
      return allergies.map((allergy: any) => {
        if (typeof allergy === 'string') {
          return { substance: allergy, reaction: '', severity: 'unknown' };
        }
        return {
          substance: allergy.substance || '',
          reaction: allergy.reaction || '',
          severity: allergy.severity || 'unknown',
        };
      });
    }
    return [];
  };

  // Format dateOfBirth for input field
  const formatDateForInput = (date: any): string => {
    if (!date) return '';
    if (typeof date === 'string') {
      // If it's an ISO string, extract just the date part
      return date.split('T')[0];
    }
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }
    return '';
  };

  const [formData, setFormData] = useState<PatientFormData>({
    firstName: initialData?.firstName || '',
    middleName: initialData?.middleName || '',
    lastName: initialData?.lastName || '',
    suffix: initialData?.suffix || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    dateOfBirth: formatDateForInput(initialData?.dateOfBirth),
    sex: initialData?.sex || 'unknown',
    civilStatus: initialData?.civilStatus || '',
    nationality: initialData?.nationality || '',
    occupation: initialData?.occupation || '',
    address: {
      street: initialData?.address?.street || '',
      city: initialData?.address?.city || '',
      state: initialData?.address?.state || '',
      zipCode: initialData?.address?.zipCode || '',
    },
    emergencyContact: {
      name: initialData?.emergencyContact?.name || '',
      phone: initialData?.emergencyContact?.phone || '',
      relationship: initialData?.emergencyContact?.relationship || '',
    },
    identifiers: initialData?.identifiers ? {
      philHealth: initialData.identifiers.philHealth || '',
      govId: initialData.identifiers.govId || '',
    } : {
      philHealth: '',
      govId: '',
    },
    medicalHistory: initialData?.medicalHistory || '',
    preExistingConditions: (initialData as any)?.preExistingConditions || [],
    allergies: parseInitialAllergies(),
    familyHistory: (initialData as any)?.familyHistory || {},
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Filter out empty allergies and conditions
    const filteredAllergies = formData.allergies.filter((a) => a.substance.trim().length > 0);
    const filteredConditions = formData.preExistingConditions.filter((c) => c.condition.trim().length > 0);
    // Filter out empty family history entries
    const filteredFamilyHistory = Object.fromEntries(
      Object.entries(formData.familyHistory).filter(([condition, relation]) => condition.trim().length > 0)
    );
    onSubmit({ 
      ...formData, 
      allergies: filteredAllergies,
      preExistingConditions: filteredConditions,
      familyHistory: filteredFamilyHistory,
    });
  };

  const addAllergy = () => {
    setFormData({
      ...formData,
      allergies: [...formData.allergies, { substance: '', reaction: '', severity: 'unknown' }],
    });
  };

  const removeAllergy = (index: number) => {
    setFormData({
      ...formData,
      allergies: formData.allergies.filter((_, i) => i !== index),
    });
  };

  const updateAllergy = (index: number, field: keyof AllergyEntry, value: string) => {
    const updated = [...formData.allergies];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, allergies: updated });
  };

  return (
    <div className="max-h-[80vh] overflow-y-auto pr-1">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4">
      {/* Personal Information */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="p-3">
          <h3 className="text-base font-bold mb-3">Personal Information</h3>
          <div className="flex flex-col gap-3">
            {/* Name Fields */}
            <div className="flex flex-col md:flex-row gap-2 flex-wrap">
              <div className="flex-1 min-w-[150px]">
                <Label className="block text-xs font-medium mb-1" htmlFor="firstName">First Name <span className="text-red-500">*</span></Label>
                <Input id="firstName" required value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
              </div>
              <div className="flex-1 min-w-[150px]">
                <Label className="block text-xs font-medium mb-1" htmlFor="middleName">Middle Name</Label>
                <Input id="middleName" value={formData.middleName} onChange={e => setFormData({ ...formData, middleName: e.target.value })} />
              </div>
              <div className="flex-1 min-w-[150px]">
                <Label className="block text-xs font-medium mb-1" htmlFor="lastName">Last Name <span className="text-red-500">*</span></Label>
                <Input id="lastName" required value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} />
              </div>
              <div className="flex-1 min-w-[150px]">
                <Label className="block text-xs font-medium mb-1" htmlFor="suffix">Suffix</Label>
                <Input id="suffix" value={formData.suffix} onChange={e => setFormData({ ...formData, suffix: e.target.value })} placeholder="Jr., Sr., III" />
              </div>
            </div>
            
            {/* Demographics */}
            <div className="flex flex-col md:flex-row gap-2 flex-wrap">
              <div className="flex-1 min-w-[150px]">
                <Label className="block text-xs font-medium mb-1" htmlFor="dateOfBirth">Date of Birth <span className="text-red-500">*</span></Label>
                <Input id="dateOfBirth" type="date" required value={formData.dateOfBirth} onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })} />
              </div>
              <div className="flex-1 min-w-[150px]">
                <Label className="block text-xs font-medium mb-1" htmlFor="sex">Sex</Label>
                <Select value={formData.sex} onValueChange={value => setFormData({ ...formData, sex: value as any })}>
                  <SelectItem value="unknown">Unknown</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </Select>
              </div>
              <div className="flex-1 min-w-[150px]">
                <Label className="block text-xs font-medium mb-1" htmlFor="civilStatus">Civil Status</Label>
                <Input id="civilStatus" value={formData.civilStatus} onChange={e => setFormData({ ...formData, civilStatus: e.target.value })} placeholder="Single, Married, Divorced, etc." />
              </div>
              <div className="flex-1 min-w-[150px]">
                <Label className="block text-xs font-medium mb-1" htmlFor="nationality">Nationality</Label>
                <Input id="nationality" value={formData.nationality} onChange={e => setFormData({ ...formData, nationality: e.target.value })} />
              </div>
              <div className="flex-1 min-w-[150px]">
                <Label className="block text-xs font-medium mb-1" htmlFor="occupation">Occupation</Label>
                <Input id="occupation" value={formData.occupation} onChange={e => setFormData({ ...formData, occupation: e.target.value })} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contact & Address Information */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="p-3">
          <h3 className="text-base font-bold mb-3">Contact & Address</h3>
          <div className="flex flex-col gap-3">
            {/* Contact Info */}
            <div className="flex flex-col md:flex-row gap-2">
              <div className="flex-1">
                <Label className="block text-xs font-medium mb-1" htmlFor="email">Email <span className="text-red-500">*</span></Label>
                <Input id="email" type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="flex-1">
                <Label className="block text-xs font-medium mb-1" htmlFor="phone">Phone <span className="text-red-500">*</span></Label>
                <Input id="phone" type="tel" required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
              </div>
            </div>

            {/* Address Fields */}
            <div className="pt-3" style={{ borderTop: '1px solid var(--gray-6)' }}>
              <span className="font-medium mb-2 block">Address</span>
              <div className="flex flex-col gap-2">
                <div>
                  <Label className="font-medium mb-1 block" htmlFor="street">Street Address <span className="text-red-500">*</span></Label>
                  <Input id="street" required value={formData.address.street} onChange={e => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })} />
                </div>
                <div className="flex flex-col md:flex-row gap-2">
                  <div className="flex-1">
                    <Label className="font-medium mb-1 block" htmlFor="city">City <span className="text-red-500">*</span></Label>
                    <Input id="city" required value={formData.address.city} onChange={e => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })} />
                  </div>
                  <div className="flex-1">
                    <Label className="font-medium mb-1 block" htmlFor="state">State <span className="text-red-500">*</span></Label>
                    <Input id="state" required value={formData.address.state} onChange={e => setFormData({ ...formData, address: { ...formData.address, state: e.target.value } })} />
                  </div>
                  <div className="flex-1">
                    <Label className="font-medium mb-1 block" htmlFor="zipCode">Zip Code <span className="text-red-500">*</span></Label>
                    <Input id="zipCode" required value={formData.address.zipCode} onChange={e => setFormData({ ...formData, address: { ...formData.address, zipCode: e.target.value } })} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Contact & Identifiers */}
      <div>
        <div className="p-3">
          <span className="font-bold mb-3 block">Emergency Contact & Identifiers</span>
          <div className="flex flex-col gap-3">
            {/* Emergency Contact */}
            <div>
              <span className="font-medium mb-2 block">Emergency Contact</span>
              <div className="flex flex-col md:flex-row gap-2">
                <div className="flex-1">
                    <Label className="font-medium mb-1 block" htmlFor="emergencyName">Name <span className="text-red-500">*</span></Label>
                    <Input id="emergencyName" required value={formData.emergencyContact.name} onChange={e => setFormData({ ...formData, emergencyContact: { ...formData.emergencyContact, name: e.target.value } })} />
                </div>
                <div className="flex-1">
                    <Label className="font-medium mb-1 block" htmlFor="emergencyPhone">Phone <span className="text-red-500">*</span></Label>
                    <Input id="emergencyPhone" type="tel" required value={formData.emergencyContact.phone} onChange={e => setFormData({ ...formData, emergencyContact: { ...formData.emergencyContact, phone: e.target.value } })} />
                </div>
                <div className="flex-1">
                    <Label className="font-medium mb-1 block" htmlFor="emergencyRelationship">Relationship <span className="text-red-500">*</span></Label>
                    <Input id="emergencyRelationship" required value={formData.emergencyContact.relationship} onChange={e => setFormData({ ...formData, emergencyContact: { ...formData.emergencyContact, relationship: e.target.value } })} />
                </div>
              </div>
            </div>

            {/* Identifiers */}
            <div className="pt-3" style={{ borderTop: '1px solid var(--gray-6)' }}>
              <span className="font-medium mb-2 block">Identifiers</span>
              <div className="flex flex-col md:flex-row gap-2">
                <div className="flex-1">
                  <Label className="font-medium mb-1 block" htmlFor="philHealth">PhilHealth ID</Label>
                  <Input id="philHealth" value={formData.identifiers?.philHealth || ''} onChange={e => setFormData({ ...formData, identifiers: { ...formData.identifiers, philHealth: e.target.value } })} />
                </div>
                <div className="flex-1">
                  <Label className="font-medium mb-1 block" htmlFor="govId">Government ID</Label>
                  <Input id="govId" value={formData.identifiers?.govId || ''} onChange={e => setFormData({ ...formData, identifiers: { ...formData.identifiers, govId: e.target.value } })} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Medical Information */}
      <div>
        <div className="p-3">
          <span className="font-bold mb-3 block">Medical Information</span>
          <div className="flex flex-col gap-3">
            <div>
              <span className="font-medium mb-1 block">Medical History</span>
              <textarea
                value={formData.medicalHistory}
                onChange={(e) => setFormData({ ...formData, medicalHistory: e.target.value })}
                rows={3}
                placeholder="Enter patient's medical history, previous surgeries, chronic conditions, etc."
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            {/* Allergies */}
            <div>
              <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium">Allergies</span>
                <button type="button" onClick={addAllergy} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-medium transition-colors">
                  Add
                </button>
              </div>
              {formData.allergies.length === 0 ? (
                <div className="p-3" style={{ textAlign: 'center', border: '1px dashed var(--gray-6)', borderRadius: 'var(--radius-2)' }}>
                  <span className="text-xs text-gray-500">No allergies recorded.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {formData.allergies.map((allergy, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-2">
                      <div className="flex flex-col md:flex-row gap-2 flex-wrap">
                        <div className="flex-1 min-w-[150px]">
                          <span className="block text-xs font-medium mb-1">Substance</span>
                          <input
                              value={allergy.substance}
                              onChange={(e) => updateAllergy(index, 'substance', e.target.value)}
                              placeholder="e.g., Penicillin"
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div className="flex-1 min-w-[150px]">
                          <span className="block text-xs font-medium mb-1">Reaction</span>
                          <input
                              value={allergy.reaction}
                              onChange={(e) => updateAllergy(index, 'reaction', e.target.value)}
                              placeholder="e.g., Rash"
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div className="flex-1 min-w-[150px]">
                          <span className="block text-xs font-medium mb-1">Severity</span>
                          <select
                  value={allergy.severity}
                  onChange={(e) => updateAllergy(index, 'severity', e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="unknown">Unknown</option>
                  <option value="mild">Mild</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                  <option value="life-threatening">Life-threatening</option>
                </select>
                        </div>
                        <div className="flex-shrink-0" style={{ display: 'flex', alignItems: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => removeAllergy(index)}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-md font-medium transition-colors"
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
          
            {/* Pre-existing Conditions */}
            <div>
              <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium">Pre-existing Conditions</span>
                <button
                  type="button"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      preExistingConditions: [
                        ...formData.preExistingConditions,
                        { condition: '', status: 'active' },
                      ],
                    });
                  }}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-medium transition-colors"
                >
                  Add
                </button>
              </div>
              {formData.preExistingConditions.length === 0 ? (
                <div className="p-3" style={{ textAlign: 'center', border: '1px dashed var(--gray-6)', borderRadius: 'var(--radius-2)' }}>
                  <span className="text-xs text-gray-500">No pre-existing conditions recorded.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {formData.preExistingConditions.map((condition, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-2">
                      <div className="flex flex-col md:flex-row gap-2 flex-wrap">
                        <div className="flex-[2] min-w-[200px]">
                          <span className="block text-xs font-medium mb-1">Condition</span>
                          <input
                              value={condition.condition}
                              onChange={(e) => {
                                const updated = [...formData.preExistingConditions];
                                updated[index] = { ...updated[index], condition: e.target.value };
                                setFormData({ ...formData, preExistingConditions: updated });
                              }}
                              placeholder="e.g., Diabetes"
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div className="flex-1 min-w-[120px]">
                          <span className="block text-xs font-medium mb-1">Status</span>
                          <select
                  value={condition.status}
                  onChange={(e) => {
                              const updated = [...formData.preExistingConditions];
                              updated[index] = { ...updated[index], status: e.target.value as any };
                              setFormData({ ...formData, preExistingConditions: updated });
                            }}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        >
                          <option value="active">Active</option>
                          <option value="chronic">Chronic</option>
                          <option value="resolved">Resolved</option>
                        </select>
                        </div>
                        <div className="flex-1 min-w-[120px]">
                          <span className="block text-xs font-medium mb-1">Date</span>
                  <input
                    type="date"
                    value={condition.diagnosisDate || ''}
                    onChange={(e) => {
                      const updated = [...formData.preExistingConditions];
                      updated[index] = { ...updated[index], diagnosisDate: e.target.value };
                      setFormData({ ...formData, preExistingConditions: updated });
                    }}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                        </div>
                        <div className="flex-shrink-0" style={{ display: 'flex', alignItems: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                preExistingConditions: formData.preExistingConditions.filter((_, i) => i !== index),
                              });
                            }}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-md font-medium transition-colors"
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

            {/* Family History */}
            <div>
              <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium">Family History</span>
                <Button type="button" variant="outline" onClick={() => {
                  const condition = prompt('Enter condition (e.g., Diabetes):');
                  if (condition && condition.trim()) {
                    const relation = prompt('Enter family relation (e.g., Father, Mother):') || '';
                    setFormData({
                      ...formData,
                      familyHistory: {
                        ...formData.familyHistory,
                        [condition.trim()]: relation.trim(),
                      },
                    });
                  }
                }}>Add</Button>
              </div>
              {Object.keys(formData.familyHistory).length === 0 ? (
                <div className="p-3" style={{ textAlign: 'center', border: '1px dashed var(--gray-6)', borderRadius: 'var(--radius-2)' }}>
                  <span className="text-xs text-gray-500">No family history recorded.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {Object.entries(formData.familyHistory).map(([condition, relation], index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-2">
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <span className="font-medium">{condition}</span>
                          {relation && <span className="text-gray-500 ml-2">({relation})</span>}
                        </div>
                        <Button type="button" variant="destructive" onClick={() => {
                          const updated = { ...formData.familyHistory };
                          delete updated[condition];
                          setFormData({ ...formData, familyHistory: updated });
                        }}>Remove</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid var(--gray-6)' }}>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            )}
            <Button type="submit" variant="default">Save Patient</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
