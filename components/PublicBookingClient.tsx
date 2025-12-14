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
        // If hostname has more than 2 parts (e.g., clinic.localhost or clinic.example.com), we have a subdomain
        const hasSubdomain = parts.length > 2 || (parts.length === 2 && parts[0] !== 'localhost' && parts[0] !== 'www');
        setHasSubdomain(hasSubdomain);
        
        if (!hasSubdomain) {
          // No subdomain, fetch available clinics
          fetchClinics();
          setShowClinicSelection(true);
          setLoading(false);
        } else {
          // Has subdomain, get tenant info and fetch doctors
          try {
            const subdomain = parts[0];
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-6 sm:p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">Book an Appointment</h1>
              <p className="text-sm text-gray-600">Select your clinic to continue</p>
            </div>

            {loadingClinics ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-4">
                  <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-base text-gray-600">Loading clinics...</p>
                </div>
              </div>
            ) : availableClinics.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600 mb-4">No clinics available at the moment.</p>
                <Link href="/tenant-onboard" className="text-blue-600 hover:text-blue-700 font-semibold">
                  Register a new clinic
                </Link>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {availableClinics.map((clinic) => (
                  <button
                    key={clinic._id}
                    type="button"
                    onClick={() => handleClinicSelect(clinic)}
                    className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-blue-300 hover:bg-blue-50 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 mb-1">{clinic.displayName || clinic.name}</h4>
                        {clinic.address && (clinic.address.city || clinic.address.state) && (
                          <p className="text-sm text-gray-600 mb-1">
                            {[clinic.address.city, clinic.address.state].filter(Boolean).join(', ')}
                          </p>
                        )}
                        {clinic.phone && (
                          <p className="text-xs text-gray-500">📞 {clinic.phone}</p>
                        )}
                      </div>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-600 text-center">
                Don&apos;t see your clinic?{' '}
                <Link href="/tenant-onboard" className="text-blue-600 hover:text-blue-700 font-semibold">
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-base text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-6">
          <div className="flex flex-col gap-4 mb-4">
            <div className="text-center">
              <h1 className="text-3xl font-bold mb-2">Book an Appointment</h1>
              <p className="text-sm text-gray-600">Fill out the form below to request an appointment</p>
            </div>

            {success && (
              <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                Appointment request submitted successfully! You will receive a confirmation shortly.
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              {/* Patient Information */}
              <div className="pb-6 border-b border-gray-300">
                <h2 className="text-xl font-semibold mb-4">Patient Information</h2>
                <div className="flex flex-col gap-4 md:flex-row md:flex-wrap">
                  <div className="md:flex-1 md:min-w-[200px]" style={{ flex: '1 1 calc(50% - 8px)', minWidth: '200px' }}>
                    <label className="block text-xs font-medium mb-2">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={formData.patientFirstName}
                      onChange={(e) => setFormData({ ...formData, patientFirstName: e.target.value })}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Appointment Details */}
              <div className="pb-6 border-b border-gray-300">
                <h2 className="text-xl font-semibold mb-4">Appointment Details</h2>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-2">
                      Doctor <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={selectedDoctor}
                      onChange={(e) => {
                        setSelectedDoctor(e.target.value);
                        setFormData({ ...formData, doctorId: e.target.value });
                      }}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                      <label className="block text-xs font-medium mb-2">
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
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="md:flex-1" style={{ flex: 1 }}>
                      <label className="block text-xs font-medium mb-2">
                        Preferred Time <span className="text-red-500">*</span>
                      </label>
                      {availableSlots.length > 0 ? (
                        <select
                          required
                          value={formData.appointmentTime}
                          onChange={(e) => setFormData({ ...formData, appointmentTime: e.target.value })}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                        />
                      )}
                      {selectedDate && selectedDoctor && availableSlots.length === 0 && (
                        <p className="text-xs text-gray-500 mt-1">No available slots. Please select a different date or doctor.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-2">Reason for Visit</label>
                    <textarea
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      rows={3}
                      placeholder="Brief description of your reason for the appointment..."
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-2">Preferred Room (Optional)</label>
                    <input
                      value={formData.room}
                      onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                      placeholder="e.g., Room 101"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <hr className="border-gray-300" />
              <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-600 sm:mb-0">
                  * Required fields. Your appointment request will be reviewed and confirmed.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
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
