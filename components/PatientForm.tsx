'use client';

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
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
      {/* Personal Information */}
      <fieldset className="border border-gray-300 rounded-lg p-3 bg-gradient-to-br from-white to-gray-50/50 shadow-sm">
        <legend className="px-2 text-sm font-bold text-gray-800 bg-white rounded">Personal Information</legend>
        <div className="mt-2 space-y-2">
          {/* Name Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">Middle Name</label>
              <input
                type="text"
                value={formData.middleName}
                onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">Suffix</label>
              <input
                type="text"
                value={formData.suffix}
                onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                placeholder="Jr., Sr., III"
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>
          </div>
          
          {/* Demographics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">
                Date of Birth <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">Sex</label>
              <select
                value={formData.sex}
                onChange={(e) => setFormData({ ...formData, sex: e.target.value as any })}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
              >
                <option value="unknown">Unknown</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">Civil Status</label>
              <input
                type="text"
                value={formData.civilStatus}
                onChange={(e) => setFormData({ ...formData, civilStatus: e.target.value })}
                placeholder="Single, Married, Divorced, etc."
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">Nationality</label>
              <input
                type="text"
                value={formData.nationality}
                onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>
            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label className="block text-xs font-semibold text-gray-700">Occupation</label>
              <input
                type="text"
                value={formData.occupation}
                onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </fieldset>

      {/* Contact & Address Information */}
      <fieldset className="border border-gray-300 rounded-lg p-3 bg-gradient-to-br from-white to-gray-50/50 shadow-sm">
        <legend className="px-2 text-sm font-bold text-gray-800 bg-white rounded">Contact & Address</legend>
        <div className="mt-2 space-y-2">
          {/* Contact Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
              />
            </div>
          </div>

          {/* Address Fields */}
          <div className="pt-2 border-t border-gray-200">
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Address</h4>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-700">
                  Street Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.address.street}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: { ...formData.address, street: e.target.value },
                    })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.address.city}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: { ...formData.address, city: e.target.value },
                      })
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    State <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.address.state}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: { ...formData.address, state: e.target.value },
                      })
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Zip Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.address.zipCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: { ...formData.address, zipCode: e.target.value },
                      })
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      {/* Emergency Contact & Identifiers */}
      <fieldset className="border border-gray-300 rounded-lg p-3 bg-gradient-to-br from-white to-gray-50/50 shadow-sm">
        <legend className="px-2 text-sm font-bold text-gray-800 bg-white rounded">Emergency Contact & Identifiers</legend>
        <div className="mt-2 space-y-2">
          {/* Emergency Contact */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Emergency Contact</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-700">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.emergencyContact.name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      emergencyContact: { ...formData.emergencyContact, name: e.target.value },
                    })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-700">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.emergencyContact.phone}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      emergencyContact: { ...formData.emergencyContact, phone: e.target.value },
                    })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-700">
                  Relationship <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.emergencyContact.relationship}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      emergencyContact: {
                        ...formData.emergencyContact,
                        relationship: e.target.value,
                      },
                    })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Identifiers */}
          <div className="pt-2 border-t border-gray-200">
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Identifiers</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-700">PhilHealth ID</label>
                <input
                  type="text"
                  value={formData.identifiers?.philHealth || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      identifiers: { ...formData.identifiers, philHealth: e.target.value },
                    })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-700">Government ID</label>
                <input
                  type="text"
                  value={formData.identifiers?.govId || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      identifiers: { ...formData.identifiers, govId: e.target.value },
                    })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      {/* Medical Information */}
      <fieldset className="border border-gray-300 rounded-lg p-3 bg-gradient-to-br from-white to-gray-50/50 shadow-sm">
        <legend className="px-2 text-sm font-bold text-gray-800 bg-white rounded">Medical Information</legend>
        <div className="mt-2 space-y-2">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-700">Medical History</label>
            <textarea
              value={formData.medicalHistory}
              onChange={(e) => setFormData({ ...formData, medicalHistory: e.target.value })}
              rows={3}
              placeholder="Enter patient's medical history, previous surgeries, chronic conditions, etc."
              className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none resize-none"
            />
          </div>

          {/* Allergies */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-700">Allergies</label>
              <button
                type="button"
                onClick={addAllergy}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add
              </button>
            </div>
            {formData.allergies.length === 0 ? (
              <div className="text-center py-3 px-3 bg-gray-50 rounded border border-dashed border-gray-300">
                <p className="text-xs text-gray-500">No allergies recorded.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {formData.allergies.map((allergy, index) => (
                  <div key={index} className="bg-white border border-gray-200 rounded p-2">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <div className="space-y-0.5">
                        <label className="block text-xs font-semibold text-gray-600">Substance</label>
                        <input
                          type="text"
                          value={allergy.substance}
                          onChange={(e) => updateAllergy(index, 'substance', e.target.value)}
                          placeholder="e.g., Penicillin"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label className="block text-xs font-semibold text-gray-600">Reaction</label>
                        <input
                          type="text"
                          value={allergy.reaction}
                          onChange={(e) => updateAllergy(index, 'reaction', e.target.value)}
                          placeholder="e.g., Rash"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label className="block text-xs font-semibold text-gray-600">Severity</label>
                        <select
                          value={allergy.severity}
                          onChange={(e) => updateAllergy(index, 'severity', e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                        >
                          <option value="unknown">Unknown</option>
                          <option value="mild">Mild</option>
                          <option value="moderate">Moderate</option>
                          <option value="severe">Severe</option>
                          <option value="life-threatening">Life-threatening</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => removeAllergy(index)}
                          className="w-full px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors"
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-700">Pre-existing Conditions</label>
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
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add
              </button>
            </div>
            {formData.preExistingConditions.length === 0 ? (
              <div className="text-center py-3 px-3 bg-gray-50 rounded border border-dashed border-gray-300">
                <p className="text-xs text-gray-500">No pre-existing conditions recorded.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {formData.preExistingConditions.map((condition, index) => (
                  <div key={index} className="bg-white border border-gray-200 rounded p-2">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                      <div className="space-y-0.5 md:col-span-2">
                        <label className="block text-xs font-semibold text-gray-600">Condition</label>
                        <input
                          type="text"
                          value={condition.condition}
                          onChange={(e) => {
                            const updated = [...formData.preExistingConditions];
                            updated[index] = { ...updated[index], condition: e.target.value };
                            setFormData({ ...formData, preExistingConditions: updated });
                          }}
                          placeholder="e.g., Diabetes"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label className="block text-xs font-semibold text-gray-600">Status</label>
                        <select
                          value={condition.status}
                          onChange={(e) => {
                            const updated = [...formData.preExistingConditions];
                            updated[index] = { ...updated[index], status: e.target.value as any };
                            setFormData({ ...formData, preExistingConditions: updated });
                          }}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                        >
                          <option value="active">Active</option>
                          <option value="chronic">Chronic</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </div>
                      <div className="space-y-0.5">
                        <label className="block text-xs font-semibold text-gray-600">Date</label>
                        <input
                          type="date"
                          value={condition.diagnosisDate || ''}
                          onChange={(e) => {
                            const updated = [...formData.preExistingConditions];
                            updated[index] = { ...updated[index], diagnosisDate: e.target.value };
                            setFormData({ ...formData, preExistingConditions: updated });
                          }}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              preExistingConditions: formData.preExistingConditions.filter((_, i) => i !== index),
                            });
                          }}
                          className="w-full px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors"
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-700">Family History</label>
              <button
                type="button"
                onClick={() => {
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
                }}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add
              </button>
            </div>
            {Object.keys(formData.familyHistory).length === 0 ? (
              <div className="text-center py-3 px-3 bg-gray-50 rounded border border-dashed border-gray-300">
                <p className="text-xs text-gray-500">No family history recorded.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(formData.familyHistory).map(([condition, relation], index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded shadow-sm">
                    <div className="flex-1">
                      <span className="text-xs font-semibold text-gray-900">{condition}</span>
                      {relation && <span className="text-xs text-gray-600 ml-2">({relation})</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = { ...formData.familyHistory };
                        delete updated[condition];
                        setFormData({ ...formData, familyHistory: updated });
                      }}
                      className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </fieldset>

      {/* Form Actions */}
      <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-all focus:outline-none focus:ring-1 focus:ring-gray-300"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-4 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded hover:from-blue-700 hover:to-blue-800 shadow-sm hover:shadow transition-all focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          Save Patient
        </button>
      </div>
    </form>
  );
}
