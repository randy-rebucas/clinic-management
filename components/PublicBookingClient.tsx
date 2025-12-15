'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';

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

export default function PublicBookingClient() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [hasSubdomain, setHasSubdomain] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [availableClinics, setAvailableClinics] = useState<Clinic[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);
  const [showClinicSelection, setShowClinicSelection] = useState(false);
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
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

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
          setShowClinicSelection(true);
          setLoading(false);
        } else {
          // Has subdomain, get tenant info and fetch doctors
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
          fetchDoctors();
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
    } finally {
      setLoadingClinics(false);
    }
  };

  const handleClinicSelect = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    // Redirect to clinic's subdomain for booking
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol;
      const rootDomain = window.location.hostname.split('.').slice(-2).join('.');
      const port = window.location.port ? `:${window.location.port}` : '';
      const bookingUrl = `${protocol}//${clinic.subdomain}.${rootDomain}${port}/book`;
      window.location.href = bookingUrl;
    }
  };

  useEffect(() => {
    if (!showClinicSelection && selectedClinic) {
      fetchDoctors();
    }
  }, [showClinicSelection, selectedClinic]);

  useEffect(() => {
    if (selectedDate && selectedDoctor && !showClinicSelection) {
      fetchAvailableSlots(selectedDate, selectedDoctor);
    } else {
      setAvailableSlots([]);
    }
  }, [selectedDate, selectedDoctor, showClinicSelection]);

  const fetchDoctors = async () => {
    try {
      const url = selectedClinic 
        ? `/api/appointments/public?tenantId=${selectedClinic._id}`
        : '/api/appointments/public';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDoctors(data.data.doctors || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch doctors:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableSlots = async (date: string, doctorId: string) => {
    try {
      const tenantParam = selectedClinic ? `&tenantId=${selectedClinic._id}` : '';
      const res = await fetch(`/api/appointments/public?date=${date}&doctorId=${doctorId}${tenantParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAvailableSlots(data.data.availableSlots || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch available slots:', error);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess(false);

    try {
      // Add tenantId if clinic is selected
      const payload: any = {
        ...formData,
        doctorId: selectedDoctor,
        appointmentDate: selectedDate,
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
        setSuccess(true);
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
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const hour = hours % 12 || 12;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    return `${hour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  // Show clinic selection if no subdomain
  if (showClinicSelection && !hasSubdomain) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        {/* Abstract Background Elements */}
        <div className="fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"></div>
          <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
          <div className="absolute top-20 right-10 w-72 h-72 border-4 border-blue-200/20 rotate-45 rounded-3xl"></div>
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16 relative z-10">
          <div className="bg-white/90 backdrop-blur-sm border border-gray-200/50 rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-8 lg:p-10">
            <div className="text-center mb-8 sm:mb-10">
              <div className="inline-flex items-center justify-center w-14 h-14 sm:w-18 sm:h-18 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl sm:rounded-3xl mb-4 sm:mb-6 shadow-xl">
                <svg className="w-7 h-7 sm:w-9 sm:h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-3 tracking-tight">Book an Appointment</h1>
              <p className="text-base sm:text-lg text-gray-600">Select your clinic to continue</p>
            </div>

            {loadingClinics ? (
              <div className="flex items-center justify-center py-12 sm:py-16">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  </div>
                  <p className="text-base sm:text-lg text-gray-600 font-medium">Loading clinics...</p>
                </div>
              </div>
            ) : availableClinics.length === 0 ? (
              <div className="text-center py-12 sm:py-16">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <p className="text-gray-600 mb-4 text-base sm:text-lg">No clinics available at the moment.</p>
                <Link href="/tenant-onboard" className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105">
                  Register a new clinic
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-h-96 overflow-y-auto pr-2">
                {availableClinics.map((clinic) => (
                  <button
                    key={clinic._id}
                    type="button"
                    onClick={() => handleClinicSelect(clinic)}
                    className="w-full p-6 sm:p-8 border-2 border-gray-200 rounded-2xl text-left hover:border-blue-400 hover:bg-gradient-to-br hover:from-blue-50 hover:to-indigo-50 transition-all shadow-md hover:shadow-xl transform hover:scale-[1.02] bg-white/80 backdrop-blur-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-lg sm:text-xl text-gray-900 mb-2">{clinic.displayName || clinic.name}</h4>
                        {clinic.address && (clinic.address.city || clinic.address.state) && (
                          <p className="text-sm sm:text-base text-gray-600 mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {[clinic.address.city, clinic.address.state].filter(Boolean).join(', ')}
                          </p>
                        )}
                        {clinic.phone && (
                          <p className="text-sm text-gray-600 flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            {clinic.phone}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 sm:mt-8 pt-6 border-t border-gray-200/50">
              <p className="text-sm sm:text-base text-gray-600 text-center">
                Don&apos;t see your clinic?{' '}
                <Link href="/tenant-onboard" className="text-blue-600 hover:text-blue-700 font-semibold underline decoration-2 underline-offset-2">
                  Register a new clinic
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
        {/* Abstract Background */}
        <div className="fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"></div>
          <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        </div>
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
          <p className="text-base sm:text-lg text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Abstract Background Elements */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"></div>
        <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        <div className="absolute top-20 right-10 w-72 h-72 border-4 border-blue-200/20 rotate-45 rounded-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16 relative z-10">
        <div className="bg-white/90 backdrop-blur-sm border border-gray-200/50 rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 sm:w-18 sm:h-18 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl sm:rounded-3xl mb-4 sm:mb-6 shadow-xl">
                <svg className="w-7 h-7 sm:w-9 sm:h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-3 tracking-tight">Book an Appointment</h1>
              <p className="text-base sm:text-lg text-gray-600">Fill out the form below to request an appointment</p>
            </div>

            {success && (
              <div className="p-4 sm:p-5 bg-green-50/90 backdrop-blur-sm border-2 border-green-200 rounded-xl sm:rounded-2xl text-sm sm:text-base text-green-800 shadow-lg">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="font-semibold mb-1">Appointment request submitted successfully!</p>
                    <p className="text-green-700">You will receive a confirmation shortly.</p>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 sm:p-5 bg-red-50/90 backdrop-blur-sm border-2 border-red-200 rounded-xl sm:rounded-2xl text-sm sm:text-base text-red-800 shadow-lg">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p className="font-semibold">{error}</p>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              {/* Patient Information */}
              <div className="pb-6 sm:pb-8 border-b border-gray-200/50">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  Patient Information
                </h2>
                <div className="flex flex-col gap-4 md:flex-row md:flex-wrap">
                  <div className="md:flex-1 md:min-w-[200px]" style={{ flex: '1 1 calc(50% - 8px)', minWidth: '200px' }}>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={formData.patientFirstName}
                      onChange={(e) => setFormData({ ...formData, patientFirstName: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                    />
                  </div>
                  <div className="md:flex-1 md:min-w-[200px]" style={{ flex: '1 1 calc(50% - 8px)', minWidth: '200px' }}>
                    <label className="block text-xs font-medium mb-2">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={formData.patientLastName}
                      onChange={(e) => setFormData({ ...formData, patientLastName: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                    />
                  </div>
                  <div className="md:flex-1 md:min-w-[200px]" style={{ flex: '1 1 calc(50% - 8px)', minWidth: '200px' }}>
                    <label className="block text-xs font-medium mb-2">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.patientEmail}
                      onChange={(e) => setFormData({ ...formData, patientEmail: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                    />
                  </div>
                  <div className="md:flex-1 md:min-w-[200px]" style={{ flex: '1 1 calc(50% - 8px)', minWidth: '200px' }}>
                    <label className="block text-xs font-medium mb-2">
                      Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.patientPhone}
                      onChange={(e) => setFormData({ ...formData, patientPhone: e.target.value })}
                      placeholder="+1234567890"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                    />
                  </div>
                </div>
              </div>

              {/* Appointment Details */}
              <div className="pb-6 sm:pb-8 border-b border-gray-200/50">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  Appointment Details
                </h2>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Doctor <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={selectedDoctor}
                      onChange={(e) => {
                        setSelectedDoctor(e.target.value);
                        setFormData({ ...formData, doctorId: e.target.value });
                      }}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                    >
                      <option value="">Select a doctor</option>
                      {doctors.map((doctor) => (
                        <option key={doctor._id} value={doctor._id}>
                          Dr. {doctor.firstName} {doctor.lastName} - {doctor.specialization}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-4 md:flex-row">
                    <div className="md:flex-1" style={{ flex: 1 }}>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Preferred Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        min={getMinDate()}
                        value={selectedDate}
                        onChange={(e) => {
                          setSelectedDate(e.target.value);
                          setFormData({ ...formData, appointmentDate: e.target.value });
                        }}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                      />
                    </div>
                    <div className="md:flex-1" style={{ flex: 1 }}>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Preferred Time <span className="text-red-500">*</span>
                      </label>
                      {availableSlots.length > 0 ? (
                        <select
                          required
                          value={formData.appointmentTime}
                          onChange={(e) => setFormData({ ...formData, appointmentTime: e.target.value })}
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                        >
                          <option value="">Select a time</option>
                          {availableSlots.map((slot) => (
                            <option key={slot} value={slot}>
                              {formatTime(slot)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="time"
                          required
                          value={formData.appointmentTime}
                          onChange={(e) => setFormData({ ...formData, appointmentTime: e.target.value })}
                          disabled={!selectedDate || !selectedDoctor}
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      )}
                      {selectedDate && selectedDoctor && availableSlots.length === 0 && (
                        <p className="text-sm text-gray-500 mt-2 flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          No available slots. Please select a different date or doctor.
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Reason for Visit</label>
                    <textarea
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      rows={4}
                      placeholder="Brief description of your reason for the appointment..."
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Preferred Room (Optional)</label>
                    <input
                      value={formData.room}
                      onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                      placeholder="e.g., Room 101"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                    />
                  </div>
                </div>
              </div>

              <hr className="border-gray-200/50" />
              <div className="flex flex-col gap-4 sm:gap-6 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-600 sm:mb-0">
                  * Required fields. Your appointment request will be reviewed and confirmed.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-blue-400 disabled:to-indigo-400 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base sm:text-lg"
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Submitting...
                    </>
                  ) : (
                    'Request Appointment'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
