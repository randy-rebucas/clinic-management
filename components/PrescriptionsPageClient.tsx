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
  };
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
      const patientName = `${prescription.patient.firstName} ${prescription.patient.lastName}`.toLowerCase();
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
      <section className="py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: '256px' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p>Loading prescriptions...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6">
      <div className="container mx-auto px-4">
        <div className="flex flex-col gap-4">
          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
              <p>{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md">
              <p>{success}</p>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold mb-1">E-Prescriptions</h1>
              <p className="text-sm text-gray-600">Manage prescriptions and track dispensing</p>
            </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Prescription
        </button>
      </div>

          {/* Search and Filters */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search by patient name, prescription code, or medication..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div style={{ minWidth: '180px' }}>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
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
      }} className="max-w-4xl">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">New Prescription</h2>
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
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="p-3">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">Prescriptions</h3>
            <p className="text-sm text-gray-600">
              {filteredPrescriptions.length} {filteredPrescriptions.length === 1 ? 'prescription' : 'prescriptions'}
            </p>
          </div>
          {filteredPrescriptions.length === 0 ? (
            <div className="p-8 text-center">
              <div className="mb-3">
                <svg className="w-12 h-12 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-1">
                {searchQuery || filterStatus !== 'all' ? 'No prescriptions match your filters' : 'No prescriptions found'}
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first prescription to get started'}
              </p>
              {!searchQuery && filterStatus === 'all' && (
                <button onClick={() => setShowForm(true)} className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center mx-auto">
                  <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Prescription Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Patient</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Medications</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Dispensed</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
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

                    return (
                      <tr key={prescription._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium">{prescription.prescriptionCode}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/patients/${prescription.patient._id}`}>
                            <div className="text-sm font-medium text-blue-600 hover:underline">
                              {prescription.patient.firstName} {prescription.patient.lastName}
                            </div>
                          </Link>
                          {prescription.patient.patientCode && (
                            <div className="text-xs text-gray-600">{prescription.patient.patientCode}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {prescription.medications.slice(0, 2).map((med, idx) => (
                              <div key={idx} className="text-xs">
                                {med.name} {med.dose && `(${med.dose})`}
                              </div>
                            ))}
                            {prescription.medications.length > 2 && (
                              <div className="text-xs text-gray-600">+{prescription.medications.length - 2} more</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">
                            {new Date(prescription.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            getStatusColor(prescription.status) === 'green' ? 'bg-green-100 text-green-800' :
                            getStatusColor(prescription.status) === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                            getStatusColor(prescription.status) === 'blue' ? 'bg-blue-100 text-blue-800' :
                            getStatusColor(prescription.status) === 'red' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {prescription.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {totalDispensed > 0 ? (
                            <div className="flex flex-col gap-1">
                              <div className="text-xs">{totalDispensed} / {totalPrescribed}</div>
                              {prescription.pharmacyDispenses && prescription.pharmacyDispenses.length > 0 && (
                                <div className="text-xs text-gray-600">
                                  {prescription.pharmacyDispenses[0].pharmacyName}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-600">—</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handlePrint(prescription._id)}
                              className="px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                              title="Print"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                            </button>
                            <Link href={`/prescriptions/${prescription._id}`}>
                              <button className="px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors text-xs">
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
