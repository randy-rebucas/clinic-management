'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PrescriptionForm from './PrescriptionForm';
import { Modal } from './ui/Modal';

interface Prescription {
  _id: string;
  prescriptionCode: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
  } | null;
  prescribedBy?: {
    _id: string;
    name: string;
  };
  visit?: {
    _id: string;
    visitCode: string;
  };
  medications: Array<{
    name: string;
    dose?: string;
    frequency?: string;
    durationDays?: number;
    quantity?: number;
  }>;
  status: string;
  issuedAt: string;
  pharmacyDispenses?: Array<{
    pharmacyName?: string;
    dispensedAt?: string;
    quantityDispensed?: number;
  }>;
}

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  weight?: number;
}

export default function PrescriptionsPageClient() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [providerName, setProviderName] = useState('Dr. Provider');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchData();
    fetchUser();
  }, []);

  const fetchData = async () => {
    try {
      const [prescriptionsRes, patientsRes] = await Promise.all([
        fetch('/api/prescriptions'),
        fetch('/api/patients'),
      ]);

      if (prescriptionsRes.status === 401 || patientsRes.status === 401) {
        router.push('/login');
        return;
      }

      const parseResponse = async (res: Response) => {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await res.json();
        }
        return { success: false };
      };

      const prescriptionsData = await parseResponse(prescriptionsRes);
      const patientsData = await parseResponse(patientsRes);

      if (prescriptionsData.success) setPrescriptions(prescriptionsData.data);
      if (patientsData.success) setPatients(patientsData.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/user/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setProviderName(data.data.name || 'Dr. Provider');
        }
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  };

  const showNotification = (message: string, type: 'error' | 'success') => {
    if (type === 'error') {
      setError(message);
      setTimeout(() => setError(null), 5000);
    } else {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleSubmit = async (formData: any) => {
    try {
      const res = await fetch('/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        showNotification('Failed to create prescription: API error', 'error');
        return;
      }

      if (data.success) {
        setShowForm(false);
        fetchData();
        showNotification('Prescription created successfully!', 'success');
      } else {
        showNotification('Error: ' + data.error, 'error');
      }
    } catch (error) {
      console.error('Failed to create prescription:', error);
      showNotification('Failed to create prescription', 'error');
    }
  };

  const filteredPrescriptions = prescriptions.filter(prescription => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const patientName = prescription.patient 
        ? `${prescription.patient.firstName} ${prescription.patient.lastName}`.toLowerCase()
        : '';
      const prescriptionCode = prescription.prescriptionCode.toLowerCase();
      const medications = prescription.medications.map(m => m.name.toLowerCase()).join(' ');
      if (!patientName.includes(query) && !prescriptionCode.includes(query) && !medications.includes(query)) return false;
    }
    if (filterStatus !== 'all' && prescription.status !== filterStatus) return false;
    return true;
  });

  const handlePrint = async (prescriptionId: string) => {
    window.open(`/api/prescriptions/${prescriptionId}/print`, '_blank');
  };

  const getStatusColor = (status: string): 'green' | 'yellow' | 'blue' | 'gray' | 'red' => {
    switch (status) {
      case 'dispensed':
        return 'green';
      case 'partially-dispensed':
        return 'yellow';
      case 'active':
        return 'blue';
      case 'completed':
        return 'gray';
      case 'cancelled':
        return 'red';
      default:
        return 'gray';
    }
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-100 border-t-blue-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading prescriptions...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 mb-1">Error</h3>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-green-800 mb-1">Success</h3>
                  <p className="text-sm text-green-700">{success}</p>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">E-Prescriptions</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Manage prescriptions and track dispensing</p>
                </div>
              </div>
              <button
                onClick={() => setShowForm(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-lg hover:from-indigo-600 hover:to-indigo-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Prescription
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-5">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 transform -translate-y-1/2 p-1.5">
                      <svg className="w-5 h-5 text-gray-400" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search by patient name, prescription code, or medication..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <div className="min-w-[200px]">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="partially-dispensed">Partially Dispensed</option>
                    <option value="dispensed">Dispensed</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                {(searchQuery || filterStatus !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setFilterStatus('all');
                    }}
                    className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

      {/* Form Modal */}
      <Modal open={showForm} onOpenChange={(open) => {
        if (!open) {
          setShowForm(false);
        }
      }} className="max-w-6xl">
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-md">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">New Prescription</h2>
          </div>
          <div className="py-4">
            <PrescriptionForm
              patients={patients}
              onSubmit={handleSubmit}
              onCancel={() => setShowForm(false)}
              providerName={providerName}
            />
          </div>
        </div>
      </Modal>

      {/* Prescriptions List */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 bg-gray-50/50">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Prescriptions</h3>
            </div>
            <p className="text-sm font-semibold text-gray-600">
              {filteredPrescriptions.length} {filteredPrescriptions.length === 1 ? 'prescription' : 'prescriptions'}
            </p>
          </div>
        </div>
        <div className="p-5">
          {filteredPrescriptions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {searchQuery || filterStatus !== 'all' ? 'No prescriptions match your filters' : 'No prescriptions found'}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first prescription to get started'}
              </p>
              {!searchQuery && filterStatus === 'all' && (
                <button onClick={() => setShowForm(true)} className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-lg hover:from-indigo-600 hover:to-indigo-700 transition-all flex items-center gap-2 mx-auto text-sm font-semibold shadow-md">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Prescription
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Prescription Code</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Patient</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Medications</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Dispensed</th>
                    <th className="px-5 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPrescriptions.map((prescription) => {
                    const totalPrescribed = prescription.medications.reduce(
                      (sum, m) => sum + (m.quantity || 0),
                      0
                    );
                    const totalDispensed = prescription.pharmacyDispenses?.reduce(
                      (sum, d) => sum + (d.quantityDispensed || 0),
                      0
                    ) || 0;

                    const patient = prescription.patient;
                    return (
                      <tr key={prescription._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="text-sm font-bold text-gray-900">{prescription.prescriptionCode}</div>
                        </td>
                        <td className="px-5 py-4">
                          {prescription.patient ? (
                            <>
                              <Link href={`/patients/${prescription.patient._id}`}>
                                <div className="text-sm font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors">
                                  {prescription.patient.firstName} {prescription.patient.lastName}
                                </div>
                              </Link>
                              {prescription.patient.patientCode && (
                                <div className="text-xs text-gray-600 mt-1">{prescription.patient.patientCode}</div>
                              )}
                            </>
                          ) : (
                            <div className="text-sm text-gray-500">Patient not found</div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-1">
                            {prescription.medications.slice(0, 2).map((med, idx) => (
                              <div key={idx} className="text-xs font-medium text-gray-900">
                                {med.name} {med.dose && <span className="text-gray-600">({med.dose})</span>}
                              </div>
                            ))}
                            {prescription.medications.length > 2 && (
                              <div className="text-xs text-gray-500 font-medium">+{prescription.medications.length - 2} more</div>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-sm text-gray-900">
                            {new Date(prescription.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 text-xs rounded-full font-semibold border ${
                            getStatusColor(prescription.status) === 'green' ? 'bg-green-100 text-green-700 border-green-200' :
                            getStatusColor(prescription.status) === 'yellow' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                            getStatusColor(prescription.status) === 'blue' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                            getStatusColor(prescription.status) === 'red' ? 'bg-red-100 text-red-700 border-red-200' :
                            'bg-gray-100 text-gray-700 border-gray-200'
                          }`}>
                            {prescription.status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {totalDispensed > 0 ? (
                            <div className="flex flex-col gap-1">
                              <div className="text-xs font-bold text-gray-900">{totalDispensed} / {totalPrescribed}</div>
                              {prescription.pharmacyDispenses && prescription.pharmacyDispenses.length > 0 && (
                                <div className="text-xs text-gray-600">
                                  {prescription.pharmacyDispenses[0].pharmacyName}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500">—</div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handlePrint(prescription._id)}
                              className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-200"
                              title="Print"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                            </button>
                            <Link href={`/prescriptions/${prescription._id}`}>
                              <button className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-xs font-semibold border border-indigo-200">
                                View
                              </button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
        </div>
      </div>
    </section>
  );
}
