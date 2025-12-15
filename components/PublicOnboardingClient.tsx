'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'react-qr-code';

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

interface Clinic {
  _id: string;
  name: string;
  displayName: string;
  subdomain: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
}

const STEPS = [
  { id: 0, title: 'Select Clinic', description: 'Choose your clinic' },
  { id: 1, title: 'Personal Info', description: 'Basic information' },
  { id: 2, title: 'Contact & Address', description: 'How to reach you' },
  { id: 3, title: 'Emergency Contact', description: 'Emergency details' },
  { id: 4, title: 'Medical Info', description: 'Health information' },
];

export default function PublicOnboardingClient() {
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [patientCode, setPatientCode] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [availableClinics, setAvailableClinics] = useState<Clinic[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);
  const [hasSubdomain, setHasSubdomain] = useState(false);
  const router = useRouter();

  // Check for subdomain on mount and get tenant info
  useEffect(() => {
    const checkSubdomain = async () => {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        const parts = hostname.split('.');
        // Extract potential subdomain (first part)
        const firstPart = parts[0]?.toLowerCase();
        // 'www' is not a subdomain - treat it as root domain
        const isWww = firstPart === 'www';
        // If hostname has more than 2 parts AND first part is not 'www', we have a subdomain
        // Or if 2 parts and first is not 'localhost' or 'www'
        const hasSubdomain = !isWww && (
          (parts.length > 2) || 
          (parts.length === 2 && firstPart !== 'localhost')
        );
        setHasSubdomain(hasSubdomain);
        
        if (!hasSubdomain) {
          // No subdomain (including www), fetch available clinics
          fetchClinics();
        } else {
          // Has subdomain, get tenant info and skip clinic selection
          try {
            const subdomain = firstPart;
            const res = await fetch(`/api/tenants/public?subdomain=${subdomain}`);
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.tenant) {
                setSelectedClinic(data.tenant);
              }
            }
          } catch (error) {
            console.error('Failed to fetch tenant info:', error);
          }
          setCurrentStep(1);
        }
      }
    };
    
    checkSubdomain();
  }, []);

  const fetchClinics = async () => {
    try {
      setLoadingClinics(true);
      const res = await fetch('/api/tenants/public');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.tenants) {
          setAvailableClinics(data.tenants);
        }
      }
    } catch (error) {
      console.error('Failed to fetch clinics:', error);
      setError('Failed to load clinics. Please refresh the page.');
    } finally {
      setLoadingClinics(false);
    }
  };

  const handleClinicSelect = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    setCurrentStep(1);
    setError(null);
  };

  const [formData, setFormData] = useState<PatientFormData>({
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    sex: 'unknown',
    civilStatus: '',
    nationality: '',
    occupation: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
    },
    emergencyContact: {
      name: '',
      phone: '',
      relationship: '',
    },
    identifiers: {
      philHealth: '',
      govId: '',
    },
    medicalHistory: '',
    preExistingConditions: [],
    allergies: [],
    familyHistory: {},
  });

  // Validation for each step
  const validateStep = (step: number): boolean => {
    switch (step) {
      case 0:
        return !!selectedClinic; // Clinic must be selected
      case 1:
        return !!(formData.firstName && formData.lastName && formData.dateOfBirth);
      case 2:
        return !!(
          formData.phone &&
          formData.address.street &&
          formData.address.city &&
          formData.address.state &&
          formData.address.zipCode
        );
      case 3:
        return !!(
          formData.emergencyContact.name &&
          formData.emergencyContact.phone &&
          formData.emergencyContact.relationship
        );
      case 4:
        return true; // Medical info is optional
      default:
        return false;
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep) && currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      setError(null);
      // Scroll to top on mobile
      if (window.innerWidth < 768) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      setError('Please fill in all required fields before continuing.');
    }
  };

  const prevStep = () => {
    const minStep = hasSubdomain ? 1 : 0;
    if (currentStep > minStep) {
      setCurrentStep(currentStep - 1);
      setError(null);
      if (window.innerWidth < 768) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      // Handle allergies
      const allergiesArray = formData.allergies.filter((a) => a.substance.trim().length > 0);

      // Clean up identifiers
      const identifiers = formData.identifiers
        ? {
            ...(formData.identifiers.philHealth?.trim() && { philHealth: formData.identifiers.philHealth.trim() }),
            ...(formData.identifiers.govId?.trim() && { govId: formData.identifiers.govId.trim() }),
          }
        : undefined;
      const cleanedIdentifiers = identifiers && Object.keys(identifiers).length > 0 ? identifiers : undefined;

      // Prepare the payload
      const payload: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        dateOfBirth: new Date(formData.dateOfBirth),
        address: formData.address,
        emergencyContact: formData.emergencyContact,
        allergies: allergiesArray,
      };

      // Add email only if provided
      if (formData.email && formData.email.trim()) {
        payload.email = formData.email.trim();
      }

      // Add optional fields
      if (formData.middleName?.trim()) payload.middleName = formData.middleName.trim();
      if (formData.suffix?.trim()) payload.suffix = formData.suffix.trim();
      if (formData.sex && formData.sex !== 'unknown') payload.sex = formData.sex;
      if (formData.civilStatus?.trim()) payload.civilStatus = formData.civilStatus.trim();
      if (formData.nationality?.trim()) payload.nationality = formData.nationality.trim();
      if (formData.occupation?.trim()) payload.occupation = formData.occupation.trim();
      if (formData.medicalHistory?.trim()) payload.medicalHistory = formData.medicalHistory.trim();
      if (cleanedIdentifiers) payload.identifiers = cleanedIdentifiers;

      // Add pre-existing conditions
      const filteredConditions = formData.preExistingConditions.filter(
        (c) => c.condition && c.condition.trim().length > 0
      );
      if (filteredConditions.length > 0) {
        payload.preExistingConditions = filteredConditions;
      }

      // Add family history
      const filteredFamilyHistory = Object.fromEntries(
        Object.entries(formData.familyHistory).filter(([condition, relation]) => condition.trim().length > 0)
      );
      if (Object.keys(filteredFamilyHistory).length > 0) {
        payload.familyHistory = filteredFamilyHistory;
      }

      // Add tenantId if clinic is selected
      if (selectedClinic) {
        payload.tenantId = selectedClinic._id;
      }

      const res = await fetch('/api/patients/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Check response status first
      if (!res.ok) {
        // Try to get error message from response
        let errorMessage = `Server error (Status: ${res.status})`;
        try {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await res.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } else {
            const text = await res.text();
            if (text) {
              errorMessage = text.substring(0, 200);
            }
          }
        } catch (parseError) {
          // If we can't parse the error, use the status-based message
          console.error('Failed to parse error response:', parseError);
        }
        setError(`Failed to register: ${errorMessage}`);
        return;
      }

      // Parse successful response
      const contentType = res.headers.get('content-type');
      let data;
      try {
        if (contentType && contentType.includes('application/json')) {
          data = await res.json();
        } else {
          const text = await res.text();
          console.error('API returned non-JSON response:', text.substring(0, 500));
          setError(`Failed to register: Unexpected response format (Status: ${res.status})`);
          return;
        }
      } catch (parseError: any) {
        console.error('Failed to parse API response:', parseError);
        setError(`Failed to register: Invalid response from server. Please try again.`);
        return;
      }

      // Validate response structure
      if (!data || typeof data !== 'object') {
        console.error('Invalid API response structure:', data);
        setError('Failed to register: Invalid response from server. Please try again.');
        return;
      }

      if (data.success) {
        if (data.data && data.data.patientCode) {
          setSuccess(true);
          setPatientCode(data.data.patientCode);
          setPatientId(data.data._id || null);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          console.error('API response missing patient data:', data);
          setError('Registration successful but patient code not received. Please contact support.');
        }
      } else {
        // Handle error response
        const errorMsg = data.error || data.message || 'Unknown error occurred';
        console.error('API error response:', { status: res.status, data });
        setError(`Error: ${errorMsg}`);
      }
    } catch (error: any) {
      console.error('Failed to register patient:', error);
      setError(`Failed to register: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
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

  const addCondition = () => {
    setFormData({
      ...formData,
      preExistingConditions: [
        ...formData.preExistingConditions,
        { condition: '', status: 'active' },
      ],
    });
  };

  const removeCondition = (index: number) => {
    setFormData({
      ...formData,
      preExistingConditions: formData.preExistingConditions.filter((_, i) => i !== index),
    });
  };

  const updateCondition = (index: number, field: keyof PreExistingCondition, value: any) => {
    const updated = [...formData.preExistingConditions];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, preExistingConditions: updated });
  };

  const addFamilyHistory = () => {
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
  };

  const removeFamilyHistory = (condition: string) => {
    const updated = { ...formData.familyHistory };
    delete updated[condition];
    setFormData({ ...formData, familyHistory: updated });
  };

  // Progress percentage
  // Calculate progress based on visible steps
  const visibleSteps = hasSubdomain ? STEPS.filter(s => s.id !== 0) : STEPS;
  const currentStepIndex = Math.max(0, visibleSteps.findIndex(s => s.id === currentStep));
  const progress = visibleSteps.length > 0 ? ((currentStepIndex + 1) / visibleSteps.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 w-full">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 w-full">
        <div className="max-w-4xl mx-auto w-full">
          {/* Header - Mobile Optimized */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-blue-600 rounded-full mb-3 sm:mb-4">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">Patient Registration</h1>
            <p className="text-sm sm:text-base lg:text-lg text-gray-600 px-4">
              Welcome! Please complete the form below to register as a new patient.
            </p>
          </div>

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 sm:p-6 mb-6 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold text-green-800 mb-2">Registration Successful!</h3>
                  <p className="text-sm sm:text-base text-green-700 mb-3">
                    Thank you for registering with us. Your patient information has been successfully submitted.
                  </p>
                  {patientCode && (
                    <div className="bg-white rounded-lg p-3 sm:p-4 mb-3 border border-green-200">
                      <p className="text-xs sm:text-sm text-gray-600 mb-1">Your Patient Code:</p>
                      <p className="text-lg sm:text-xl font-bold text-gray-900 break-all">{patientCode}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        Please save this code for future reference when booking appointments or accessing your records.
                      </p>
                    </div>
                  )}
                  
                  {/* QR Code for Patient Login */}
                  {patientId && patientCode && (
                    <div className="bg-white rounded-lg p-4 sm:p-6 mb-3 border border-green-200">
                      <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-2 text-center">
                        Your Patient QR Code
                      </h4>
                      <p className="text-xs text-gray-600 mb-3 text-center">
                        Scan this QR code to quickly log in to your patient portal
                      </p>
                      <div className="flex justify-center mb-3">
                        <div className="p-3 bg-white border-2 border-gray-200 rounded-lg inline-block">
                          <QRCode
                            value={JSON.stringify({
                              patientId: patientId,
                              patientCode: patientCode,
                              type: 'patient_login',
                              timestamp: Date.now(),
                            })}
                            size={200}
                            style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
                            viewBox="0 0 256 256"
                          />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-500 mb-2">
                          Save this QR code to your phone for quick access
                        </p>
                        <Link
                          href="/patient/login"
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium underline"
                        >
                          Or login with your patient code
                        </Link>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-4">
                    <Link
                      href="/book"
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-center"
                    >
                      Book an Appointment
                    </Link>
                    <Link
                      href="/"
                      className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors text-center"
                    >
                      Go to Home
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && !success && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4 sm:mb-6 animate-fade-in">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-red-800">Registration Error</h3>
                  <p className="text-sm text-red-700 mt-1 break-words">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Form Card */}
          {!success && (
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              {/* Progress Bar */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 sm:px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg sm:text-xl font-semibold text-white">
                    Step {currentStepIndex + 1} of {visibleSteps.length}
                  </h2>
                  <span className="text-sm text-blue-100">{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-blue-500/30 rounded-full h-2.5">
                  <div
                    className="bg-white h-2.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-blue-100 text-xs sm:text-sm mt-2">
                  {STEPS[currentStep]?.title} - {STEPS[currentStep]?.description}
                </p>
              </div>

              {/* Step Indicators - Mobile */}
              <div className="px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-200 sm:hidden">
                <div className="flex justify-between items-center">
                  {STEPS.filter(step => hasSubdomain ? step.id !== 0 : true).map((step, index) => (
                    <div key={step.id} className="flex-1 flex flex-col items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                          currentStep > step.id
                            ? 'bg-green-500 text-white'
                            : currentStep === step.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-300 text-gray-600'
                        }`}
                      >
                        {currentStep > step.id ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          step.id + 1
                        )}
                      </div>
                      <span className="text-xs text-gray-600 mt-1 text-center">{step.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step Indicators - Desktop */}
              <div className="hidden sm:block px-6 py-4 bg-gray-50 border-b border-gray-200">
                <div className="flex justify-between">
                  {STEPS.filter(step => hasSubdomain ? step.id !== 0 : true).map((step, index) => (
                    <div key={step.id} className="flex-1 flex items-center">
                      <div className="flex items-center flex-1">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                            currentStep > step.id
                              ? 'bg-green-500 text-white'
                              : currentStep === step.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-300 text-gray-600'
                          }`}
                        >
                          {currentStep > step.id ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            step.id + 1
                          )}
                        </div>
                        <div className="ml-3 flex-1">
                          <p className="text-sm font-medium text-gray-900">{step.title}</p>
                          <p className="text-xs text-gray-500">{step.description}</p>
                        </div>
                      </div>
                      {index < STEPS.length - 1 && (
                        <div
                          className={`flex-1 h-0.5 mx-4 ${
                            currentStep > step.id ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Form Content */}
              <form onSubmit={currentStep === STEPS.length - 1 ? handleSubmit : (e) => { e.preventDefault(); nextStep(); }}>
                <div className="p-4 sm:p-6 lg:p-8">
                  {/* Step 0: Clinic Selection */}
                  {currentStep === 0 && (
                    <div className="space-y-4 sm:space-y-6 animate-fade-in">
                      <div>
                        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Select Your Clinic</h3>
                        <p className="text-sm text-gray-600 mb-6">
                          Please select the clinic where you would like to register and set your appointment.
                        </p>
                        
                        {loadingClinics ? (
                          <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                          </div>
                        ) : availableClinics.length === 0 ? (
                          <div className="text-center py-12">
                            <p className="text-gray-600 mb-4">No clinics available at the moment.</p>
                            <Link href="/tenant-onboard" className="text-blue-600 hover:text-blue-700 font-semibold">
                              Register a new clinic
                            </Link>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {availableClinics.map((clinic) => (
                              <button
                                key={clinic._id}
                                type="button"
                                onClick={() => handleClinicSelect(clinic)}
                                className={`p-6 border-2 rounded-xl text-left transition-all hover:shadow-lg ${
                                  selectedClinic?._id === clinic._id
                                    ? 'border-blue-600 bg-blue-50'
                                    : 'border-gray-200 hover:border-blue-300 bg-white'
                                }`}
                              >
                                <div className="flex items-start justify-between mb-3">
                                  <h4 className="text-lg font-semibold text-gray-900">{clinic.displayName || clinic.name}</h4>
                                  {selectedClinic?._id === clinic._id && (
                                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                                {clinic.address && (clinic.address.city || clinic.address.state) && (
                                  <p className="text-sm text-gray-600 mb-2">
                                    {[clinic.address.city, clinic.address.state].filter(Boolean).join(', ')}
                                  </p>
                                )}
                                {clinic.phone && (
                                  <p className="text-sm text-gray-600 mb-2">
                                    📞 {clinic.phone}
                                  </p>
                                )}
                                {clinic.email && (
                                  <p className="text-sm text-gray-600">
                                    ✉️ {clinic.email}
                                  </p>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Step 1: Personal Information */}
                  {currentStep === 1 && (
                    <div className="space-y-4 sm:space-y-6 animate-fade-in">
                      <div>
                        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">Personal Information</h3>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                First Name <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                required
                                value={formData.firstName}
                                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                placeholder="John"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">Middle Name</label>
                              <input
                                type="text"
                                value={formData.middleName}
                                onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                placeholder="Michael"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Last Name <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                required
                                value={formData.lastName}
                                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                placeholder="Doe"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">Suffix</label>
                              <input
                                type="text"
                                value={formData.suffix}
                                onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                placeholder="Jr., Sr., III"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Date of Birth <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="date"
                                required
                                value={formData.dateOfBirth}
                                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                max={new Date().toISOString().split('T')[0]}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">Sex</label>
                              <select
                                value={formData.sex}
                                onChange={(e) => setFormData({ ...formData, sex: e.target.value as any })}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base bg-white"
                              >
                                <option value="unknown">Unknown</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">Civil Status</label>
                              <input
                                type="text"
                                value={formData.civilStatus}
                                onChange={(e) => setFormData({ ...formData, civilStatus: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                placeholder="Single, Married, etc."
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nationality</label>
                              <input
                                type="text"
                                value={formData.nationality}
                                onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                placeholder="Filipino, American, etc."
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">Occupation</label>
                              <input
                                type="text"
                                value={formData.occupation}
                                onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                placeholder="Your occupation"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Contact & Address */}
                  {/* Step 2: Contact & Address */}
                  {currentStep === 2 && (
                    <div className="space-y-4 sm:space-y-6 animate-fade-in">
                      <div>
                        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">Contact & Address</h3>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Email <span className="text-gray-500 text-xs">(Optional)</span>
                              </label>
                              <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                placeholder="john.doe@example.com"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Phone <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="tel"
                                required
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                placeholder="+1234567890"
                              />
                            </div>
                          </div>
                          <div className="pt-4 border-t border-gray-200">
                            <h4 className="text-base font-medium text-gray-900 mb-3">Address</h4>
                            <div className="space-y-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                  placeholder="123 Main Street"
                                />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                    placeholder="Manila"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Province <span className="text-red-500">*</span>
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
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                    placeholder="Metro Manila"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                    placeholder="1000"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Emergency Contact & Identifiers */}
                  {/* Step 3: Emergency Contact */}
                  {currentStep === 3 && (
                    <div className="space-y-4 sm:space-y-6 animate-fade-in">
                      <div>
                        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">Emergency Contact & Identifiers</h3>
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-base font-medium text-gray-900 mb-3">Emergency Contact</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                  placeholder="Jane Doe"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                  placeholder="+1234567890"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                  placeholder="Spouse, Parent, etc."
                                />
                              </div>
                            </div>
                          </div>
                          <div className="pt-4 border-t border-gray-200">
                            <h4 className="text-base font-medium text-gray-900 mb-3">Identifiers (Optional)</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">PhilHealth ID</label>
                                <input
                                  type="text"
                                  value={formData.identifiers?.philHealth || ''}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      identifiers: { ...formData.identifiers, philHealth: e.target.value },
                                    })
                                  }
                                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                  placeholder="PhilHealth number"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Government ID</label>
                                <input
                                  type="text"
                                  value={formData.identifiers?.govId || ''}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      identifiers: { ...formData.identifiers, govId: e.target.value },
                                    })
                                  }
                                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                                  placeholder="Government ID number"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Medical Information */}
                  {/* Step 4: Medical Info */}
                  {currentStep === 4 && (
                    <div className="space-y-4 sm:space-y-6 animate-fade-in">
                      <div>
                        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">Medical Information</h3>
                        <p className="text-sm text-gray-600 mb-4">All fields in this section are optional but help us provide better care.</p>
                        <div className="space-y-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Medical History</label>
                            <textarea
                              value={formData.medicalHistory}
                              onChange={(e) => setFormData({ ...formData, medicalHistory: e.target.value })}
                              rows={4}
                              placeholder="Enter your medical history, previous surgeries, chronic conditions, etc."
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base resize-none"
                            />
                          </div>

                          {/* Allergies */}
                          <div>
                            <div className="flex justify-between items-center mb-3">
                              <label className="block text-sm font-medium text-gray-700">Allergies</label>
                              <button
                                type="button"
                                onClick={addAllergy}
                                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium transition-colors text-sm"
                              >
                                + Add Allergy
                              </button>
                            </div>
                            {formData.allergies.length === 0 ? (
                              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center">
                                <p className="text-sm text-gray-500">No allergies recorded. Click "Add Allergy" to add one.</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {formData.allergies.map((allergy, index) => (
                                  <div key={index} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Substance</label>
                                        <input
                                          type="text"
                                          value={allergy.substance}
                                          onChange={(e) => updateAllergy(index, 'substance', e.target.value)}
                                          placeholder="e.g., Penicillin"
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Reaction</label>
                                        <input
                                          type="text"
                                          value={allergy.reaction}
                                          onChange={(e) => updateAllergy(index, 'reaction', e.target.value)}
                                          placeholder="e.g., Rash"
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <div className="flex-1">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Severity</label>
                                          <select
                                            value={allergy.severity}
                                            onChange={(e) => updateAllergy(index, 'severity', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
                                          >
                                            <option value="unknown">Unknown</option>
                                            <option value="mild">Mild</option>
                                            <option value="moderate">Moderate</option>
                                            <option value="severe">Severe</option>
                                            <option value="life-threatening">Life-threatening</option>
                                          </select>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => removeAllergy(index)}
                                          className="mt-6 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors text-sm font-medium"
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
                              <label className="block text-sm font-medium text-gray-700">Pre-existing Conditions</label>
                              <button
                                type="button"
                                onClick={addCondition}
                                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium transition-colors text-sm"
                              >
                                + Add Condition
                              </button>
                            </div>
                            {formData.preExistingConditions.length === 0 ? (
                              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center">
                                <p className="text-sm text-gray-500">No conditions recorded. Click "Add Condition" to add one.</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {formData.preExistingConditions.map((condition, index) => (
                                  <div key={index} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                      <div className="sm:col-span-2">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Condition</label>
                                        <input
                                          type="text"
                                          value={condition.condition}
                                          onChange={(e) => updateCondition(index, 'condition', e.target.value)}
                                          placeholder="e.g., Diabetes"
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                                        <select
                                          value={condition.status}
                                          onChange={(e) => updateCondition(index, 'status', e.target.value)}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
                                        >
                                          <option value="active">Active</option>
                                          <option value="chronic">Chronic</option>
                                          <option value="resolved">Resolved</option>
                                        </select>
                                      </div>
                                      <div className="flex gap-2">
                                        <div className="flex-1">
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                                          <input
                                            type="date"
                                            value={condition.diagnosisDate || ''}
                                            onChange={(e) => updateCondition(index, 'diagnosisDate', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                                          />
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => removeCondition(index)}
                                          className="mt-6 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors text-sm font-medium"
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
                              <label className="block text-sm font-medium text-gray-700">Family History</label>
                              <button
                                type="button"
                                onClick={addFamilyHistory}
                                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium transition-colors text-sm"
                              >
                                + Add History
                              </button>
                            </div>
                            {Object.keys(formData.familyHistory).length === 0 ? (
                              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center">
                                <p className="text-sm text-gray-500">No family history recorded. Click "Add History" to add one.</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {Object.entries(formData.familyHistory).map(([condition, relation], index) => (
                                  <div key={index} className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex justify-between items-center">
                                    <div>
                                      <span className="font-medium text-sm text-gray-900">{condition}</span>
                                      {relation && <span className="text-gray-500 text-sm ml-2">({relation})</span>}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeFamilyHistory(condition)}
                                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors text-sm font-medium"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  <div className="flex flex-col sm:flex-row justify-between gap-3 pt-6 border-t border-gray-200 mt-6">
                    <button
                      type="button"
                      onClick={prevStep}
                      disabled={currentStep === (hasSubdomain ? 1 : 0)}
                      className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                        currentStep === (hasSubdomain ? 1 : 0)
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Previous
                      </span>
                    </button>
                    {currentStep < STEPS.length - 1 ? (
                      <button
                        type="button"
                        onClick={nextStep}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex-1 sm:flex-initial"
                      >
                        <span className="flex items-center justify-center gap-2">
                          Next
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors flex-1 sm:flex-initial disabled:cursor-not-allowed"
                      >
                        {submitting ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Submitting...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            Submit Registration
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* Footer Info */}
          {!success && (
            <div className="mt-6 text-center text-sm text-gray-600 px-4">
              <p>
                Already registered?{' '}
                <Link href="/book" className="text-blue-600 hover:text-blue-700 font-medium">
                  Book an appointment
                </Link>
                {' '}or{' '}
                <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                  Login
                </Link>
              </p>
              <p className="mt-2">
                Need help? Contact us at{' '}
                <a href="mailto:support@clinic.com" className="text-blue-600 hover:text-blue-700 font-medium">
                  support@clinic.com
                </a>
              </p>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
