'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { DATE_FORMATS, PH_DEFAULTS, isPhZipCode, normalizePhPhone, subdomainError } from '@/lib/tenant-onboarding';
import BrandLogo from '@/components/BrandLogo';
import TurnstileWidget, { TURNSTILE_SITE_KEY } from '@/components/TurnstileWidget';

interface FormErrors {
  tenantName?: string[];
  subdomain?: string[];
  email?: string[];
  phone?: string[];
  zipCode?: string[];
  country?: string[];
  timezone?: string[];
  currency?: string[];
  dateFormat?: string[];
  adminName?: string[];
  adminEmail?: string[];
  adminPhone?: string[];
  referralCode?: string[];
  general?: string;
}

type ReferralCheck =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; code: string; rep: { name: string; company: string | null } }
  | { state: 'error'; message: string };

/** Which step shows each field, so a server-side error sends the user back to it. */
const FIELD_STEP: Record<string, number> = {
  tenantName: 1, subdomain: 1,
  email: 2, phone: 2, zipCode: 2, country: 2, timezone: 2, currency: 2, dateFormat: 2,
  adminName: 3, adminEmail: 3, adminPhone: 3, referralCode: 3,
};

const subscribeNoop = () => () => {};

export default function TenantOnboardClient({ initialReferralCode = '' }: { initialReferralCode?: string }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [success, setSuccess] = useState(false);
  const [tenantData, setTenantData] = useState<any>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Turnstile tokens are single-use: bumping this remounts the widget after each attempt.
  const [captchaKey, setCaptchaKey] = useState(0);
  const rootDomain = useSyncExternalStore(
    subscribeNoop,
    () => window.location.hostname.split('.').slice(-2).join('.'),
    () => 'localhost'
  );
  const [lastGeneratedSubdomain, setLastGeneratedSubdomain] = useState('');

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
    // Settings — clinics are in the Philippines (Asia/Manila, PHP); only the date format is a choice.
    dateFormat: PH_DEFAULTS.dateFormat as string,
    // Admin User
    adminName: '',
    adminEmail: '',
    // A medical rep's referral code (from their signup link, or typed in)
    referralCode: initialReferralCode,
  });
  const [referral, setReferral] = useState<ReferralCheck>({ state: 'idle' });

  const checkReferral = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code) return setReferral({ state: 'idle' });
    setReferral({ state: 'checking' });
    try {
      const res = await fetch(`/api/tenants/referral-code?code=${encodeURIComponent(code)}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) setReferral({ state: 'ok', code: json.data.code, rep: json.data.rep });
      else setReferral({ state: 'error', message: json?.error || 'That code isn’t valid. Check it with your rep.' });
    } catch {
      setReferral({ state: 'error', message: 'Couldn’t check the code. You can try again.' });
    }
  }, []);

  // A rep's signup link: check the code straight away so the rep's name shows from the start.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one lookup for the link's code on mount
    if (initialReferralCode) void checkReferral(initialReferralCode);
  }, [initialReferralCode, checkReferral]);

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

  const handleInputChange = (field: string, value: string) => {
    // Special handling for subdomain - normalize it as user types
    if (field === 'subdomain') {
      // Convert to lowercase and remove invalid characters in real-time
      let normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      // Remove leading/trailing hyphens
      normalized = normalized.replace(/^-+|-+$/g, '');
      // Replace multiple consecutive hyphens with single hyphen
      normalized = normalized.replace(/-+/g, '-');
      setFormData(prev => ({ ...prev, [field]: normalized }));
    } else if (field === 'tenantName') {
      // Auto-generate the subdomain from the clinic name unless the user has edited it.
      const generatedSubdomain = generateSubdomain(value);
      if (!formData.subdomain || formData.subdomain === lastGeneratedSubdomain) {
        setLastGeneratedSubdomain(generatedSubdomain);
        setFormData(prev => ({ ...prev, tenantName: value, subdomain: generatedSubdomain }));
      } else {
        setFormData(prev => ({ ...prev, tenantName: value }));
      }
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
    // Clear error for this field
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field as keyof FormErrors];
        return newErrors;
      });
    }
  };

  const validateStep = (stepNum: number): boolean => {
    const newErrors: FormErrors = {};

    if (stepNum === 1) {
      if (!formData.tenantName.trim()) {
        newErrors.tenantName = ['Tenant name is required'];
      }
      if (!formData.subdomain.trim()) {
        newErrors.subdomain = ['Subdomain is required'];
      } else {
        const problem = subdomainError(formData.subdomain.toLowerCase());
        if (problem) {
          newErrors.subdomain = [problem];
        }
      }
    }

    if (stepNum === 2) {
      if (formData.email && !/^\S+@\S+\.\S+$/.test(formData.email)) {
        newErrors.email = ['Please enter a valid email address'];
      }
      if (formData.phone.trim() && !normalizePhPhone(formData.phone)) {
        newErrors.phone = ['Enter a Philippine mobile (0917 123 4567) or landline ((02) 8123 4567)'];
      }
      if (formData.zipCode.trim() && !isPhZipCode(formData.zipCode)) {
        newErrors.zipCode = ['ZIP codes are 4 digits'];
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
    if (formData.referralCode.trim() && referral.state === 'error') {
      setErrors({ referralCode: [referral.message] });
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      // Helper to filter out empty strings for optional fields
      const cleanOptional = (value: string | undefined) => {
        return value && value.trim() ? value.trim() : undefined;
      };

      // Helper to ensure non-empty strings, convert empty to undefined
      const ensureValue = (value: string | undefined): string | undefined => {
        const trimmed = value?.trim();
        return trimmed && trimmed.length > 0 ? trimmed : undefined;
      };

      // Normalize subdomain one more time before sending
      const normalizedSubdomain = formData.subdomain
        ?.trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');

      const requestBody = {
        name: ensureValue(formData.tenantName),
        displayName: ensureValue(formData.displayName) || ensureValue(formData.tenantName),
        subdomain: ensureValue(normalizedSubdomain),
        email: cleanOptional(formData.email),
        phone: cleanOptional(formData.phone),
        address: {
          street: cleanOptional(formData.street),
          city: cleanOptional(formData.city),
          state: cleanOptional(formData.state),
          zipCode: cleanOptional(formData.zipCode),
          country: PH_DEFAULTS.country,
        },
        settings: {
          dateFormat: formData.dateFormat || PH_DEFAULTS.dateFormat,
        },
        admin: {
          name: ensureValue(formData.adminName),
          email: ensureValue(formData.adminEmail),
        },
        referralCode: cleanOptional(formData.referralCode),
        turnstileToken: captchaToken ?? undefined,
      };

      // Final validation before sending
      if (!requestBody.name || !requestBody.subdomain || !requestBody.admin?.name || !requestBody.admin?.email) {
        const missingFields = [];
        if (!requestBody.name) missingFields.push('Tenant name');
        if (!requestBody.subdomain) missingFields.push('Subdomain');
        if (!requestBody.admin?.name) missingFields.push('Admin name');
        if (!requestBody.admin?.email) missingFields.push('Admin email');
        
        setErrors({ 
          general: `Please fill in all required fields: ${missingFields.join(', ')}` 
        });
        setLoading(false);
        return;
      }

      setCaptchaKey((k) => k + 1);
      setCaptchaToken(null);
      const response = await fetch('/api/tenants/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      let data;
      let responseText = '';
      try {
        responseText = await response.text();
        data = responseText ? JSON.parse(responseText) : null;
      } catch (jsonError) {
        const parseErrorDetails = {
          status: response.status,
          statusText: response.statusText,
          responseText: responseText || '(empty response)',
          jsonError: jsonError instanceof Error ? {
            name: jsonError.name,
            message: jsonError.message,
            stack: jsonError.stack,
          } : String(jsonError),
          timestamp: new Date().toISOString(),
        };
        console.error('Failed to parse response:', parseErrorDetails);
        console.error('Response text that failed to parse:', responseText);
        setErrors({ 
          general: `Server returned invalid response (${response.status}). Please try again or contact support.` 
        });
        setLoading(false);
        return;
      }

      if (!response.ok) {
        // Create a detailed error object for logging
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          url: response.url || '/api/tenants/onboard',
          data: data || null,
          dataStringified: data ? JSON.stringify(data, null, 2) : 'null',
          requestBody: {
            name: requestBody.name || 'missing',
            subdomain: requestBody.subdomain || 'missing',
            hasAdmin: !!requestBody.admin,
            adminName: requestBody.admin?.name || 'missing',
            adminEmail: requestBody.admin?.email || 'missing',
          },
          timestamp: new Date().toISOString(),
        };

        // Log error with proper serialization
        console.error('Onboarding failed:', errorDetails);
        console.error('Error details (stringified):', JSON.stringify(errorDetails, null, 2));
        
        // Extract error message from response
        const errorMessage = data?.message || 
                            data?.error || 
                            (data?.errors ? Object.values(data.errors).flat().join(', ') : null) ||
                            `Failed to create tenant (${response.status} ${response.statusText})`;

        if (data?.errors) {
          // Field errors only show on their own step: go back to the first step that has one,
          // and keep a general message so nothing fails silently.
          const fields = Object.keys(data.errors).filter((k) => k !== 'general');
          const target = fields.map((k) => FIELD_STEP[k]).filter(Boolean).sort()[0];
          if (target) setStep(target);
          const general = Array.isArray(data.errors.general) ? data.errors.general[0] : data.errors.general;
          setErrors({ ...data.errors, general: general || (target ? undefined : errorMessage) });
        } else {
          setErrors({ general: errorMessage });
        }
        setLoading(false);
        return;
      }

      setTenantData(data);
      setSuccess(true);
      setLoading(false);
    } catch (error) {
      // Create detailed error information
      const errorInfo = {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : String(error),
        errorStringified: error instanceof Error 
          ? JSON.stringify({
              name: error.name,
              message: error.message,
              stack: error.stack,
            }, null, 2)
          : JSON.stringify(error, null, 2),
        timestamp: new Date().toISOString(),
        formData: {
          tenantName: formData.tenantName || 'unknown',
          subdomain: formData.subdomain || 'unknown',
        },
      };

      console.error('Error creating tenant:', errorInfo);
      console.error('Error details (stringified):', errorInfo.errorStringified);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'An unexpected error occurred';
      
      setErrors({ 
        general: `Network or system error: ${errorMessage}. Please check your connection and try again.` 
      });
      setLoading(false);
    }
  };

  if (success && tenantData) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        {/* Background */}
        <div className="fixed inset-0 -z-10 bg-white">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
              backgroundSize: '48px 48px',
              maskImage: 'radial-gradient(ellipse 80% 60% at 50% 20%, black 20%, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 20%, black 20%, transparent 75%)',
            }}
          />
        </div>

        <div className="max-w-xl w-full relative z-10">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 sm:p-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-teal rounded-lg mb-6 shadow-sm">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">Check your email</h1>
            <p className="text-base text-gray-600">
              We sent a link to <span className="font-semibold text-gray-900">{tenantData.adminEmail}</span>. Open it to set your
              password and sign in to <span className="font-semibold text-gray-900">{tenantData.subdomain}.{rootDomain}</span>.
            </p>
            <p className="mt-4 text-sm text-gray-500">
              The link works for 72 hours. Nothing arrived? Check your spam folder, or contact support.
            </p>
            <div className="mt-8">
              <Link
                href="/"
                className="inline-block px-6 sm:px-8 py-3 bg-white border border-gray-300 text-gray-700 rounded-md font-semibold hover:bg-gray-50 hover:border-gray-400 transition-colors"
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
    <div className="min-h-screen flex bg-white">
      {/* Left branding panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 relative flex-col justify-between p-12 bg-brand-navy overflow-hidden">
        {/* Background decoration — grid pattern, consistent with login/homepage */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to right, #ffffff10 1px, transparent 1px), linear-gradient(to bottom, #ffffff10 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 80%)',
          }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo size={48} rounded="rounded-lg" />
            <span className="text-white font-bold text-lg">MyClinicSoft</span>
          </Link>
        </div>

        {/* Center content */}
        <div className="relative z-10 space-y-6">
          <div className="w-14 h-14 bg-white/15 rounded-lg flex items-center justify-center border border-white/20">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight mb-3 tracking-tight">
              Register your clinic,<br />go live in minutes.
            </h2>
            <p className="text-slate-300 text-base xl:text-lg leading-relaxed">
              Set up your clinic name, contact details, and admin account — everything you need to start managing patients today.
            </p>
          </div>

          {/* Step overview */}
          <div className="flex flex-col gap-3 pt-2">
            {[
              { n: 1, label: 'Clinic Info' },
              { n: 2, label: 'Contact & Settings' },
              { n: 3, label: 'Admin Account' },
            ].map(({ n, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-semibold text-sm transition-colors ${
                    step >= n ? 'bg-white text-brand-navy' : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {step > n ? (
                    <>
                      <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="sr-only">Completed: </span>
                    </>
                  ) : (
                    n
                  )}
                </div>
                <span className={`text-sm font-medium ${step >= n ? 'text-white' : 'text-slate-300'}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <div className="relative z-10">
          <p className="text-slate-400 text-sm">
            &copy; {new Date().getFullYear()} MyClinicSoft. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 sm:px-12 bg-white relative overflow-hidden">
        {/* Subtle grid background for mobile */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 lg:hidden"
          style={{
            backgroundImage:
              'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 20%, black 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 20%, black 20%, transparent 75%)',
          }}
        />

        <div className="w-full max-w-xl">
          {/* Mobile logo */}
          <Link href="/" className="flex lg:hidden items-center justify-center gap-3 mb-10">
            <BrandLogo size={44} rounded="rounded-lg" className="shadow-lg" />
            <span className="text-gray-900 font-bold text-lg">MyClinicSoft</span>
          </Link>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">Register Your Clinic</h1>
            <p className="text-gray-500 text-sm sm:text-base">Get started with MyClinicSoft in minutes.</p>
            {referral.state === 'ok' && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-md border border-brand-teal/30 bg-brand-teal-light/40 px-3 py-1.5 text-sm text-brand-teal-deep">
                <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Referred by <span className="font-semibold">{referral.rep.name}</span>
                {referral.rep.company && <span>· {referral.rep.company}</span>}
              </p>
            )}
          </div>

          {/* Compact horizontal stepper */}
          <div className="flex items-center gap-2 mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div
                  className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    step >= s ? 'bg-brand-teal text-white' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {step > s ? (
                    <>
                      <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="sr-only">Step {s} completed</span>
                    </>
                  ) : (
                    <>
                      {s}
                      {step === s && <span className="sr-only"> (current step)</span>}
                    </>
                  )}
                </div>
                {s < 3 && (
                  <div className={`flex-1 h-0.5 mx-2 rounded-full transition-colors ${step > s ? 'bg-brand-teal' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {errors.general && (
            <div className="mb-6 p-4 sm:p-5 bg-red-50 border border-red-200 rounded-md sm:rounded-lg text-red-800 text-sm sm:text-base">
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
                <div className="w-10 h-10 bg-brand-teal-light rounded-md flex items-center justify-center">
                  <svg className="w-5 h-5 text-brand-teal-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                Clinic Information
              </h2>
              
              <div>
                <label htmlFor="tenant-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Clinic Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="tenant-name"
                  type="text"
                  value={formData.tenantName}
                  onChange={(e) => handleInputChange('tenantName', e.target.value)}
                  className={`w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base ${
                    errors.tenantName ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="City Medical Clinic"
                />
                {errors.tenantName && (
                  <p className="mt-1 text-sm text-red-600">{errors.tenantName[0]}</p>
                )}
              </div>

              <div>
                <label htmlFor="tenant-display-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Display Name (optional)
                </label>
                <input
                  id="tenant-display-name"
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => handleInputChange('displayName', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base"
                  placeholder="City Medical"
                />
              </div>

              <div>
                <label htmlFor="tenant-subdomain" className="block text-sm font-medium text-gray-700 mb-2">
                  Subdomain <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="tenant-subdomain"
                    type="text"
                    value={formData.subdomain}
                    onChange={(e) => handleInputChange('subdomain', e.target.value)}
                    className={`flex-1 px-4 py-3 border rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base ${
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
                  This will be your clinic&apos;s unique URL. Auto-generated from clinic name.
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 px-6 py-3 bg-brand-teal text-white rounded-md font-semibold hover:bg-brand-teal-dark transition-colors"
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
                <div className="w-10 h-10 bg-brand-teal-light rounded-md flex items-center justify-center">
                  <svg className="w-5 h-5 text-brand-teal-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                Contact Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="tenant-contact-email" className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Email
                  </label>
                  <input
                    id="tenant-contact-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className={`w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base ${
                      errors.email ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="contact@clinic.com"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email[0]}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="tenant-contact-phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Phone
                  </label>
                  <input
                    id="tenant-contact-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    maxLength={30}
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    aria-invalid={errors.phone ? true : undefined}
                    aria-describedby="tenant-contact-phone-hint"
                    className={`w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base ${errors.phone ? 'border-red-300' : 'border-gray-300'}`}
                    placeholder="0917 123 4567"
                  />
                  {errors.phone ? (
                    <p id="tenant-contact-phone-hint" className="mt-1 text-sm text-red-600">{errors.phone[0]}</p>
                  ) : (
                    <p id="tenant-contact-phone-hint" className="mt-1 text-xs text-gray-500">Mobile or landline, e.g. (02) 8123 4567</p>
                  )}
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Address (Optional)</h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    value={formData.street}
                    aria-label="Street, building and barangay"
                    autoComplete="street-address"
                    onChange={(e) => handleInputChange('street', e.target.value)}
                    className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base border-gray-300"
                    placeholder="Unit / building, street, barangay"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                      type="text"
                      value={formData.city}
                      aria-label="City or municipality"
                      autoComplete="address-level2"
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base border-gray-300"
                      placeholder="City / Municipality"
                    />
                    <input
                      type="text"
                      value={formData.state}
                      aria-label="Province"
                      autoComplete="address-level1"
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base border-gray-300"
                      placeholder="Province"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={4}
                        value={formData.zipCode}
                        aria-label="ZIP code"
                        aria-invalid={errors.zipCode ? true : undefined}
                        onChange={(e) => handleInputChange('zipCode', e.target.value.replace(/\D/g, ''))}
                        className={`w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base ${errors.zipCode ? 'border-red-300' : 'border-gray-300'}`}
                        placeholder="ZIP code (e.g. 1200)"
                      />
                      {errors.zipCode && <p className="mt-1 text-sm text-red-600">{errors.zipCode[0]}</p>}
                    </div>
                    <input
                      type="text"
                      value={PH_DEFAULTS.country}
                      aria-label="Country"
                      readOnly
                      className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base border-gray-200 bg-gray-50 text-gray-600 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Settings</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-sm">
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                    <dt className="text-gray-500">Timezone</dt>
                    <dd className="font-medium text-gray-900">Philippine Time (Asia/Manila)</dd>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                    <dt className="text-gray-500">Currency</dt>
                    <dd className="font-medium text-gray-900">Philippine Peso (₱ PHP)</dd>
                  </div>
                </dl>
                <div>
                  <label htmlFor="tenant-date-format" className="block text-sm font-medium text-gray-700 mb-2">Date Format</label>
                  <select
                    id="tenant-date-format"
                    value={formData.dateFormat}
                    onChange={(e) => handleInputChange('dateFormat', e.target.value)}
                    className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base border-gray-300"
                  >
                    {DATE_FORMATS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  {errors.dateFormat && <p className="mt-1 text-sm text-red-600">{errors.dateFormat[0]}</p>}
                </div>
                {(errors.timezone || errors.currency || errors.country) && (
                  <p className="mt-2 text-sm text-red-600">{(errors.timezone || errors.currency || errors.country)![0]}</p>
                )}
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-6 sm:px-8 py-3 sm:py-4 bg-white border border-gray-300 text-gray-700 rounded-md font-semibold hover:bg-gray-50 hover:border-gray-400 transition-colors text-base sm:text-lg"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 px-6 sm:px-8 py-3 sm:py-4 bg-brand-teal text-white rounded-md font-semibold hover:bg-brand-teal-dark transition-colors text-base sm:text-lg"
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
                <div className="w-10 h-10 bg-brand-teal-light rounded-md flex items-center justify-center">
                  <svg className="w-5 h-5 text-brand-teal-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                Create Admin Account
              </h2>
              <p className="text-gray-600 mb-6">
                Who runs the clinic&apos;s account? They&apos;ll sign in with this email and manage staff and settings.
              </p>
              
              <div>
                <label htmlFor="tenant-admin-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="tenant-admin-name"
                  type="text"
                  value={formData.adminName}
                  onChange={(e) => handleInputChange('adminName', e.target.value)}
                    className={`w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base ${
                      errors.adminName ? 'border-red-300' : 'border-gray-300'
                    }`}
                  placeholder="Dr. Juan dela Cruz"
                />
                {errors.adminName && (
                  <p className="mt-1 text-sm text-red-600">{errors.adminName[0]}</p>
                )}
              </div>

              <div>
                <label htmlFor="tenant-admin-email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="tenant-admin-email"
                  type="email"
                  value={formData.adminEmail}
                  onChange={(e) => handleInputChange('adminEmail', e.target.value)}
                    className={`w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base ${
                      errors.adminEmail ? 'border-red-300' : 'border-gray-300'
                    }`}
                  placeholder="admin@clinic.com"
                />
                {errors.adminEmail && (
                  <p className="mt-1 text-sm text-red-600">{errors.adminEmail[0]}</p>
                )}
              </div>

              <div>
                <label htmlFor="tenant-referral-code" className="block text-sm font-medium text-gray-700 mb-2">
                  Medical rep referral code (optional)
                </label>
                <input
                  id="tenant-referral-code"
                  type="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={24}
                  value={formData.referralCode}
                  onChange={(e) => {
                    handleInputChange('referralCode', e.target.value.toUpperCase());
                    setReferral({ state: 'idle' });
                  }}
                  onBlur={(e) => void checkReferral(e.target.value)}
                  aria-invalid={referral.state === 'error' || errors.referralCode ? true : undefined}
                  aria-describedby="tenant-referral-code-hint"
                  className={`w-full px-4 py-3 border rounded-md font-mono tracking-wide uppercase focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-all bg-white hover:border-gray-400 text-base ${
                    referral.state === 'error' || errors.referralCode ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="REP-7K2PQX"
                />
                <p id="tenant-referral-code-hint" aria-live="polite" className="mt-1 text-sm">
                  {referral.state === 'checking' && <span className="text-gray-500">Checking…</span>}
                  {referral.state === 'ok' && (
                    <span className="text-brand-teal-deep">
                      ✓ {referral.rep.name}{referral.rep.company ? ` · ${referral.rep.company}` : ''} will be added to your reps.
                    </span>
                  )}
                  {referral.state === 'error' && <span className="text-red-600">{referral.message}</span>}
                  {referral.state === 'idle' && (errors.referralCode
                    ? <span className="text-red-600">{errors.referralCode[0]}</span>
                    : <span className="text-xs text-gray-500">From a medical rep you work with. They can sponsor your plan later.</span>)}
                </p>
              </div>

              <p className="text-sm text-gray-600">
                We&apos;ll email this address a link to set your password. Your clinic is ready once you&apos;ve set it.
              </p>

              {TURNSTILE_SITE_KEY && <TurnstileWidget key={captchaKey} onToken={setCaptchaToken} />}

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-6 sm:px-8 py-3 sm:py-4 bg-white border border-gray-300 text-gray-700 rounded-md font-semibold hover:bg-gray-50 hover:border-gray-400 transition-colors text-base sm:text-lg"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)}
                  className="flex-1 px-6 sm:px-8 py-3 sm:py-4 bg-brand-teal hover:bg-brand-teal-dark text-white rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base sm:text-lg"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border border-white border-t-transparent rounded-full animate-spin"></div>
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
          <p className="mt-8 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="text-brand-teal-dark hover:text-brand-teal font-semibold">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

