'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PrescriptionForm from './PrescriptionForm';

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'dispensed':
        return 'bg-green-100 text-green-800';
      case 'partially-dispensed':
        return 'bg-yellow-100 text-yellow-800';
      case 'active':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-3 text-sm text-gray-600">Loading prescriptions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-3">
        {/* Notifications */}
        {error && (
          <div className="mb-2 bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-lg flex items-center justify-between">
            <span className="text-xs">{error}</span>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {success && (
          <div className="mb-2 bg-green-50 border border-green-200 text-green-800 px-3 py-2 rounded-lg flex items-center justify-between">
            <span className="text-xs">{success}</span>
            <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-800">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">E-Prescriptions</h1>
            <p className="text-gray-600 text-sm">Manage prescriptions and track dispensing</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors mt-2 sm:mt-0"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Prescription
          </button>
        </div>

        {/* Search and Filters */}
        <div className="mb-3 space-y-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by patient name, prescription code, or medication..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full px-3 py-1.5 pl-9 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            <svg className="absolute left-2.5 top-1.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1.5 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="block px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="partially-dispensed">Partially Dispensed</option>
              <option value="dispensed">Dispensed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {(searchQuery || filterStatus !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterStatus('all');
                }}
                className="text-xs text-gray-600 hover:text-gray-900 font-medium inline-flex items-center gap-1 px-2.5 py-1.5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowForm(false)} />
              <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-4xl w-full z-10 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-base font-semibold text-gray-900">New Prescription</h2>
                  <button
                    onClick={() => setShowForm(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <PrescriptionForm
                  patients={patients}
                  onSubmit={handleSubmit}
                  onCancel={() => setShowForm(false)}
                  providerName={providerName}
                />
              </div>
            </div>
          </div>
        )}

        {/* Prescriptions List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-900">Prescriptions</h2>
            <span className="text-xs text-gray-500">
              {filteredPrescriptions.length} {filteredPrescriptions.length === 1 ? 'prescription' : 'prescriptions'}
            </span>
          </div>
          {filteredPrescriptions.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-medium text-gray-900 mb-0.5">
                {searchQuery || filterStatus !== 'all' ? 'No prescriptions match your filters' : 'No prescriptions found'}
              </p>
              <p className="text-xs text-gray-500 mb-3">
                {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first prescription to get started'}
              </p>
              {!searchQuery && filterStatus === 'all' && (
                <button
                  onClick={() => setShowForm(true)}
                  className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Prescription
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Prescription Code</th>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Patient</th>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Medications</th>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Dispensed</th>
                    <th className="px-3 py-1.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
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
                      <tr key={prescription._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                          {prescription.prescriptionCode}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Link 
                            href={`/patients/${prescription.patient._id}`}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {prescription.patient.firstName} {prescription.patient.lastName}
                          </Link>
                          {prescription.patient.patientCode && (
                            <div className="text-xs text-gray-500">{prescription.patient.patientCode}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600">
                          <div className="space-y-0.5">
                            {prescription.medications.slice(0, 2).map((med, idx) => (
                              <div key={idx} className="text-xs">
                                {med.name} {med.dose && `(${med.dose})`}
                              </div>
                            ))}
                            {prescription.medications.length > 2 && (
                              <div className="text-xs text-gray-400">+{prescription.medications.length - 2} more</div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                          {new Date(prescription.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 inline-flex text-xs font-semibold rounded-full ${getStatusColor(prescription.status)}`}>
                            {prescription.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                          {totalDispensed > 0 ? (
                            <div>
                              <div className="text-xs">{totalDispensed} / {totalPrescribed}</div>
                              {prescription.pharmacyDispenses && prescription.pharmacyDispenses.length > 0 && (
                                <div className="text-xs text-gray-400">
                                  {prescription.pharmacyDispenses[0].pharmacyName}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-xs font-medium">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handlePrint(prescription._id)}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                              title="Print"
                            >
                              Print
                            </button>
                            <Link
                              href={`/prescriptions/${prescription._id}`}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              View →
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
  );
}

