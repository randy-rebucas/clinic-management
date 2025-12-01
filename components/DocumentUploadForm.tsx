'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

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
      setSelectedPatient(patient || null);
      if (patient) {
        setPatientSearch(`${patient.firstName} ${patient.lastName}`);
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
        setFilePreview(null);
      }
    } else {
      setFilePreview(null);
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
        <div className="flex flex-col gap-3 p-4">
          {/* File Upload */}
          <div>
            <Label htmlFor="file">File <span className="text-red-500">*</span></Label>
            <Input
              id="file"
              type="file"
              onChange={handleFileChange}
              required
              style={{ all: 'unset', width: '100%' }}
            />
            {filePreview && (
              <div className="mt-2">
                <img
                  src={filePreview}
                  alt="Preview"
                  className="max-w-full h-32 object-contain border border-gray-300 rounded-md"
                />
              </div>
            )}
            {formData.file && !filePreview && (
              <p className="text-xs text-gray-500 mt-2">
                Selected: {formData.file.name} ({(formData.file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
            <Input
              id="title"
              type="text"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              required
              style={{ all: 'unset', width: '100%' }}
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              as="textarea"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              style={{ all: 'unset', width: '100%' }}
              rows={2}
            />
          </div>

          {/* Category */}
          <div>
            <Label htmlFor="category">Category <span className="text-red-500">*</span></Label>
            <select
              id="category"
              value={formData.category}
              onChange={e => setFormData({ ...formData, category: e.target.value })}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">Select category...</option>
              {DOCUMENT_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

      {/* Patient Selection */}
        <div className="patient-search-container relative">
          <Label htmlFor="patientSearch">Patient (Optional)</Label>
          <div className="relative">
            <Input
              id="patientSearch"
              type="text"
              value={patientSearch}
              onChange={e => {
                setPatientSearch(e.target.value);
                setShowPatientSearch(true);
                if (!e.target.value) {
                  setFormData({ ...formData, patient: '' });
                  setSelectedPatient(null);
                }
              }}
              onFocus={() => setShowPatientSearch(true)}
              placeholder="Type to search patients..."
              style={{ all: 'unset', width: '100%' }}
            />
          {showPatientSearch && (
            <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
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
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 transition-colors flex flex-col items-start"
                    >
                      <span className="font-medium text-xs">{patient.firstName} {patient.lastName}</span>
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
              <label className="block text-sm font-medium mb-2">Visit (Optional)</label>
              <select
                value={formData.visit}
                onChange={(e) => setFormData({ ...formData, visit: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium mb-2">Tags (comma-separated)</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="e.g., urgent, follow-up, important"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-vertical min-h-[40px]"
            />
          </div>

      {/* Scanned */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="scanned"
          checked={formData.scanned}
          onChange={(e) => setFormData({ ...formData, scanned: e.target.checked })}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="scanned" className="text-xs cursor-pointer">
          This is a scanned document
        </label>
      </div>

          {/* Category-specific fields */}
          {formData.category === 'referral' && (
            <div>
              <hr className="my-3 border-gray-200" />
              <div className="flex flex-col gap-3 pt-3">
                <h3 className="text-lg font-semibold">Referral Information</h3>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Referring Doctor</label>
                  <input
                    type="text"
                    value={formData.referringDoctor}
                    onChange={(e) => setFormData({ ...formData, referringDoctor: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Referring Clinic</label>
                  <input
                    type="text"
                    value={formData.referringClinic}
                    onChange={(e) => setFormData({ ...formData, referringClinic: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Referral Date</label>
                  <input
                    type="date"
                    value={formData.referralDate}
                    onChange={(e) => setFormData({ ...formData, referralDate: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Reason</label>
                  <textarea
                    value={formData.referralReason}
                    onChange={(e) => setFormData({ ...formData, referralReason: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-vertical min-h-[40px] text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {formData.category === 'imaging' && (
            <div>
              <hr className="my-3 border-gray-200" />
              <div className="flex flex-col gap-3 pt-3">
                <h3 className="text-lg font-semibold">Imaging Information</h3>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Modality</label>
                  <input
                    type="text"
                    value={formData.modality}
                    onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
                    placeholder="X-ray, CT, MRI, Ultrasound, etc."
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Body Part</label>
                  <input
                    type="text"
                    value={formData.bodyPart}
                    onChange={(e) => setFormData({ ...formData, bodyPart: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Study Date</label>
                  <input
                    type="date"
                    value={formData.studyDate}
                    onChange={(e) => setFormData({ ...formData, studyDate: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Radiologist</label>
                  <input
                    type="text"
                    value={formData.radiologist}
                    onChange={(e) => setFormData({ ...formData, radiologist: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {formData.category === 'medical_certificate' && (
            <div>
              <hr className="my-3 border-gray-200" />
              <div className="flex flex-col gap-3 pt-3">
                <h3 className="text-lg font-semibold">Medical Certificate Information</h3>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Issue Date</label>
                  <input
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Valid Until</label>
                  <input
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Purpose</label>
                  <input
                    type="text"
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                    placeholder="Work, School, Travel, etc."
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Restrictions</label>
                  <textarea
                    value={formData.restrictions}
                    onChange={(e) => setFormData({ ...formData, restrictions: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-vertical min-h-[40px] text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {formData.category === 'laboratory_result' && (
            <div>
              <hr className="my-3 border-gray-200" />
              <div className="flex flex-col gap-3 pt-3">
                <h3 className="text-lg font-semibold">Laboratory Result Information</h3>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Test Type</label>
                  <input
                    type="text"
                    value={formData.testType}
                    onChange={(e) => setFormData({ ...formData, testType: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Test Date</label>
                  <input
                    type="date"
                    value={formData.testDate}
                    onChange={(e) => setFormData({ ...formData, testDate: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Lab Name</label>
                  <input
                    type="text"
                    value={formData.labName}
                    onChange={(e) => setFormData({ ...formData, labName: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="border-t border-gray-200 pt-3 mt-3">
            <div className="flex justify-end gap-2">
              {onCancel && (
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors">
                  Cancel
                </button>
              )}
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                Upload Document
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

