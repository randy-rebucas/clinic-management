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
    <div className="max-h-[80vh] overflow-y-auto pr-1">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-6">
      {/* Personal Information */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl">
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Personal Information</h3>
          </div>
          <div className="flex flex-col gap-4">
            {/* Name Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Middle Name</label>
                <input
                  value={formData.middleName}
                  onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Suffix</label>
                <input
                  value={formData.suffix}
                  onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                  placeholder="Jr., Sr., III"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>
            </div>
            
            {/* Demographics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Date of Birth <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Sex</label>
                <select
                  value={formData.sex}
                  onChange={(e) => setFormData({ ...formData, sex: e.target.value as any })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                >
                  <option value="unknown">Unknown</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Civil Status</label>
                <input
                  value={formData.civilStatus}
                  onChange={(e) => setFormData({ ...formData, civilStatus: e.target.value })}
                  placeholder="Single, Married, Divorced, etc."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nationality</label>
                <input
                  value={formData.nationality}
                  onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Occupation</label>
                <input
                  value={formData.occupation}
                  onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contact & Address Information */}
      <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl">
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-500 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Contact & Address</h3>
          </div>
          <div className="flex flex-col gap-4">
            {/* Contact Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>
            </div>

            {/* Address Fields */}
            <div className="pt-4 border-t border-purple-200">
              <span className="text-sm font-semibold text-gray-700 mb-3 block">Address</span>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Street Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={formData.address.street}
                    onChange={(e) =>
                        setFormData({
                          ...formData,
                          address: { ...formData.address, street: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={formData.address.city}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          address: { ...formData.address, city: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      State <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={formData.address.state}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          address: { ...formData.address, state: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Zip Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={formData.address.zipCode}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          address: { ...formData.address, zipCode: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Contact & Identifiers */}
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-xl">
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Emergency Contact & Identifiers</h3>
          </div>
          <div className="flex flex-col gap-4">
            {/* Emergency Contact */}
            <div>
              <span className="text-sm font-semibold text-gray-700 mb-3 block">Emergency Contact</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={formData.emergencyContact.name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        emergencyContact: { ...formData.emergencyContact, name: e.target.value },
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Relationship <span className="text-red-500">*</span>
                  </label>
                  <input
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Identifiers */}
            <div className="pt-4 border-t border-emerald-200">
              <span className="text-sm font-semibold text-gray-700 mb-3 block">Identifiers</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">PhilHealth ID</label>
                  <input
                    value={formData.identifiers?.philHealth || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        identifiers: { ...formData.identifiers, philHealth: e.target.value },
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Government ID</label>
                  <input
                    value={formData.identifiers?.govId || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        identifiers: { ...formData.identifiers, govId: e.target.value },
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Medical Information */}
      <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200 rounded-xl">
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-500 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Medical Information</h3>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Medical History</label>
              <textarea
                value={formData.medicalHistory}
                onChange={(e) => setFormData({ ...formData, medicalHistory: e.target.value })}
                rows={4}
                placeholder="Enter patient's medical history, previous surgeries, chronic conditions, etc."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm resize-y"
              />
            </div>

            {/* Allergies */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-semibold text-gray-700">Allergies</label>
                <button type="button" onClick={addAllergy} className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-semibold transition-colors text-sm inline-flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Allergy
                </button>
              </div>
              {formData.allergies.length === 0 ? (
                <div className="p-6 text-center border-2 border-dashed border-gray-300 rounded-lg bg-white/50">
                  <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-sm text-gray-500">No allergies recorded.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {formData.allergies.map((allergy, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Substance</label>
                          <input
                              value={allergy.substance}
                              onChange={(e) => updateAllergy(index, 'substance', e.target.value)}
                              placeholder="e.g., Penicillin"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                            />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Reaction</label>
                          <input
                              value={allergy.reaction}
                              onChange={(e) => updateAllergy(index, 'reaction', e.target.value)}
                              placeholder="e.g., Rash"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                            />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Severity</label>
                          <select
                  value={allergy.severity}
                  onChange={(e) => updateAllergy(index, 'severity', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
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
                            className="w-full px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-semibold transition-colors text-sm"
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
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-semibold text-gray-700">Pre-existing Conditions</label>
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
                  className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-semibold transition-colors text-sm inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Condition
                </button>
              </div>
              {formData.preExistingConditions.length === 0 ? (
                <div className="p-6 text-center border-2 border-dashed border-gray-300 rounded-lg bg-white/50">
                  <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm text-gray-500">No pre-existing conditions recorded.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {formData.preExistingConditions.map((condition, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Condition</label>
                          <input
                              value={condition.condition}
                              onChange={(e) => {
                                const updated = [...formData.preExistingConditions];
                                updated[index] = { ...updated[index], condition: e.target.value };
                                setFormData({ ...formData, preExistingConditions: updated });
                              }}
                              placeholder="e.g., Diabetes"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                            />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Status</label>
                          <select
                  value={condition.status}
                  onChange={(e) => {
                              const updated = [...formData.preExistingConditions];
                              updated[index] = { ...updated[index], status: e.target.value as any };
                              setFormData({ ...formData, preExistingConditions: updated });
                            }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                        >
                          <option value="active">Active</option>
                          <option value="chronic">Chronic</option>
                          <option value="resolved">Resolved</option>
                        </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={condition.diagnosisDate || ''}
                    onChange={(e) => {
                      const updated = [...formData.preExistingConditions];
                      updated[index] = { ...updated[index], diagnosisDate: e.target.value };
                      setFormData({ ...formData, preExistingConditions: updated });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
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
                            className="w-full px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-semibold transition-colors text-sm"
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
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-semibold text-gray-700">Family History</label>
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
                  className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-semibold transition-colors text-sm inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add History
                </button>
              </div>
              {Object.keys(formData.familyHistory).length === 0 ? (
                <div className="p-6 text-center border-2 border-dashed border-gray-300 rounded-lg bg-white/50">
                  <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="text-sm text-gray-500">No family history recorded.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {Object.entries(formData.familyHistory).map(([condition, relation], index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <span className="font-semibold text-gray-900">{condition}</span>
                          {relation && <span className="text-gray-600 ml-2">({relation})</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = { ...formData.familyHistory };
                            delete updated[condition];
                            setFormData({ ...formData, familyHistory: updated });
                          }}
                          className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-semibold transition-colors text-sm"
                        >
                          Remove
                        </button>
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
          <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
            {onCancel && (
              <button type="button" onClick={onCancel} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors text-sm">
                Cancel
              </button>
            )}
            <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-semibold transition-all text-sm shadow-md">
              Save Patient
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
