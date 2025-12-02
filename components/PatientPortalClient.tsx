'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'react-qr-code';

type TabType = 'overview' | 'appointments' | 'visits' | 'prescriptions' | 'lab-results' | 'invoices' | 'documents';

interface PatientData {
  _id: string;
  patientCode: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  dateOfBirth: string;
  sex?: string;
  email: string;
  phone: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  emergencyContact?: {
    name: string;
    phone: string;
    relationship?: string;
  };
  allergies?: any[];
  medicalHistory?: string;
  preExistingConditions?: any[];
  discountEligibility?: any;
}

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
}

export default function PatientPortalClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [labResults, setLabResults] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [cancellingAppointment, setCancellingAppointment] = useState<string | null>(null);
  
  // Booking state
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState('');
  const [bookingReason, setBookingReason] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  
  const router = useRouter();

  // Set initial active tab based on screen size
  useEffect(() => {
    const handleResize = () => {
      // On desktop (md breakpoint = 768px), default to overview tab
      if (window.innerWidth >= 768 && activeTab === null) {
        setActiveTab(null);
      }
    };
    
    // Set initial state
    handleResize();
    
    // No need to listen to resize - just set on mount
  }, []);

  useEffect(() => {
    fetchPatientData();
  }, []);

  const fetchPatientData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/patients/session?include=all');
      const data = await res.json();

      if (!data.success) {
        if (res.status === 401) {
          router.push('/patient/login');
          return;
        }
        setError(data.error || 'Failed to load patient data');
        return;
      }

      setPatient(data.data.patient);
      setAppointments(data.data.appointments || []);
      setVisits(data.data.visits || []);
      setPrescriptions(data.data.prescriptions || []);
      setLabResults(data.data.labResults || []);
      setInvoices(data.data.invoices || []);
      setDocuments(data.data.documents || []);
      setReferrals(data.data.referrals || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load patient data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/patients/session', { method: 'DELETE' });
      router.push('/patient/login');
    } catch (err) {
      console.error('Logout error:', err);
      router.push('/patient/login');
    }
  };

  // Booking functions
  const openBookingModal = async () => {
    setShowBookingModal(true);
    setBookingError(null);
    setBookingSuccess(null);
    setSelectedDoctor('');
    setSelectedDate('');
    setSelectedTime('');
    setBookingReason('');
    setAvailableSlots([]);
    
    // Fetch doctors
    try {
      const res = await fetch('/api/patients/appointments');
      const data = await res.json();
      if (data.success) {
        setDoctors(data.data.doctors || []);
      }
    } catch (err) {
      console.error('Error fetching doctors:', err);
    }
  };

  const fetchTimeSlots = async (date: string, doctorId: string) => {
    if (!date || !doctorId) return;
    
    setLoadingSlots(true);
    setSelectedTime('');
    try {
      const res = await fetch(`/api/patients/appointments?date=${date}&doctorId=${doctorId}`);
      const data = await res.json();
      if (data.success) {
        setAvailableSlots(data.data.availableSlots || []);
      }
    } catch (err) {
      console.error('Error fetching time slots:', err);
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    if (selectedDoctor) {
      fetchTimeSlots(date, selectedDoctor);
    }
  };

  const handleDoctorChange = (doctorId: string) => {
    setSelectedDoctor(doctorId);
    if (selectedDate) {
      fetchTimeSlots(selectedDate, doctorId);
    }
  };

  const submitBooking = async () => {
    if (!selectedDoctor || !selectedDate || !selectedTime) {
      setBookingError('Please select a doctor, date, and time');
      return;
    }

    setBookingLoading(true);
    setBookingError(null);

    try {
      const res = await fetch('/api/patients/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: selectedDoctor,
          appointmentDate: selectedDate,
          appointmentTime: selectedTime,
          reason: bookingReason || 'General Consultation',
        }),
      });

      const data = await res.json();

      if (data.success) {
        setBookingSuccess(data.message || 'Appointment booked successfully!');
        // Refresh appointments list
        fetchPatientData();
        // Reset form after delay
        setTimeout(() => {
          setShowBookingModal(false);
          setBookingSuccess(null);
        }, 3000);
      } else {
        setBookingError(data.error || 'Failed to book appointment');
      }
    } catch (err: any) {
      setBookingError(err.message || 'Failed to book appointment');
    } finally {
      setBookingLoading(false);
    }
  };

  const formatTimeSlot = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 60); // 60 days ahead
    return maxDate.toISOString().split('T')[0];
  };

  const cancelAppointment = async (appointmentId: string) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;
    
    setCancellingAppointment(appointmentId);
    try {
      const res = await fetch(`/api/patients/appointments/${appointmentId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (data.success) {
        // Refresh appointments
        fetchPatientData();
      } else {
        alert(data.error || 'Failed to cancel appointment');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to cancel appointment');
    } finally {
      setCancellingAppointment(null);
    }
  };

  const canCancelAppointment = (appointment: any) => {
    if (['completed', 'cancelled', 'no-show'].includes(appointment.status)) {
      return false;
    }
    const appointmentDateTime = new Date(appointment.appointmentDate);
    if (appointment.appointmentTime) {
      const [hours, minutes] = appointment.appointmentTime.split(':').map(Number);
      appointmentDateTime.setHours(hours, minutes, 0, 0);
    }
    return appointmentDateTime > new Date();
  };

  const getDocumentIcon = (category: string) => {
    switch (category) {
      case 'laboratory_result':
        return '🧪';
      case 'imaging':
        return '📷';
      case 'prescription':
        return '💊';
      case 'medical_certificate':
        return '📋';
      case 'referral':
        return '📤';
      case 'invoice':
        return '🧾';
      default:
        return '📄';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateAge = (dob: string) => {
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const getQRCodeData = () => {
    if (!patient) return '';
    return JSON.stringify({
      patientId: patient._id,
      patientCode: patient.patientCode,
      type: 'patient_login',
      timestamp: Date.now(),
    });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: 'bg-blue-100 text-blue-700',
      confirmed: 'bg-green-100 text-green-700',
      completed: 'bg-gray-100 text-gray-700',
      cancelled: 'bg-red-100 text-red-700',
      'no-show': 'bg-amber-100 text-amber-700',
      pending: 'bg-yellow-100 text-yellow-700',
      paid: 'bg-green-100 text-green-700',
      unpaid: 'bg-red-100 text-red-700',
      partial: 'bg-amber-100 text-amber-700',
    };
    return colors[status?.toLowerCase()] || 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm sm:text-base">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 sm:w-8 sm:h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Error Loading Portal</h2>
          <p className="text-gray-600 text-sm sm:text-base mb-6">{error}</p>
          <Link
            href="/patient/login"
            className="inline-flex items-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
          >
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  if (!patient) {
    return null;
  }

  const tabs: { id: TabType; label: string; description: string; count?: number; color: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: 'My Profile',
      description: 'View your information',
      color: 'from-blue-500 to-blue-600',
      icon: (
        <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      id: 'appointments',
      label: 'Appointments',
      description: 'Scheduled visits',
      count: appointments.length,
      color: 'from-indigo-500 to-indigo-600',
      icon: (
        <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'visits',
      label: 'Visit History',
      description: 'Past consultations',
      count: visits.length,
      color: 'from-emerald-500 to-emerald-600',
      icon: (
        <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
    {
      id: 'prescriptions',
      label: 'Prescriptions',
      description: 'Your medications',
      count: prescriptions.length,
      color: 'from-violet-500 to-violet-600',
      icon: (
        <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'lab-results',
      label: 'Lab Results',
      description: 'Test results',
      count: labResults.length,
      color: 'from-amber-500 to-amber-600',
      icon: (
        <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
    },
    {
      id: 'invoices',
      label: 'Billing',
      description: 'Your invoices',
      count: invoices.length,
      color: 'from-rose-500 to-rose-600',
      icon: (
        <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: 'documents',
      label: 'Documents',
      description: 'Medical records',
      count: documents.length,
      color: 'from-cyan-500 to-cyan-600',
      icon: (
        <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  // Content rendering based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            {/* Contact Information */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Contact Information
              </h3>
              <div className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4 space-y-2.5 sm:space-y-3">
                <div>
                  <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Email</p>
                  <p className="text-gray-900 text-sm sm:text-base break-all">{patient.email}</p>
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Phone</p>
                  <p className="text-gray-900 text-sm sm:text-base">{patient.phone}</p>
                </div>
                {patient.address && (
                  <div>
                    <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Address</p>
                    <p className="text-gray-900 text-sm sm:text-base">
                      {patient.address.street}, {patient.address.city}, {patient.address.state} {patient.address.zipCode}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Emergency Contact
              </h3>
              <div className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4 space-y-2.5 sm:space-y-3">
                {patient.emergencyContact ? (
                  <>
                    <div>
                      <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Name</p>
                      <p className="text-gray-900 text-sm sm:text-base">{patient.emergencyContact.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Phone</p>
                      <p className="text-gray-900 text-sm sm:text-base">{patient.emergencyContact.phone}</p>
                    </div>
                    {patient.emergencyContact.relationship && (
                      <div>
                        <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Relationship</p>
                        <p className="text-gray-900 text-sm sm:text-base capitalize">{patient.emergencyContact.relationship}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-500 text-xs sm:text-sm">No emergency contact on file</p>
                )}
              </div>
            </div>

            {/* Allergies */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Allergies
              </h3>
              <div className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4">
                {patient.allergies && patient.allergies.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {patient.allergies.map((allergy, idx) => (
                      <span key={idx} className="px-2 sm:px-3 py-0.5 sm:py-1 bg-red-100 text-red-700 rounded-full text-xs sm:text-sm">
                        {typeof allergy === 'string' ? allergy : allergy.substance}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-xs sm:text-sm">No known allergies</p>
                )}
              </div>
            </div>

            {/* Pre-existing Conditions */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Medical Conditions
              </h3>
              <div className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4">
                {patient.preExistingConditions && patient.preExistingConditions.length > 0 ? (
                  <ul className="space-y-1.5 sm:space-y-2">
                    {patient.preExistingConditions.map((condition, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm sm:text-base">
                        <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0 ${
                          condition.status === 'active' ? 'bg-red-500' :
                          condition.status === 'chronic' ? 'bg-amber-500' : 'bg-green-500'
                        }`}></span>
                        <span className="text-gray-900">{condition.condition}</span>
                        <span className="text-[10px] sm:text-xs text-gray-500 capitalize">({condition.status})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 text-xs sm:text-sm">No medical conditions on file</p>
                )}
              </div>
            </div>

            {/* Referrals */}
            {referrals.length > 0 && (
              <div className="space-y-3 sm:space-y-4 sm:col-span-2">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Referrals
                </h3>
                <div className="grid gap-3">
                  {referrals.slice(0, 3).map((ref) => (
                    <div key={ref._id} className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 text-sm sm:text-base">
                            {ref.specialty || 'Specialist Referral'}
                          </p>
                          {ref.referredToDoctor && (
                            <p className="text-xs sm:text-sm text-gray-600 mt-1">
                              To: Dr. {ref.referredToDoctor.firstName} {ref.referredToDoctor.lastName}
                            </p>
                          )}
                          {ref.referringDoctor && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              From: Dr. {ref.referringDoctor.firstName} {ref.referringDoctor.lastName}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">{formatDate(ref.referralDate)}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(ref.status)}`}>
                          {ref.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'appointments':
        return appointments.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <svg className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500 text-sm sm:text-base">No appointments found</p>
            <button
              onClick={openBookingModal}
              className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Book an Appointment
            </button>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {appointments.map((apt) => (
              <div key={apt._id} className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-900 text-sm sm:text-base">
                        Dr. {apt.doctor?.firstName} {apt.doctor?.lastName}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(apt.status)}`}>
                        {apt.status}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">{apt.reason || 'General Consultation'}</p>
                    <p className="text-xs sm:text-sm text-gray-600 mt-1">
                      📅 {formatDateTime(apt.appointmentDate)}
                      {apt.appointmentTime && ` at ${formatTimeSlot(apt.appointmentTime)}`}
                    </p>
                    {apt.appointmentCode && (
                      <p className="text-xs text-gray-400 mt-1">Code: {apt.appointmentCode}</p>
                    )}
                  </div>
                  {canCancelAppointment(apt) && (
                    <button
                      onClick={() => cancelAppointment(apt._id)}
                      disabled={cancellingAppointment === apt._id}
                      className="self-start px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {cancellingAppointment === apt._id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        );

      case 'visits':
        return visits.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <svg className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 text-sm sm:text-base">No visits found</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {visits.map((visit) => (
              <div key={visit._id} className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                  <p className="font-medium text-gray-900 text-sm sm:text-base">
                    Dr. {visit.doctor?.firstName} {visit.doctor?.lastName}
                  </p>
                  <span className={`self-start px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap ${getStatusColor(visit.status)}`}>
                    {visit.status}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600">{formatDateTime(visit.visitDate)}</p>
                {visit.chiefComplaint && (
                  <p className="text-xs sm:text-sm text-gray-500 mt-2">
                    <span className="font-medium">Chief Complaint:</span> {visit.chiefComplaint}
                  </p>
                )}
                {visit.diagnosis && (
                  <p className="text-xs sm:text-sm text-gray-500 mt-1">
                    <span className="font-medium">Diagnosis:</span> {visit.diagnosis}
                  </p>
                )}
              </div>
            ))}
          </div>
        );

      case 'prescriptions':
        return prescriptions.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <svg className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 text-sm sm:text-base">No prescriptions found</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {prescriptions.map((rx) => (
              <div key={rx._id} className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <p className="font-medium text-gray-900 text-sm sm:text-base">
                    Prescription #{rx.prescriptionCode || rx._id.slice(-6)}
                  </p>
                  <span className={`self-start sm:self-center px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap ${getStatusColor(rx.status)}`}>
                    {rx.status}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600">{formatDate(rx.prescriptionDate)}</p>
                {rx.medications && rx.medications.length > 0 && (
                  <div className="mt-2 sm:mt-3 space-y-1.5 sm:space-y-2">
                    {rx.medications.map((med: any, idx: number) => (
                      <div key={idx} className="text-xs sm:text-sm bg-white rounded-lg p-2 sm:p-2.5">
                        <p className="font-medium text-gray-900">{med.name}</p>
                        <p className="text-gray-500">{med.dosage} - {med.frequency}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        );

      case 'lab-results':
        return labResults.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <svg className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <p className="text-gray-500 text-sm sm:text-base">No lab results found</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {labResults.map((lab) => (
              <div key={lab._id} className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <p className="font-medium text-gray-900 text-sm sm:text-base">{lab.testName || 'Lab Test'}</p>
                  <span className={`self-start sm:self-center px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap ${getStatusColor(lab.status)}`}>
                    {lab.status}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600">{formatDate(lab.testDate)}</p>
                {lab.result && (
                  <p className="text-xs sm:text-sm text-gray-700 mt-2">
                    <span className="font-medium">Result:</span> {lab.result}
                  </p>
                )}
              </div>
            ))}
          </div>
        );

      case 'invoices':
        return invoices.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <svg className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-gray-500 text-sm sm:text-base">No invoices found</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {invoices.map((inv) => (
              <div key={inv._id} className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="flex items-start sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm sm:text-base">
                      Invoice #{inv.invoiceNumber || inv._id.slice(-6)}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600">{formatDate(inv.invoiceDate)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-gray-900 text-sm sm:text-base">
                      ₱{(inv.totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                    <span className={`inline-block mt-1 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium ${getStatusColor(inv.paymentStatus || inv.status)}`}>
                      {inv.paymentStatus || inv.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );

      case 'documents':
        return documents.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <svg className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 text-sm sm:text-base">No documents found</p>
            <p className="text-xs text-gray-400 mt-2">Your medical documents will appear here</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {documents.map((doc) => (
              <div key={doc._id} className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-xl flex-shrink-0">
                    {getDocumentIcon(doc.category)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-sm sm:text-base truncate">
                      {doc.title}
                    </p>
                    {doc.description && (
                      <p className="text-xs sm:text-sm text-gray-500 truncate mt-0.5">{doc.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded text-xs capitalize">
                        {doc.category?.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatFileSize(doc.size || 0)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDate(doc.uploadDate)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3 sm:py-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {activeTab && (
                <button
                  onClick={() => setActiveTab(null)}
                  className="p-1.5 -ml-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex-shrink-0 flex items-center justify-center">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">Patient Portal</h1>
                <p className="text-xs sm:text-sm text-gray-500 truncate">Welcome, {patient.firstName}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-3">
              <button
                onClick={() => setShowQRCode(true)}
                className="p-2 sm:p-2.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Show QR Code"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </button>
              <button
                onClick={handleLogout}
                className="hidden sm:flex px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Logout
              </button>
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="sm:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        {/* Mobile dropdown menu */}
        {showMobileMenu && (
          <div className="sm:hidden border-t border-gray-100 bg-white">
            <button
              onClick={() => {
                handleLogout();
                setShowMobileMenu(false);
              }}
              className="w-full px-4 py-3 text-left text-sm font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Patient Card */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl sm:rounded-2xl flex-shrink-0 flex items-center justify-center text-white text-lg sm:text-xl font-bold">
              {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                {patient.firstName} {patient.lastName}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs sm:text-sm font-medium">
                  {patient.patientCode}
                </span>
                <span className="text-xs sm:text-sm text-gray-500">{calculateAge(patient.dateOfBirth)} years old</span>
                <span className="text-xs sm:text-sm text-gray-500 capitalize">• {patient.sex || '?'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile: Block Grid / Desktop: Tab Bar with Content */}
        <div className="md:hidden">
          {activeTab === null ? (
            /* Mobile Block Grid */
            <div className="space-y-4">
              {/* Book Appointment CTA */}
              <button
                onClick={openBookingModal}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl shadow-lg p-4 text-left hover:shadow-xl transition-all active:scale-[0.98] flex items-center gap-4"
              >
                <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center text-white">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-white text-base">Book Appointment</h3>
                  <p className="text-white/80 text-sm">Schedule your next visit</p>
                </div>
                <svg className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Section Blocks */}
              <div className="grid grid-cols-2 gap-3">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-left hover:shadow-md hover:border-gray-300 transition-all active:scale-[0.98]"
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tab.color} flex items-center justify-center text-white mb-3`}>
                      {tab.icon}
                    </div>
                    <h3 className="font-semibold text-gray-900 text-sm">{tab.label}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{tab.description}</p>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                        {tab.count} {tab.count === 1 ? 'record' : 'records'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Mobile Content View */
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4">
                <h2 className="font-semibold text-gray-900 mb-4">
                  {tabs.find(t => t.id === activeTab)?.label}
                </h2>
                {renderContent()}
              </div>
            </div>
          )}
        </div>

        {/* Desktop: Block Layout */}
        <div className="hidden md:block">
          {activeTab === null ? (
            /* Desktop Block Grid */
            <div className="space-y-6">
              {/* Book Appointment CTA */}
              <button
                onClick={openBookingModal}
                className="w-full bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 rounded-2xl shadow-lg p-6 text-left hover:shadow-xl hover:-translate-y-1 transition-all flex items-center gap-6"
              >
                <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-white">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-white text-xl">Book an Appointment</h3>
                  <p className="text-white/80 text-sm mt-1">Schedule your next visit with one of our doctors</p>
                </div>
                <div className="hidden lg:flex items-center gap-2 text-white/80">
                  <span className="text-sm font-medium">Get Started</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
              </button>

              {/* Section Blocks */}
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
                {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="group bg-white rounded-2xl shadow-sm border border-gray-200 p-5 lg:p-6 text-center hover:shadow-lg hover:border-blue-200 hover:-translate-y-1 transition-all duration-200"
                >
                  <div className={`w-14 h-14 lg:w-16 lg:h-16 mx-auto rounded-2xl bg-gradient-to-br ${tab.color} flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform shadow-lg`}>
                    {tab.icon}
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm lg:text-base group-hover:text-blue-600 transition-colors">{tab.label}</h3>
                  <p className="text-xs text-gray-500 mt-1 hidden lg:block">{tab.description}</p>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="inline-block mt-3 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                      {tab.count} {tab.count === 1 ? 'record' : 'records'}
                    </span>
                  )}
                </button>
              ))}
              </div>
            </div>
          ) : (
            /* Desktop Content View */
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Section Header */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tabs.find(t => t.id === activeTab)?.color} flex items-center justify-center text-white shadow-md`}>
                  {tabs.find(t => t.id === activeTab)?.icon}
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {tabs.find(t => t.id === activeTab)?.label}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {tabs.find(t => t.id === activeTab)?.description}
                  </p>
                </div>
              </div>
              <div className="p-6">
                {renderContent()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* QR Code Modal */}
      {showQRCode && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowQRCode(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 sm:p-6 mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Your QR Code</h3>
              <button
                onClick={() => setShowQRCode(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg -mr-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 flex items-center justify-center">
              <QRCode value={getQRCodeData()} size={180} className="w-full max-w-[180px] sm:max-w-[200px] h-auto" />
            </div>
            <p className="text-center text-xs sm:text-sm text-gray-500 mt-4">
              Scan this code at the clinic for quick check-in
            </p>
            <p className="text-center text-xs text-gray-400 mt-2">
              Patient Code: <span className="font-medium">{patient.patientCode}</span>
            </p>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {showBookingModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !bookingLoading && setShowBookingModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Book Appointment</h3>
                  <p className="text-xs text-gray-500">Schedule your next visit</p>
                </div>
              </div>
              <button
                onClick={() => !bookingLoading && setShowBookingModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg -mr-2"
                disabled={bookingLoading}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5">
              {/* Success Message */}
              {bookingSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-800">Appointment Requested!</p>
                    <p className="text-sm text-green-700 mt-1">{bookingSuccess}</p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {bookingError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm text-red-700">{bookingError}</p>
                </div>
              )}

              {!bookingSuccess && (
                <>
                  {/* Select Doctor */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Doctor <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedDoctor}
                      onChange={(e) => handleDoctorChange(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white"
                      disabled={bookingLoading}
                    >
                      <option value="">Choose a doctor...</option>
                      {doctors.map((doctor) => (
                        <option key={doctor._id} value={doctor._id}>
                          Dr. {doctor.firstName} {doctor.lastName}
                          {doctor.specialization && ` - ${doctor.specialization}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Select Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      min={getMinDate()}
                      max={getMaxDate()}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                      disabled={bookingLoading}
                    />
                  </div>

                  {/* Select Time */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Time <span className="text-red-500">*</span>
                    </label>
                    {loadingSlots ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                        <span className="ml-2 text-sm text-gray-500">Loading available slots...</span>
                      </div>
                    ) : !selectedDoctor || !selectedDate ? (
                      <p className="text-sm text-gray-500 py-4 text-center bg-gray-50 rounded-xl">
                        Select a doctor and date to see available times
                      </p>
                    ) : availableSlots.length === 0 ? (
                      <p className="text-sm text-amber-600 py-4 text-center bg-amber-50 rounded-xl">
                        No available slots for this date. Please try another date.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {availableSlots.map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setSelectedTime(slot)}
                            className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                              selectedTime === slot
                                ? 'bg-green-600 text-white shadow-md'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                            disabled={bookingLoading}
                          >
                            {formatTimeSlot(slot)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reason for Visit <span className="text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      value={bookingReason}
                      onChange={(e) => setBookingReason(e.target.value)}
                      placeholder="e.g., General checkup, Follow-up, Consultation..."
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none resize-none"
                      disabled={bookingLoading}
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={submitBooking}
                    disabled={bookingLoading || !selectedDoctor || !selectedDate || !selectedTime}
                    className="w-full py-3.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {bookingLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Booking...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Confirm Booking</span>
                      </>
                    )}
                  </button>

                  <p className="text-xs text-gray-500 text-center">
                    Your appointment will be pending until confirmed by the clinic
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
