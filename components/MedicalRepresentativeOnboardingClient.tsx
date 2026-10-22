'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon, icons } from '@/components/PublicPage';

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  territory: string;
  products: string;
  title: string;
  bio: string;
}

const STEPS = [
  { title: 'About you', description: 'Name and contact details' },
  { title: 'Company', description: 'Who you represent' },
  { title: 'Review', description: 'Check and submit' },
];

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3.5 py-2.5 text-base text-gray-900 placeholder:text-gray-400 transition-colors duration-150 hover:border-gray-400 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/25';

const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function Required() {
  return <span className="text-red-500">*</span>;
}

function Optional() {
  return <span className="font-normal text-gray-400">(optional)</span>;
}

/** `onlineFee` is set when the activation fee is paid online through PayMongo right after submitting. */
export default function MedicalRepresentativeOnboardingClient({ onlineFee }: { onlineFee: number | null }) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    territory: '',
    products: '',
    title: '',
    bio: '',
  });

  const products = formData.products
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  // Validation for each step
  const validateStep = (step: number): boolean => {
    switch (step) {
      case 0:
        return !!(formData.firstName.trim() && formData.lastName.trim() && formData.email.trim() && formData.phone.trim());
      case 1:
        return !!(formData.company.trim() && formData.territory.trim());
      case 2:
        return true; // Review step - just display
      default:
        return false;
    }
  };

  const goTo = (step: number) => {
    setCurrentStep(step);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const nextStep = () => {
    if (!validateStep(currentStep)) {
      setError('Please fill in all required fields before continuing.');
      return;
    }
    if (currentStep < STEPS.length - 1) goTo(currentStep + 1);
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Enter in a field submits the form; treat it as "Continue" until the review step.
    if (currentStep < STEPS.length - 1) {
      nextStep();
      return;
    }
    if (![0, 1].every(validateStep)) {
      setError('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.toLowerCase().trim(),
        phone: formData.phone.trim(),
        company: formData.company.trim(),
        territory: formData.territory.trim(),
        products,
        title: formData.title.trim(),
        bio: formData.bio.trim(),
      };

      const response = await fetch('/api/medical-representatives/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed. Please try again.');
      }

      // Pay the activation fee on PayMongo when the server offers it; activation follows by itself.
      if (typeof data.checkoutUrl === 'string' && data.checkoutUrl.startsWith('https://')) {
        window.location.assign(data.checkoutUrl);
        return;
      }

      router.push(`/medical-representatives/onboard/success?id=${data.medicalRepresentative?.id}`);
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration. Please try again.');
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const activation = [
    { title: 'Register', description: 'Tell us about you and the company you represent.' },
    onlineFee
      ? { title: `Pay ${peso(onlineFee)} online`, description: 'GCash, Maya, card, GrabPay, or QR Ph through PayMongo.' }
      : { title: 'Verification', description: 'Our team contacts you about the activation fee.' },
    { title: 'Reach clinics', description: 'Your account is activated and clinics on the platform can see you.' },
  ];

  const review = [
    { label: 'Name', value: [formData.title, formData.firstName, formData.lastName].filter(Boolean).join(' '), step: 0 },
    { label: 'Email', value: formData.email, step: 0 },
    { label: 'Phone', value: formData.phone, step: 0 },
    { label: 'Company', value: formData.company, step: 1 },
    { label: 'Territory', value: formData.territory, step: 1 },
    { label: 'Products', value: products.join(', '), step: 1 },
  ];

  return (
    <div className="relative min-h-screen bg-white overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 30% 0%, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 30% 0%, black 20%, transparent 75%)',
        }}
      />
      <div className="container relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* Header */}
        <header className="mb-8 sm:mb-10 max-w-2xl">
          <p className="animate-fade-up-in inline-flex items-center gap-2 rounded-full border border-brand-blue/25 bg-blue-50 px-3 py-1 text-xs sm:text-sm font-medium text-brand-blue mb-4">
            <Icon d={icons.users} className="w-3.5 h-3.5" />
            For medical representatives
          </p>
          <h1 className="animate-fade-up-in text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-gray-900 tracking-tight leading-[1.1]">
            Register as a medical rep
          </h1>
          <p className="animate-fade-up-in text-base sm:text-lg text-gray-600 mt-3" style={{ animationDelay: '90ms' }}>
            Set up your company profile and connect with clinics that use MyClinicSoft.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6 lg:gap-10 items-start">
          <div>
            {/* Steps */}
            <ol className="mb-5 grid grid-cols-3 gap-2">
              {STEPS.map((step, index) => {
                const done = index < currentStep;
                const active = index === currentStep;
                return (
                  <li key={step.title}>
                    <button
                      type="button"
                      onClick={() => done && goTo(index)}
                      disabled={!done}
                      aria-current={active ? 'step' : undefined}
                      className="group w-full text-left disabled:cursor-default"
                    >
                      <span
                        className={`block h-1 rounded-full transition-colors duration-200 ${
                          done || active ? 'bg-brand-teal' : 'bg-gray-200'
                        }`}
                      />
                      <span className="mt-2.5 flex items-center gap-2">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold ${
                            done
                              ? 'bg-brand-teal text-white'
                              : active
                                ? 'bg-brand-teal-light text-brand-teal-deep'
                                : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {done ? <Icon d={icons.check} className="w-3 h-3" /> : index + 1}
                        </span>
                        <span
                          className={`text-sm font-semibold ${active ? 'text-gray-900' : done ? 'text-gray-700 group-hover:text-brand-teal-dark' : 'text-gray-400'}`}
                        >
                          {step.title}
                        </span>
                      </span>
                      <span className="hidden sm:block pl-7 text-xs text-gray-500">{step.description}</span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <form onSubmit={handleSubmit} noValidate className="rounded-xl border border-gray-200 bg-white">
              <div className="p-5 sm:p-7">
                {error && (
                  <div role="alert" className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <Icon d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 shrink-0 text-red-600" />
                    <p className="font-medium">{error}</p>
                  </div>
                )}

                {/* Step 1: About you */}
                {currentStep === 0 && (
                  <fieldset className="space-y-4">
                    <legend className="text-lg font-bold text-gray-900 tracking-tight mb-4">About you</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-[7rem_1fr_1fr] gap-4">
                      <div>
                        <label htmlFor="mr-onboard-title" className={labelClass}>
                          Title
                        </label>
                        <input
                          id="mr-onboard-title"
                          type="text"
                          maxLength={20}
                          value={formData.title}
                          onChange={(e) => handleInputChange('title', e.target.value)}
                          className={inputClass}
                          placeholder="Ms."
                        />
                      </div>
                      <div>
                        <label htmlFor="mr-onboard-first-name" className={labelClass}>
                          First name <Required />
                        </label>
                        <input
                          id="mr-onboard-first-name"
                          type="text"
                          required
                          autoComplete="given-name"
                          value={formData.firstName}
                          onChange={(e) => handleInputChange('firstName', e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label htmlFor="mr-onboard-last-name" className={labelClass}>
                          Last name <Required />
                        </label>
                        <input
                          id="mr-onboard-last-name"
                          type="text"
                          required
                          autoComplete="family-name"
                          value={formData.lastName}
                          onChange={(e) => handleInputChange('lastName', e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="mr-onboard-email" className={labelClass}>
                          Work email <Required />
                        </label>
                        <input
                          id="mr-onboard-email"
                          type="email"
                          required
                          autoComplete="email"
                          value={formData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          className={inputClass}
                          placeholder="you@company.com"
                        />
                      </div>
                      <div>
                        <label htmlFor="mr-onboard-phone" className={labelClass}>
                          Mobile number <Required />
                        </label>
                        <input
                          id="mr-onboard-phone"
                          type="tel"
                          required
                          autoComplete="tel"
                          value={formData.phone}
                          onChange={(e) => handleInputChange('phone', e.target.value)}
                          className={inputClass}
                          placeholder="0917 123 4567"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="mr-onboard-bio" className={labelClass}>
                        Short bio <Optional />
                      </label>
                      <textarea
                        id="mr-onboard-bio"
                        value={formData.bio}
                        maxLength={2000}
                        onChange={(e) => handleInputChange('bio', e.target.value)}
                        className={`${inputClass} resize-y`}
                        placeholder="A line or two clinics will see on your profile"
                        rows={3}
                      />
                    </div>
                  </fieldset>
                )}

                {/* Step 2: Company */}
                {currentStep === 1 && (
                  <fieldset className="space-y-4">
                    <legend className="text-lg font-bold text-gray-900 tracking-tight mb-4">Company</legend>
                    <div>
                      <label htmlFor="mr-onboard-company" className={labelClass}>
                        Company name <Required />
                      </label>
                      <input
                        id="mr-onboard-company"
                        type="text"
                        required
                        autoComplete="organization"
                        value={formData.company}
                        onChange={(e) => handleInputChange('company', e.target.value)}
                        className={inputClass}
                        placeholder="Pharmaceutical company"
                      />
                    </div>
                    <div>
                      <label htmlFor="mr-onboard-territory" className={labelClass}>
                        Territory <Required />
                      </label>
                      <input
                        id="mr-onboard-territory"
                        type="text"
                        required
                        value={formData.territory}
                        onChange={(e) => handleInputChange('territory', e.target.value)}
                        className={inputClass}
                        placeholder="e.g. Metro Manila, Cebu"
                      />
                    </div>
                    <div>
                      <label htmlFor="mr-onboard-products" className={labelClass}>
                        Products you represent <Optional />
                      </label>
                      <textarea
                        id="mr-onboard-products"
                        value={formData.products}
                        onChange={(e) => handleInputChange('products', e.target.value)}
                        className={`${inputClass} resize-y`}
                        placeholder="e.g. Antibiotics, Pain relief, Vitamins"
                        rows={3}
                        aria-describedby="mr-onboard-products-hint"
                      />
                      <p id="mr-onboard-products-hint" className="text-xs text-gray-500 mt-1.5">
                        Separate products with commas.
                      </p>
                      {products.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Products">
                          {products.map((p) => (
                            <li key={p} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-700">
                              {p}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </fieldset>
                )}

                {/* Step 3: Review */}
                {currentStep === 2 && (
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 tracking-tight mb-4">Review your details</h2>
                    <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                      {review.map((row) => (
                        <div key={row.label} className="grid grid-cols-[6.5rem_1fr_auto] items-baseline gap-3 px-4 py-3 text-sm">
                          <dt className="text-gray-500">{row.label}</dt>
                          <dd className={`min-w-0 break-words ${row.value ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                            {row.value || 'Not given'}
                          </dd>
                          <dd>
                            <button
                              type="button"
                              onClick={() => goTo(row.step)}
                              className="text-xs font-semibold text-brand-teal-dark hover:underline underline-offset-2"
                            >
                              Edit
                            </button>
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-4 rounded-md border border-brand-teal/30 bg-brand-teal-light/50 px-4 py-3 text-sm text-brand-teal-deep">
                      {onlineFee
                        ? `After you submit, you'll go to PayMongo to pay the ${peso(onlineFee)} activation fee. Your account activates as soon as the payment is confirmed.`
                        : 'After you submit, our team will verify your registration and contact you about activation.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between gap-3 border-t border-gray-100 p-5 sm:px-7">
                {currentStep > 0 ? (
                  <button
                    type="button"
                    onClick={() => goTo(currentStep - 1)}
                    className="rounded-md border border-gray-300 px-5 py-2.5 font-semibold text-gray-700 transition-colors duration-150 hover:border-gray-900 hover:text-gray-900"
                  >
                    Back
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="group inline-flex items-center justify-center gap-2 rounded-md bg-brand-teal px-6 py-2.5 font-semibold text-white shadow-[0_6px_20px_rgba(14,165,164,0.3)] transition-colors duration-150 hover:bg-brand-teal-dark disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                >
                  {submitting ? (
                    <>
                      <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      Submitting…
                    </>
                  ) : currentStep < STEPS.length - 1 ? (
                    <>
                      Continue
                      <Icon d={icons.arrow} className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </>
                  ) : onlineFee ? (
                    <>
                      Submit and pay {peso(onlineFee)}
                      <Icon d={icons.arrow} className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </>
                  ) : (
                    'Submit registration'
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* How activation works */}
          <aside className="lg:sticky lg:top-28 space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal-dark mb-4">How activation works</p>
              <ol className="space-y-4">
                {activation.map((a, i) => (
                  <li key={a.title} className="flex gap-3">
                    <span className="font-mono text-[11px] font-semibold text-gray-400 pt-0.5">0{i + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                      <p className="text-sm text-gray-500 leading-snug mt-0.5">{a.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
              <p className="font-semibold text-gray-900">Questions before you register?</p>
              <p className="mt-1">
                Our team can walk you through it.{' '}
                <Link href="/contact" className="font-semibold text-brand-teal-dark hover:underline underline-offset-2">
                  Contact us
                </Link>
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
