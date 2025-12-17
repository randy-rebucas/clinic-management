'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { detectCountry } from '@/lib/country-detection';

interface FormErrors {
  tenantName?: string[];
  subdomain?: string[];
  email?: string[];
  adminName?: string[];
  adminEmail?: string[];
  adminPassword?: string[];
  general?: string;
}

export default function TenantOnboardClient() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [success, setSuccess] = useState(false);
  const [tenantData, setTenantData] = useState<any>(null);
  const [detectingCountry, setDetectingCountry] = useState(true);
  const [rootDomain, setRootDomain] = useState('localhost');
  const [protocol, setProtocol] = useState('http');

  const [formData, setFormData] = useState({
    // Tenant Info
    tenantName: '',
    displayName: '',
    subdomain: '',
    email: '',
    phone: '',
    // Address
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    // Settings
    timezone: 'UTC',
    currency: 'PHP',
    dateFormat: 'MM/DD/YYYY',
    // Admin User
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
  });

  const generateSubdomain = (name: string): string => {
    if (!name || !name.trim()) return '';
    
    // Convert to lowercase, remove special characters, replace spaces with hyphens
    let subdomain = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
    
    // Ensure it starts and ends with alphanumeric
    subdomain = subdomain.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    
    // Limit length to 63 characters (max subdomain length)
    if (subdomain.length > 63) {
      subdomain = subdomain.substring(0, 63);
      // Remove trailing hyphen if exists
      subdomain = subdomain.replace(/-+$/, '');
    }
    
    // Ensure minimum length of 2
    if (subdomain.length < 2) {
      subdomain = '';
    }
    
    return subdomain;
  };

  const validateSubdomain = (subdomain: string): string | null => {
    if (!subdomain || subdomain.length < 2) {
      return 'Subdomain must be at least 2 characters long';
    }
    if (subdomain.length > 63) {
      return 'Subdomain must be at most 63 characters long';
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
      return 'Subdomain must contain only lowercase letters, numbers, and hyphens';
    }
    const reserved = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'localhost', 'staging', 'dev', 'test', 'demo'];
    if (reserved.includes(subdomain.toLowerCase())) {
      return `Subdomain "${subdomain}" is reserved and cannot be used`;
    }
    return null;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field as keyof FormErrors];
        return newErrors;
      });
    }
  };

  // Set root domain and protocol on mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const root = hostname.split('.').slice(-2).join('.');
      const proto = window.location.protocol.slice(0, -1);
      setRootDomain(root);
      setProtocol(proto);
    }
  }, []);

  // Auto-generate subdomain from clinic name
  useEffect(() => {
    const generatedSubdomain = generateSubdomain(formData.tenantName);
    setFormData(prev => ({
      ...prev,
      subdomain: generatedSubdomain,
    }));
  }, [formData.tenantName]);

  // Detect country and auto-fill form fields on mount
  useEffect(() => {
    const detectAndFill = async () => {
      try {
        setDetectingCountry(true);
        const countryData = await detectCountry();
        
        if (countryData) {
          setFormData(prev => ({
            ...prev,
            country: countryData.country,
            timezone: countryData.timezone,
            currency: countryData.currency,
            dateFormat: countryData.dateFormat,
          }));
        }
      } catch (error) {
        console.warn('Failed to detect country:', error);
        // Keep defaults if detection fails
      } finally {
        setDetectingCountry(false);
      }
    };

    detectAndFill();
  }, []);

  const validateStep = (stepNum: number): boolean => {
    const newErrors: FormErrors = {};

    if (stepNum === 1) {
      if (!formData.tenantName.trim()) {
        newErrors.tenantName = ['Tenant name is required'];
      }
      if (!formData.subdomain.trim()) {
        newErrors.subdomain = ['Subdomain is required'];
      } else {
        const subdomainError = validateSubdomain(formData.subdomain.toLowerCase());
        if (subdomainError) {
          newErrors.subdomain = [subdomainError];
        }
      }
    }

    if (stepNum === 2) {
      if (formData.email && !/^\S+@\S+\.\S+$/.test(formData.email)) {
        newErrors.email = ['Please enter a valid email address'];
      }
    }

    if (stepNum === 3) {
      if (!formData.adminName.trim()) {
        newErrors.adminName = ['Admin name is required'];
      }
      if (!formData.adminEmail.trim()) {
        newErrors.adminEmail = ['Admin email is required'];
      } else if (!/^\S+@\S+\.\S+$/.test(formData.adminEmail)) {
        newErrors.adminEmail = ['Please enter a valid email address'];
      }
      if (!formData.adminPassword) {
        newErrors.adminPassword = ['Password is required'];
      } else if (formData.adminPassword.length < 8) {
        newErrors.adminPassword = ['Password must be at least 8 characters long'];
      } else if (formData.adminPassword !== formData.confirmPassword) {
        newErrors.adminPassword = ['Passwords do not match'];
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep(3)) {
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      // Helper to filter out empty strings for optional fields
      const cleanOptional = (value: string | undefined) => {
        return value && value.trim() ? value.trim() : undefined;
      };

      const requestBody = {
        name: formData.tenantName?.trim(),
        displayName: formData.displayName?.trim() || formData.tenantName?.trim(),
        subdomain: formData.subdomain?.trim().toLowerCase(),
        email: cleanOptional(formData.email),
        phone: cleanOptional(formData.phone),
        address: (formData.street || formData.city || formData.state || formData.zipCode || formData.country) ? {
          street: cleanOptional(formData.street),
          city: cleanOptional(formData.city),
          state: cleanOptional(formData.state),
          zipCode: cleanOptional(formData.zipCode),
          country: cleanOptional(formData.country),
        } : undefined,
        settings: {
          timezone: formData.timezone || 'UTC',
          currency: formData.currency || 'USD',
          dateFormat: formData.dateFormat || 'MM/DD/YYYY',
        },
        admin: {
          name: formData.adminName?.trim(),
          email: formData.adminEmail?.trim(),
          password: formData.adminPassword, // Don't trim password
        },
      };

      console.log('Sending onboarding request:', {
        hasName: !!requestBody.name,
        hasSubdomain: !!requestBody.subdomain,
        hasAdmin: !!requestBody.admin,
        hasAdminName: !!requestBody.admin.name,
        hasAdminEmail: !!requestBody.admin.email,
        hasAdminPassword: !!requestBody.admin.password,
      });

      const response = await fetch('/api/tenants/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Failed to parse response:', jsonError);
        setErrors({ general: `Server error (${response.status}). Please try again.` });
        setLoading(false);
        return;
      }

      if (!response.ok) {
        console.error('Onboarding failed:', {
          status: response.status,
          statusText: response.statusText,
          data,
        });
        if (data.errors) {
          setErrors(data.errors);
        } else {
          setErrors({ general: data.message || 'Failed to create tenant. Please try again.' });
        }
        setLoading(false);
        return;
      }

      setTenantData(data);
      setSuccess(true);
      setLoading(false);
    } catch (error) {
      console.error('Error creating tenant:', error);
      setErrors({ general: 'An error occurred. Please try again.' });
      setLoading(false);
    }
  };

  if (success && tenantData) {
    const port = process.env.NODE_ENV === 'production' ? '' : ':3000';
    const accessUrl = `${protocol}://${tenantData.subdomain}.${rootDomain}${port}`;

    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        {/* Abstract Background */}
        <div className="fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"></div>
          <div className="absolute top-0 -left-4 w-96 h-96 bg-green-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute top-0 -right-4 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        </div>

        <div className="max-w-2xl w-full relative z-10">
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200/50 p-8 sm:p-10 lg:p-12">
            <div className="text-center mb-8 sm:mb-10">
              <div className="inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl sm:rounded-3xl mb-6 shadow-xl transform hover:scale-105 transition-transform">
                <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-3 tracking-tight">Tenant Created Successfully!</h1>
              <p className="text-base sm:text-lg text-gray-600">Your clinic has been onboarded and is ready to use.</p>
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-2xl p-6 sm:p-8 mb-6 border border-gray-200/50">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                Tenant Details
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-medium text-gray-900">{tenantData.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Subdomain:</span>
                  <span className="font-medium text-gray-900">{tenantData.subdomain}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className="font-medium text-green-600 capitalize">{tenantData.status}</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/30 rounded-2xl p-6 sm:p-8 mb-6 border border-blue-200/50">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                Access Information
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Access URL</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={accessUrl}
                      className="flex-1 px-4 py-3 bg-white/80 backdrop-blur-sm border-2 border-gray-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(accessUrl);
                        alert('URL copied to clipboard!');
                      }}
                      className="px-4 sm:px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 text-sm font-semibold"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                  <p className="text-sm text-gray-900 font-mono bg-white/80 backdrop-blur-sm px-4 py-3 rounded-xl border-2 border-gray-300">
                    {tenantData.adminEmail}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50/90 backdrop-blur-sm border-2 border-yellow-200 rounded-2xl p-5 sm:p-6 mb-6 shadow-lg">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-yellow-800">
                  <p className="font-semibold mb-1">Next Steps:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Configure DNS to point {tenantData.subdomain}.{rootDomain} to your server (production)</li>
                    <li>Access your tenant using the URL above</li>
                    <li>Log in with your admin credentials</li>
                    <li>Configure tenant settings and add staff members</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href={accessUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-center hover:shadow-xl transform hover:scale-105 transition-all shadow-lg"
              >
                Go to Your Clinic
              </a>
              <Link
                href="/"
                className="px-6 sm:px-8 py-3 sm:py-4 bg-white/80 backdrop-blur-sm border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all shadow-md hover:shadow-lg transform hover:scale-105 text-center"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
      {/* Abstract Background Elements */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"></div>
        <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        <div className="absolute top-20 right-10 w-72 h-72 border-4 border-blue-200/20 rotate-45 rounded-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      <div className="max-w-3xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl shadow-xl mb-6 transform hover:scale-105 transition-transform">
            <svg className="w-12 h-12 sm:w-14 sm:h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-3 sm:mb-4 tracking-tight">Register Your Clinic</h1>
          <p className="text-lg sm:text-xl text-gray-600">Get started with MyClinicSoft in minutes</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8 sm:mb-10">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center font-bold transition-all shadow-lg ${
                      step >= s
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white ring-2 ring-blue-300 ring-offset-2'
                        : 'bg-gray-200 text-gray-500'
                    } ${step === s ? 'scale-110' : ''}`}
                  >
                    {step > s ? (
                      <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-base sm:text-lg">{s}</span>
                    )}
                  </div>
                  <span className={`mt-2 sm:mt-3 text-xs sm:text-sm font-semibold ${step >= s ? 'text-blue-600' : 'text-gray-500'}`}>
                    {s === 1 ? 'Clinic Info' : s === 2 ? 'Contact' : 'Admin'}
                  </span>
                </div>
                {s < 3 && (
                  <div className={`flex-1 h-1 sm:h-1.5 mx-2 sm:mx-4 rounded-full transition-all ${
                    step > s ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200/50 p-6 sm:p-8 lg:p-10">
          {errors.general && (
            <div className="mb-6 p-4 sm:p-5 bg-red-50/90 backdrop-blur-sm border-2 border-red-200 rounded-xl sm:rounded-2xl text-red-800 text-sm sm:text-base shadow-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="font-semibold">{errors.general}</p>
              </div>
            </div>
          )}

          {/* Step 1: Clinic Information */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 sm:mb-8 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                Clinic Information
              </h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Clinic Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.tenantName}
                  onChange={(e) => handleInputChange('tenantName', e.target.value)}
                  className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base ${
                    errors.tenantName ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="City Medical Clinic"
                />
                {errors.tenantName && (
                  <p className="mt-1 text-sm text-red-600">{errors.tenantName[0]}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Display Name (optional)
                </label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => handleInputChange('displayName', e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                  placeholder="City Medical"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subdomain <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formData.subdomain}
                    readOnly
                    className={`flex-1 px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50 backdrop-blur-sm text-base cursor-not-allowed ${
                      errors.subdomain ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="citymedical"
                  />
                  <span className="text-gray-500 whitespace-nowrap">
                    .{rootDomain}
                  </span>
                </div>
                {errors.subdomain && (
                  <p className="mt-1 text-sm text-red-600">{errors.subdomain[0]}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  This will be your clinic's unique URL. Auto-generated from clinic name.
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transform hover:scale-105 transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Contact Information */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 sm:mb-8 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                Contact Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base ${
                      errors.email ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="contact@clinic.com"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email[0]}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                    placeholder="+1-555-0123"
                  />
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Address (Optional)</h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    value={formData.street}
                    onChange={(e) => handleInputChange('street', e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                    placeholder="Street Address"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className="px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                      placeholder="City"
                    />
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      className="px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                      placeholder="State/Province"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                      type="text"
                      value={formData.zipCode}
                      onChange={(e) => handleInputChange('zipCode', e.target.value)}
                      className="px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                      placeholder="Zip/Postal Code"
                    />
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => handleInputChange('country', e.target.value)}
                      disabled={detectingCountry}
                      className="px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder={detectingCountry ? "Detecting..." : "Country"}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Settings</h3>
                {detectingCountry && (
                  <div className="mb-4 flex items-center gap-2 text-sm text-blue-600">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Detecting your location...</span>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
                    <select
                      value={formData.timezone}
                      onChange={(e) => handleInputChange('timezone', e.target.value)}
                      disabled={detectingCountry}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="UTC">UTC</option>
                      <option value="Asia/Manila">Asia/Manila (Philippines)</option>
                      <option value="Asia/Singapore">Asia/Singapore</option>
                      <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur (Malaysia)</option>
                      <option value="Asia/Bangkok">Asia/Bangkok (Thailand)</option>
                      <option value="Asia/Jakarta">Asia/Jakarta (Indonesia)</option>
                      <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (Vietnam)</option>
                      <option value="Asia/Seoul">Asia/Seoul (South Korea)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (Japan)</option>
                      <option value="Asia/Shanghai">Asia/Shanghai (China)</option>
                      <option value="Asia/Kolkata">Asia/Kolkata (India)</option>
                      <option value="America/New_York">America/New_York (US Eastern)</option>
                      <option value="America/Chicago">America/Chicago (US Central)</option>
                      <option value="America/Denver">America/Denver (US Mountain)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (US Pacific)</option>
                      <option value="America/Toronto">America/Toronto (Canada)</option>
                      <option value="America/Mexico_City">America/Mexico_City (Mexico)</option>
                      <option value="America/Sao_Paulo">America/Sao_Paulo (Brazil)</option>
                      <option value="Europe/London">Europe/London (UK)</option>
                      <option value="Europe/Paris">Europe/Paris (France)</option>
                      <option value="Europe/Berlin">Europe/Berlin (Germany)</option>
                      <option value="Europe/Madrid">Europe/Madrid (Spain)</option>
                      <option value="Europe/Rome">Europe/Rome (Italy)</option>
                      <option value="Europe/Amsterdam">Europe/Amsterdam (Netherlands)</option>
                      <option value="Europe/Stockholm">Europe/Stockholm (Sweden)</option>
                      <option value="Australia/Sydney">Australia/Sydney</option>
                      <option value="Pacific/Auckland">Pacific/Auckland (New Zealand)</option>
                      <option value="Africa/Johannesburg">Africa/Johannesburg (South Africa)</option>
                      <option value="Asia/Dubai">Asia/Dubai (UAE)</option>
                      <option value="Asia/Riyadh">Asia/Riyadh (Saudi Arabia)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                    <select
                      value={formData.currency}
                      onChange={(e) => handleInputChange('currency', e.target.value)}
                      disabled={detectingCountry}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="PHP">PHP (Philippine Peso)</option>
                      <option value="USD">USD (US Dollar)</option>
                      <option value="EUR">EUR (Euro)</option>
                      <option value="GBP">GBP (British Pound)</option>
                      <option value="JPY">JPY (Japanese Yen)</option>
                      <option value="CAD">CAD (Canadian Dollar)</option>
                      <option value="AUD">AUD (Australian Dollar)</option>
                      <option value="SGD">SGD (Singapore Dollar)</option>
                      <option value="MYR">MYR (Malaysian Ringgit)</option>
                      <option value="THB">THB (Thai Baht)</option>
                      <option value="IDR">IDR (Indonesian Rupiah)</option>
                      <option value="VND">VND (Vietnamese Dong)</option>
                      <option value="KRW">KRW (South Korean Won)</option>
                      <option value="CNY">CNY (Chinese Yuan)</option>
                      <option value="INR">INR (Indian Rupee)</option>
                      <option value="MXN">MXN (Mexican Peso)</option>
                      <option value="BRL">BRL (Brazilian Real)</option>
                      <option value="ZAR">ZAR (South African Rand)</option>
                      <option value="NZD">NZD (New Zealand Dollar)</option>
                      <option value="CHF">CHF (Swiss Franc)</option>
                      <option value="AED">AED (UAE Dirham)</option>
                      <option value="SAR">SAR (Saudi Riyal)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date Format</label>
                    <select
                      value={formData.dateFormat}
                      onChange={(e) => handleInputChange('dateFormat', e.target.value)}
                      disabled={detectingCountry}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="DD.MM.YYYY">DD.MM.YYYY</option>
                      <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-6 sm:px-8 py-3 sm:py-4 bg-white/80 backdrop-blur-sm border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all shadow-md hover:shadow-lg transform hover:scale-105 text-base sm:text-lg"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-xl transform hover:scale-105 transition-all shadow-lg text-base sm:text-lg"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Admin User */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 sm:mb-8 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                Create Admin Account
              </h2>
              <p className="text-gray-600 mb-6">
                Create the administrator account for your clinic. You'll use these credentials to log in and manage your clinic.
              </p>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.adminName}
                  onChange={(e) => handleInputChange('adminName', e.target.value)}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base ${
                      errors.adminName ? 'border-red-300' : 'border-gray-300'
                    }`}
                  placeholder="Dr. John Smith"
                />
                {errors.adminName && (
                  <p className="mt-1 text-sm text-red-600">{errors.adminName[0]}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.adminEmail}
                  onChange={(e) => handleInputChange('adminEmail', e.target.value)}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base ${
                      errors.adminEmail ? 'border-red-300' : 'border-gray-300'
                    }`}
                  placeholder="admin@clinic.com"
                />
                {errors.adminEmail && (
                  <p className="mt-1 text-sm text-red-600">{errors.adminEmail[0]}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={formData.adminPassword}
                    onChange={(e) => handleInputChange('adminPassword', e.target.value)}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base ${
                      errors.adminPassword ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Min 8 characters"
                  />
                  {errors.adminPassword && (
                    <p className="mt-1 text-sm text-red-600">{errors.adminPassword[0]}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                    placeholder="Confirm password"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-6 sm:px-8 py-3 sm:py-4 bg-white/80 backdrop-blur-sm border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all shadow-md hover:shadow-lg transform hover:scale-105 text-base sm:text-lg"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-semibold hover:shadow-xl transform hover:scale-105 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-base sm:text-lg"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Creating...
                    </span>
                  ) : (
                    'Create Clinic'
                  )}
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-semibold">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

