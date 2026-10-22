'use client';

import { useState, useEffect, useSyncExternalStore, FormEvent } from 'react';
import Link from 'next/link';
import { getHostSubdomain, subscribeNoop } from './utils/hostSubdomain';
import { toDateKey } from './utils/dateKey';
import TurnstileWidget, { TURNSTILE_SITE_KEY } from './TurnstileWidget';

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

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  specialization: string;
}

interface BookingFormData {
  patientFirstName: string;
  patientLastName: string;
  patientEmail: string;
  patientPhone: string;
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
  reason: string;
  room?: string;
}

interface BookedSummary {
  doctor: string;
  date: string;
  time: string;
}

function Icon({ d, className = 'w-5 h-5' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

const icons = {
  arrow: 'M13 7l5 5m0 0l-5 5m5-5H6',
  chevron: 'M9 5l7 7-7 7',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  pin: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z',
  phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  building: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  check: 'M5 13l4 4L19 7',
  alert: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  mobile: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
};

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3.5 py-2.5 text-base text-gray-900 placeholder:text-gray-400 transition-colors duration-150 hover:border-gray-400 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/25 disabled:cursor-not-allowed disabled:bg-gray-50';

const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5';

const nextSteps = [
  'The clinic reviews your request.',
  'You get a confirmation by SMS.',
  'On the day, check in at the front desk or by QR.',
];

function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-16">
      <div className="h-9 w-9 rounded-full border-[3px] border-brand-teal-light border-t-brand-teal animate-spin" />
      <p className="text-sm font-medium text-gray-500">{label}</p>
    </div>
  );
}

/** White page with the faint grid used across the public site. */
function Shell({ children }: { children: React.ReactNode }) {
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
      <div className="container relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">{children}</div>
    </div>
  );
}

function PageHeader({ step, title, children }: { step: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-8 sm:mb-10">
      <p className="animate-fade-up-in inline-flex items-center gap-2 rounded-full border border-brand-teal/30 bg-brand-teal-light/70 px-3 py-1 text-xs sm:text-sm font-medium text-brand-teal-deep mb-4">
        <Icon d={icons.calendar} className="w-3.5 h-3.5" />
        {step}
      </p>
      <h1 className="animate-fade-up-in text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-gray-900 tracking-tight leading-[1.1]">
        {title}
      </h1>
      {children && (
        <p className="animate-fade-up-in text-base sm:text-lg text-gray-600 mt-3 max-w-2xl" style={{ animationDelay: '90ms' }}>
          {children}
        </p>
      )}
    </header>
  );
}

function SectionTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-lg font-bold text-gray-900 tracking-tight mb-4">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-teal-light font-mono text-xs font-semibold text-brand-teal-deep">
        {n}
      </span>
      {children}
    </h2>
  );
}

export default function PublicBookingClient() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [fetchedSlots, setAvailableSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [availableClinics, setAvailableClinics] = useState<Clinic[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);
  const [clinicQuery, setClinicQuery] = useState('');
  const subdomain = useSyncExternalStore(subscribeNoop, getHostSubdomain, () => null);
  // On the root domain the visitor first picks a clinic, then books on its subdomain.
  const showClinicSelection = subdomain === '';
  const slotsEnabled = Boolean(selectedDate && selectedDoctor && !showClinicSelection);
  const availableSlots = slotsEnabled ? fetchedSlots : [];
  const [formData, setFormData] = useState<BookingFormData>({
    patientFirstName: '',
    patientLastName: '',
    patientEmail: '',
    patientPhone: '',
    doctorId: '',
    appointmentDate: '',
    appointmentTime: '',
    reason: '',
    room: '',
  });
  const [booked, setBooked] = useState<BookedSummary | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Turnstile tokens are single-use: bumping this remounts the widget after each attempt.
  const [captchaKey, setCaptchaKey] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (subdomain === null) return;
    let cancelled = false;
    const fetchClinics = async () => {
      try {
        const res = await fetch('/api/tenants/public');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.success && data.tenants) {
            setAvailableClinics(data.tenants);
          }
        }
      } catch (error) {
        console.error('Failed to fetch clinics:', error);
      } finally {
        if (!cancelled) setLoadingClinics(false);
      }
    };
    const fetchClinicAndDoctors = async () => {
      let clinic: Clinic | null = null;
      try {
        const res = await fetch(`/api/tenants/public?subdomain=${encodeURIComponent(subdomain)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.tenant) clinic = data.tenant;
        }
      } catch (error) {
        console.error('Failed to fetch tenant info:', error);
      }
      if (cancelled) return;
      if (clinic) setSelectedClinic(clinic);
      try {
        const url = clinic
          ? `/api/appointments/public?tenantId=${clinic._id}`
          : '/api/appointments/public';
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.success) {
            setDoctors(data.data.doctors || []);
          }
        }
      } catch (error) {
        console.error('Failed to fetch doctors:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (subdomain === '') {
      fetchClinics();
    } else {
      fetchClinicAndDoctors();
    }
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  const handleClinicSelect = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    // Redirect to clinic's subdomain for booking
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol;
      const rootDomain = window.location.hostname.split('.').slice(-2).join('.');
      const port = window.location.port ? `:${window.location.port}` : '';
      const bookingUrl = `${protocol}//${clinic.subdomain}.${rootDomain}${port}/book`;
      window.open(bookingUrl, '_self');
    }
  };

  const tenantId = selectedClinic?._id;
  useEffect(() => {
    if (!slotsEnabled) return;
    let cancelled = false;
    const fetchAvailableSlots = async () => {
      try {
        const tenantParam = tenantId ? `&tenantId=${tenantId}` : '';
        const res = await fetch(`/api/appointments/public?date=${selectedDate}&doctorId=${selectedDoctor}${tenantParam}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.success) {
            setAvailableSlots(data.data.availableSlots || []);
          }
        }
      } catch (error) {
        console.error('Failed to fetch available slots:', error);
      }
    };
    fetchAvailableSlots();
    return () => {
      cancelled = true;
    };
  }, [slotsEnabled, selectedDate, selectedDoctor, tenantId]);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const hour = hours % 12 || 12;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    return `${hour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const formatDate = (dateKey: string) =>
    new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-PH', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toDateKey(tomorrow);
  };

  const doctorLabel = (id: string) => {
    const doctor = doctors.find((d) => d._id === id);
    return doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBooked(null);
    if (!availableSlots.includes(formData.appointmentTime)) {
      setError('Please choose one of the available times.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);

    try {
      // Add tenantId if clinic is selected
      const payload: any = {
        ...formData,
        doctorId: selectedDoctor,
        appointmentDate: selectedDate,
        turnstileToken: captchaToken ?? undefined,
      };

      if (selectedClinic) {
        payload.tenantId = selectedClinic._id;
      }

      const res = await fetch('/api/appointments/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        setBooked({
          doctor: doctorLabel(selectedDoctor),
          date: formatDate(selectedDate),
          time: formatTime(formData.appointmentTime),
        });
        // Reset form
        setFormData({
          patientFirstName: '',
          patientLastName: '',
          patientEmail: '',
          patientPhone: '',
          doctorId: '',
          appointmentDate: '',
          appointmentTime: '',
          reason: '',
          room: '',
        });
        setSelectedDate('');
        setSelectedDoctor('');
        setAvailableSlots([]);
      } else {
        setError(data.error || 'Failed to book appointment');
      }
    } catch (error) {
      console.error('Failed to book appointment:', error);
      setError('Failed to submit appointment request. Please try again.');
    } finally {
      setSubmitting(false);
      setCaptchaKey((k) => k + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Root domain: pick a clinic first
  if (showClinicSelection) {
    const q = clinicQuery.trim().toLowerCase();
    const clinics = q
      ? availableClinics.filter((c) =>
          [c.displayName, c.name, c.address?.city, c.address?.state]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q)),
        )
      : availableClinics;

    return (
      <Shell>
        <PageHeader step="Step 1 of 2 · Choose your clinic" title="Book an appointment">
          Pick the clinic you want to visit. You&apos;ll choose your doctor and an open time next.
        </PageHeader>

        {loadingClinics ? (
          <Spinner label="Loading clinics…" />
        ) : availableClinics.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-6 py-14 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400">
              <Icon d={icons.building} />
            </div>
            <p className="font-semibold text-gray-900">No clinics are taking online bookings yet</p>
            <p className="text-sm text-gray-500 mt-1">Please check back soon, or contact your clinic directly.</p>
          </div>
        ) : (
          <>
            {availableClinics.length > 4 && (
              <div className="relative mb-5 max-w-md">
                <Icon d={icons.search} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <label htmlFor="clinic-search" className="sr-only">Search clinics</label>
                <input
                  id="clinic-search"
                  type="search"
                  value={clinicQuery}
                  onChange={(e) => setClinicQuery(e.target.value)}
                  placeholder="Search by clinic name or city"
                  className={`${inputClass} pl-10`}
                />
              </div>
            )}

            {clinics.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500">
                No clinics match &ldquo;{clinicQuery}&rdquo;.
              </p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {clinics.map((clinic) => {
                  const name = clinic.displayName || clinic.name;
                  const place = [clinic.address?.city, clinic.address?.state].filter(Boolean).join(', ');
                  return (
                    <li key={clinic._id}>
                      <button
                        type="button"
                        onClick={() => handleClinicSelect(clinic)}
                        className="group flex h-full w-full items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 text-left transition-[border-color,box-shadow] duration-200 hover:border-brand-teal/50 hover:shadow-[0_12px_40px_rgb(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand-teal-light text-lg font-bold text-brand-teal-deep">
                          {name.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-gray-900 leading-snug group-hover:text-brand-teal-dark">
                            {name}
                          </span>
                          {place && (
                            <span className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                              <Icon d={icons.pin} className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{place}</span>
                            </span>
                          )}
                          {clinic.phone && (
                            <span className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500">
                              <Icon d={icons.phone} className="w-3.5 h-3.5 shrink-0" />
                              {clinic.phone}
                            </span>
                          )}
                        </span>
                        <Icon
                          d={icons.chevron}
                          className="mt-1 w-4 h-4 shrink-0 text-gray-300 transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-brand-teal"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <div className="mt-10 flex flex-col gap-4 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            Run a clinic that isn&apos;t listed?{' '}
            <Link href="/tenant-onboard" className="font-semibold text-brand-teal-dark hover:underline underline-offset-2">
              Start a free trial
            </Link>
          </p>
          <Link
            href="/download"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-brand-teal-dark"
          >
            <Icon d={icons.mobile} className="w-4 h-4 text-brand-teal-dark" />
            Book faster with the eMCR app
          </Link>
        </div>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        <Spinner label="Loading…" />
      </Shell>
    );
  }

  const clinicName = selectedClinic ? selectedClinic.displayName || selectedClinic.name : '';
  const clinicAddress = selectedClinic?.address
    ? [selectedClinic.address.street, selectedClinic.address.city, selectedClinic.address.state].filter(Boolean).join(', ')
    : '';

  const summary = [
    { label: 'Doctor', value: doctorLabel(selectedDoctor) },
    { label: 'Date', value: selectedDate ? formatDate(selectedDate) : '' },
    { label: 'Time', value: formData.appointmentTime ? formatTime(formData.appointmentTime) : '' },
  ];

  return (
    <Shell>
      <PageHeader
        step={clinicName ? `Booking at ${clinicName}` : 'Online booking'}
        title={booked ? 'Request sent' : 'Book an appointment'}
      >
        {booked
          ? 'The clinic will confirm your appointment shortly.'
          : 'Choose a doctor and an open time, then tell us who’s coming.'}
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6 lg:gap-10 items-start">
        <div>
          {error && (
            <div role="alert" className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <Icon d={icons.alert} className="w-5 h-5 shrink-0 text-red-600" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          {booked ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal-light text-brand-teal-dark">
                <Icon d={icons.check} className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">Your request is in</h2>
              <p className="text-gray-600 mt-1">We&apos;ll text a confirmation to the mobile number you gave us.</p>
              <dl className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Doctor', value: booked.doctor },
                  { label: 'Date', value: booked.date },
                  { label: 'Time', value: booked.time },
                ].map((row) => (
                  <div key={row.label} className="rounded-md border border-gray-100 bg-gray-50/70 p-3.5">
                    <dt className="text-xs text-gray-500">{row.label}</dt>
                    <dd className="font-semibold text-gray-900 mt-0.5">{row.value || '—'}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setBooked(null)}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-teal px-5 py-2.5 font-semibold text-white transition-colors duration-150 hover:bg-brand-teal-dark"
                >
                  Book another visit
                </button>
                <Link
                  href="/download"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-5 py-2.5 font-semibold text-gray-900 transition-colors duration-150 hover:border-gray-900"
                >
                  <Icon d={icons.mobile} className="w-4 h-4 text-brand-teal-dark" />
                  Track it in eMCR
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
              {/* Doctor & time */}
              <fieldset className="p-5 sm:p-7">
                <legend className="sr-only">Doctor and time</legend>
                <SectionTitle n={1}>Doctor &amp; time</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="booking-doctor" className={labelClass}>
                      Doctor <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="booking-doctor"
                      required
                      value={selectedDoctor}
                      onChange={(e) => {
                        setSelectedDoctor(e.target.value);
                        setFormData({ ...formData, doctorId: e.target.value, appointmentTime: '' });
                      }}
                      className={inputClass}
                    >
                      <option value="">Select a doctor</option>
                      {doctors.map((doctor) => (
                        <option key={doctor._id} value={doctor._id}>
                          Dr. {doctor.firstName} {doctor.lastName} — {doctor.specialization}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2 sm:max-w-xs">
                    <label htmlFor="booking-date" className={labelClass}>
                      Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="booking-date"
                      type="date"
                      required
                      min={getMinDate()}
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setFormData({ ...formData, appointmentDate: e.target.value, appointmentTime: '' });
                      }}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Only offered slots can be booked (clinic hours + doctor schedule). */}
                <div className="mt-5">
                  <p id="booking-time-label" className={labelClass}>
                    Time <span className="text-red-500">*</span>
                  </p>
                  {!selectedDoctor || !selectedDate ? (
                    <p className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50/70 px-4 py-3 text-sm text-gray-500">
                      <Icon d={icons.info} className="w-4 h-4 shrink-0 text-gray-400" />
                      Pick a doctor and date to see open times.
                    </p>
                  ) : availableSlots.length === 0 ? (
                    <p className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50/70 px-4 py-3 text-sm text-gray-500">
                      <Icon d={icons.info} className="w-4 h-4 shrink-0 text-gray-400" />
                      No open times on this day. Try another date or doctor.
                    </p>
                  ) : (
                    <div role="radiogroup" aria-labelledby="booking-time-label" className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {availableSlots.map((slot) => {
                        const active = formData.appointmentTime === slot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setFormData({ ...formData, appointmentTime: slot })}
                            className={`rounded-md border px-2 py-2 font-mono text-sm tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-1 ${
                              active
                                ? 'border-brand-teal bg-brand-teal text-white'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-brand-teal/50 hover:bg-brand-teal-light/50'
                            }`}
                          >
                            {formatTime(slot)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </fieldset>

              {/* Patient */}
              <fieldset className="p-5 sm:p-7">
                <legend className="sr-only">Your details</legend>
                <SectionTitle n={2}>Your details</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="booking-first-name" className={labelClass}>
                      First name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="booking-first-name"
                      required
                      autoComplete="given-name"
                      value={formData.patientFirstName}
                      onChange={(e) => setFormData({ ...formData, patientFirstName: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="booking-last-name" className={labelClass}>
                      Last name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="booking-last-name"
                      required
                      autoComplete="family-name"
                      value={formData.patientLastName}
                      onChange={(e) => setFormData({ ...formData, patientLastName: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="booking-email" className={labelClass}>
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="booking-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={formData.patientEmail}
                      onChange={(e) => setFormData({ ...formData, patientEmail: e.target.value })}
                      placeholder="you@example.com"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="booking-phone" className={labelClass}>
                      Mobile number <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="booking-phone"
                      type="tel"
                      required
                      autoComplete="tel"
                      value={formData.patientPhone}
                      onChange={(e) => setFormData({ ...formData, patientPhone: e.target.value })}
                      placeholder="0917 123 4567"
                      className={inputClass}
                    />
                  </div>
                </div>
              </fieldset>

              {/* Reason */}
              <fieldset className="p-5 sm:p-7">
                <legend className="sr-only">Reason for visit</legend>
                <SectionTitle n={3}>Reason for visit</SectionTitle>
                <label htmlFor="booking-reason" className="sr-only">Reason for visit</label>
                <textarea
                  id="booking-reason"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  rows={3}
                  placeholder="Optional — e.g. follow-up check, fever for 3 days, lab result review"
                  className={`${inputClass} resize-y`}
                />
              </fieldset>

              {TURNSTILE_SITE_KEY && (
                <div className="px-5 pt-5 sm:px-7">
                  <TurnstileWidget key={captchaKey} onToken={setCaptchaToken} />
                </div>
              )}
              <div className="flex flex-col gap-4 p-5 sm:p-7 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-500">
                  <span className="text-red-500">*</span> Required. The clinic will confirm your request.
                </p>
                <button
                  type="submit"
                  disabled={submitting || (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)}
                  className="group inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-md bg-brand-teal px-6 py-3 font-semibold text-white shadow-[0_6px_20px_rgba(14,165,164,0.3)] transition-colors duration-150 hover:bg-brand-teal-dark disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                >
                  {submitting ? (
                    <>
                      <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      Sending request…
                    </>
                  ) : (
                    <>
                      Request appointment
                      <Icon d={icons.arrow} className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-28 space-y-4">
          {selectedClinic && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-teal-light font-bold text-brand-teal-deep">
                  {clinicName.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 leading-snug">{clinicName}</p>
                  {clinicAddress && <p className="text-sm text-gray-500 mt-0.5">{clinicAddress}</p>}
                  {selectedClinic.phone && (
                    <a
                      href={`tel:${selectedClinic.phone}`}
                      className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-brand-teal-dark hover:underline underline-offset-2"
                    >
                      <Icon d={icons.phone} className="w-3.5 h-3.5" />
                      {selectedClinic.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {!booked && (
            <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal-dark mb-3">Your visit</p>
              <dl className="space-y-2.5">
                {summary.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="text-gray-500">{row.label}</dt>
                    <dd className={`text-right font-medium ${row.value ? 'text-gray-900' : 'text-gray-400'}`}>
                      {row.value || 'Not set'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 mb-3">What happens next</p>
            <ol className="space-y-3">
              {nextSteps.map((s, i) => (
                <li key={s} className="flex gap-3 text-sm text-gray-600">
                  <span className="font-mono text-[11px] font-semibold text-gray-400 pt-0.5">0{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </Shell>
  );
}
