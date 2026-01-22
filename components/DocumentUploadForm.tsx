'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
}

interface Visit {
  _id: string;
  visitCode: string;
  date: string;
  visitType?: string;
}

interface DocumentUploadFormProps {
  initialData?: {
    patient?: string;
    visit?: string;
  };
  patients: Patient[];
  visits: Visit[];
  onSubmit: (formData: FormData) => void;
  onCancel?: () => void;
}

const DOCUMENT_CATEGORIES = [
  { value: 'referral', label: 'Referral' },
  { value: 'laboratory_result', label: 'Laboratory Result' },
  { value: 'imaging', label: 'Imaging' },
  { value: 'medical_certificate', label: 'Medical Certificate' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'id', label: 'ID' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other', label: 'Other' },
] as const;

export default function DocumentUploadForm({
  initialData,
  patients,
  visits,
  onSubmit,
  onCancel,
}: DocumentUploadFormProps) {
  const [formData, setFormData] = useState({
    file: null as File | null,
    title: '',
    description: '',
    category: '' as string,
    patient: initialData?.patient || '',
    visit: initialData?.visit || '',
    tags: '',
    notes: '',
    scanned: false,
    // Referral specific
    referringDoctor: '',
    referringClinic: '',
    referralDate: '',
    referralReason: '',
    // Imaging specific
    modality: '',
    bodyPart: '',
    studyDate: '',
    radiologist: '',
    // Medical certificate specific
    issueDate: '',
    validUntil: '',
    purpose: '',
    restrictions: '',
    // Lab result specific
    testType: '',
    testDate: '',
    labName: '',
  });

  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  useEffect(() => {
    if (formData.patient) {
      const patient = patients.find((p) => p._id === formData.patient);
      if (patient) {
        // Use setTimeout to avoid synchronous setState in effect
        setTimeout(() => {
          setSelectedPatient(patient);
          setPatientSearch(`${patient.firstName} ${patient.lastName}`);
        }, 0);
      } else {
        setTimeout(() => {
          setSelectedPatient(null);
        }, 0);
      }
    }
  }, [formData.patient, patients]);

  useEffect(() => {
    if (formData.file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      if (formData.file.type.startsWith('image/')) {
        reader.readAsDataURL(formData.file);
      } else {
        setTimeout(() => {
          setFilePreview(null);
        }, 0);
      }
    } else {
      setTimeout(() => {
        setFilePreview(null);
      }, 0);
    }
  }, [formData.file]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.patient-search-container')) {
        setShowPatientSearch(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({ ...formData, file, title: formData.title || file.name });
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.file) {
      alert('Please select a file to upload');
      return;
    }
    if (!formData.title) {
      alert('Please enter a title');
      return;
    }
    if (!formData.category) {
      alert('Please select a category');
      return;
    }

    const submitFormData = new FormData();
    submitFormData.append('file', formData.file);
    submitFormData.append('title', formData.title);
    if (formData.description) submitFormData.append('description', formData.description);
    submitFormData.append('category', formData.category);
    if (formData.patient) submitFormData.append('patientId', formData.patient);
    if (formData.visit) submitFormData.append('visitId', formData.visit);
    if (formData.tags) submitFormData.append('tags', formData.tags);
    if (formData.notes) submitFormData.append('notes', formData.notes);
    submitFormData.append('scanned', formData.scanned.toString());

    // Category-specific data
    if (formData.category === 'referral') {
      const referralData: any = {};
      if (formData.referringDoctor) referralData.referringDoctor = formData.referringDoctor;
      if (formData.referringClinic) referralData.referringClinic = formData.referringClinic;
      if (formData.referralDate) referralData.referralDate = formData.referralDate;
      if (formData.referralReason) referralData.reason = formData.referralReason;
      if (Object.keys(referralData).length > 0) {
        submitFormData.append('referralData', JSON.stringify(referralData));
      }
    }

    if (formData.category === 'imaging') {
      const imagingData: any = {};
      if (formData.modality) imagingData.modality = formData.modality;
      if (formData.bodyPart) imagingData.bodyPart = formData.bodyPart;
      if (formData.studyDate) imagingData.studyDate = formData.studyDate;
      if (formData.radiologist) imagingData.radiologist = formData.radiologist;
      if (Object.keys(imagingData).length > 0) {
        submitFormData.append('imagingData', JSON.stringify(imagingData));
      }
    }

    if (formData.category === 'medical_certificate') {
      const medicalCertificateData: any = {};
      if (formData.issueDate) medicalCertificateData.issueDate = formData.issueDate;
      if (formData.validUntil) medicalCertificateData.validUntil = formData.validUntil;
      if (formData.purpose) medicalCertificateData.purpose = formData.purpose;
      if (formData.restrictions) medicalCertificateData.restrictions = formData.restrictions;
      if (Object.keys(medicalCertificateData).length > 0) {
        submitFormData.append('medicalCertificateData', JSON.stringify(medicalCertificateData));
      }
    }

    if (formData.category === 'laboratory_result') {
      const labResultData: any = {};
      if (formData.testType) labResultData.testType = formData.testType;
      if (formData.testDate) labResultData.testDate = formData.testDate;
      if (formData.labName) labResultData.labName = formData.labName;
      if (Object.keys(labResultData).length > 0) {
        submitFormData.append('labResultData', JSON.stringify(labResultData));
      }
    }

    onSubmit(submitFormData);
  };

  const filteredPatients = patients.filter((patient) => {
    const searchLower = patientSearch.toLowerCase();
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    const patientCode = (patient.patientCode || '').toLowerCase();
    return fullName.includes(searchLower) || patientCode.includes(searchLower);
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
        <div className="flex flex-col gap-6 p-4 sm:p-6">
          {/* File Upload */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <label className="block text-sm font-bold text-gray-900">
                File <span className="text-red-600">*</span>
              </label>
            </div>
            <input
              type="file"
              onChange={handleFileChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-sm bg-white"
            />
            {filePreview && (
              <div className="mt-4 p-3 bg-white border border-purple-200 rounded-lg">
                <img
                  src={filePreview}
                  alt="Preview"
                  className="max-w-full h-40 object-contain mx-auto"
                />
              </div>
            )}
            {formData.file && !filePreview && (
              <div className="mt-4 p-3 bg-white border border-purple-200 rounded-lg">
                <p className="text-sm font-medium text-gray-900">
                  Selected: <span className="font-bold">{formData.file.name}</span> ({(formData.file.size / 1024).toFixed(2)} KB)
                </p>
              </div>
            )}
          </div>

          {/* Basic Information */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Basic Information</h3>
            </div>
            <div className="flex flex-col gap-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Title <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y transition-all text-sm"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Category <span className="text-red-600">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                >
                  <option value="">Select category...</option>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Patient & Visit Selection */}
          <div className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 border border-cyan-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-cyan-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Patient & Visit</h3>
            </div>
            <div className="flex flex-col gap-4">
              {/* Patient Selection */}
              <div className="patient-search-container relative">
                <label className="block text-xs font-semibold text-gray-700 mb-2">Patient (Optional)</label>
                <div className="relative">
                  <input
                    type="text"
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                  {showPatientSearch && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {filteredPatients.length > 0 ? (
                        <div className="flex flex-col">
                          {filteredPatients.map((patient) => (
                            <button
                              key={patient._id}
                              type="button"
                              onClick={() => {
                                selectPatient(patient);
                                setShowPatientSearch(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-cyan-50 transition-colors flex flex-col items-start rounded"
                            >
                              <span className="font-semibold text-sm text-gray-900">{patient.firstName} {patient.lastName}</span>
                              {patient.patientCode && (
                                <span className="text-xs text-gray-600">{patient.patientCode}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : patientSearch ? (
                        <div className="p-2">
                          <p className="text-xs text-gray-600">No patients found</p>
                        </div>
                      ) : (
                        <div className="p-2">
                          <p className="text-xs text-gray-600">Start typing to search...</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Visit Selection */}
              {formData.patient && visits.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Visit (Optional)</label>
                  <select
                    value={formData.visit}
                    onChange={(e) => setFormData({ ...formData, visit: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  >
                    <option value="">Select a visit...</option>
                    {visits.map((visit) => (
                      <option key={visit._id} value={visit._id}>
                        {visit.visitCode} - {new Date(visit.date).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Additional Information */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gray-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Additional Information</h3>
            </div>
            <div className="flex flex-col gap-4">
              {/* Tags */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="e.g., urgent, follow-up, important"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none resize-y transition-all text-sm"
                />
              </div>

              {/* Scanned */}
              <div className="flex items-center gap-3 p-3 bg-white/50 rounded-lg border border-gray-200">
                <input
                  type="checkbox"
                  id="scanned"
                  checked={formData.scanned}
                  onChange={(e) => setFormData({ ...formData, scanned: e.target.checked })}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="scanned" className="text-sm font-semibold text-gray-700 cursor-pointer">
                  This is a scanned document
                </label>
              </div>
            </div>
          </div>

          {/* Category-specific fields */}
          {formData.category === 'referral' && (
            <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Referral Information</h3>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Referring Doctor</label>
                  <input
                    type="text"
                    value={formData.referringDoctor}
                    onChange={(e) => setFormData({ ...formData, referringDoctor: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Referring Clinic</label>
                  <input
                    type="text"
                    value={formData.referringClinic}
                    onChange={(e) => setFormData({ ...formData, referringClinic: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Referral Date</label>
                  <input
                    type="date"
                    value={formData.referralDate}
                    onChange={(e) => setFormData({ ...formData, referralDate: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Reason</label>
                  <textarea
                    value={formData.referralReason}
                    onChange={(e) => setFormData({ ...formData, referralReason: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-y transition-all text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {formData.category === 'imaging' && (
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Imaging Information</h3>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Modality</label>
                  <input
                    type="text"
                    value={formData.modality}
                    onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
                    placeholder="X-ray, CT, MRI, Ultrasound, etc."
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Body Part</label>
                  <input
                    type="text"
                    value={formData.bodyPart}
                    onChange={(e) => setFormData({ ...formData, bodyPart: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Study Date</label>
                  <input
                    type="date"
                    value={formData.studyDate}
                    onChange={(e) => setFormData({ ...formData, studyDate: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Radiologist</label>
                  <input
                    type="text"
                    value={formData.radiologist}
                    onChange={(e) => setFormData({ ...formData, radiologist: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {formData.category === 'medical_certificate' && (
            <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 border border-teal-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-teal-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Medical Certificate Information</h3>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Issue Date</label>
                  <input
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Valid Until</label>
                  <input
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Purpose</label>
                  <input
                    type="text"
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                    placeholder="Work, School, Travel, etc."
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Restrictions</label>
                  <textarea
                    value={formData.restrictions}
                    onChange={(e) => setFormData({ ...formData, restrictions: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none resize-y transition-all text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {formData.category === 'laboratory_result' && (
            <div className="bg-gradient-to-br from-rose-50 to-rose-100/50 border border-rose-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-rose-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Laboratory Result Information</h3>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Test Type</label>
                  <input
                    type="text"
                    value={formData.testType}
                    onChange={(e) => setFormData({ ...formData, testType: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Test Date</label>
                  <input
                    type="date"
                    value={formData.testDate}
                    onChange={(e) => setFormData({ ...formData, testDate: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Lab Name</label>
                  <input
                    type="text"
                    value={formData.labName}
                    onChange={(e) => setFormData({ ...formData, labName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <hr className="border-gray-200" />
          <div className="flex justify-end gap-3 pt-2">
            {onCancel && (
              <button type="button" onClick={onCancel} className="px-4 py-2.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold border border-gray-200">
                Cancel
              </button>
            )}
            <button type="submit" className="px-4 py-2.5 text-sm bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all font-semibold shadow-md">
              Upload Document
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

