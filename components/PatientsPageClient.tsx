'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import PatientForm from '@/components/PatientForm';
import { useRouter } from 'next/navigation';
import { Modal, AlertDialog } from './ui/Modal';

interface Patient {
  _id: string;
  patientCode?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex?: string;
  address?: {
    city?: string;
    state?: string;
  };
}

type SortOption = 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc' | 'code-asc' | 'code-desc';

export default function PatientsPageClient() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<string | null>(null);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [filters, setFilters] = useState({
    sex: 'all',
    active: 'all',
    minAge: '',
    maxAge: '',
    city: '',
    state: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch patients when filters or search change
  useEffect(() => {
    fetchPatients();
  }, [debouncedSearchQuery, sortBy, filters]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      
      // Build query parameters
      const params = new URLSearchParams();
      if (debouncedSearchQuery.trim()) {
        params.append('search', debouncedSearchQuery.trim());
      }
      if (filters.sex !== 'all') {
        params.append('sex', filters.sex);
      }
      if (filters.active !== 'all') {
        params.append('active', filters.active);
      }
      if (filters.minAge) {
        params.append('minAge', filters.minAge);
      }
      if (filters.maxAge) {
        params.append('maxAge', filters.maxAge);
      }
      if (filters.city) {
        params.append('city', filters.city);
      }
      if (filters.state) {
        params.append('state', filters.state);
      }
      
      // Map sortBy to API format
      const sortMap: Record<SortOption, { sortBy: string; sortOrder: string }> = {
        'name-asc': { sortBy: 'name', sortOrder: 'asc' },
        'name-desc': { sortBy: 'name', sortOrder: 'desc' },
        'date-asc': { sortBy: 'dateOfBirth', sortOrder: 'asc' },
        'date-desc': { sortBy: 'dateOfBirth', sortOrder: 'desc' },
        'code-asc': { sortBy: 'patientCode', sortOrder: 'asc' },
        'code-desc': { sortBy: 'patientCode', sortOrder: 'desc' },
      };
      const sort = sortMap[sortBy];
      params.append('sortBy', sort.sortBy);
      params.append('sortOrder', sort.sortOrder);
      
      const res = await fetch(`/api/patients?${params.toString()}`);
      
      // Check for authentication errors
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      
      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        data = { success: false, error: `API error: ${res.status} ${res.statusText}` };
      }
      if (data.success) {
        setPatients(data.data);
      } else {
        console.error('Failed to fetch patients:', data.error);
        setError(data.error || 'Failed to fetch patients');
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
      setError('Failed to fetch patients');
    } finally {
      setLoading(false);
    }
  };

  // Patients are already filtered and sorted on the server
  const filteredPatients = patients;
  
  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.sex !== 'all') count++;
    if (filters.active !== 'all') count++;
    if (filters.minAge) count++;
    if (filters.maxAge) count++;
    if (filters.city) count++;
    if (filters.state) count++;
    return count;
  }, [filters]);
  
  const clearFilters = () => {
    setFilters({
      sex: 'all',
      active: 'all',
      minAge: '',
      maxAge: '',
      city: '',
      state: '',
    });
  };

  const handleSubmit = async (formData: any) => {
    try {
      const url = editingPatient
        ? `/api/patients/${editingPatient._id}`
        : '/api/patients';
      const method = editingPatient ? 'PUT' : 'POST';

      // Handle allergies - already in structured format from form
      const allergiesArray = Array.isArray(formData.allergies)
        ? formData.allergies
        : formData.allergies
            ?.split(',')
            .map((a: string) => a.trim())
            .filter((a: string) => a.length > 0)
            .map((substance: string) => ({ substance, reaction: '', severity: 'unknown' })) || [];

      // Clean up identifiers - only include if they have values
      const identifiers = formData.identifiers
        ? {
            ...(formData.identifiers.philHealth?.trim() && { philHealth: formData.identifiers.philHealth.trim() }),
            ...(formData.identifiers.govId?.trim() && { govId: formData.identifiers.govId.trim() }),
          }
        : undefined;

      // Only include identifiers if it has at least one property
      const cleanedIdentifiers = identifiers && Object.keys(identifiers).length > 0 ? identifiers : undefined;

      // Prepare the payload
      const payload: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        dateOfBirth: new Date(formData.dateOfBirth),
        address: {
          street: formData.address.street,
          city: formData.address.city,
          state: formData.address.state,
          zipCode: formData.address.zipCode,
        },
        emergencyContact: {
          name: formData.emergencyContact.name,
          phone: formData.emergencyContact.phone,
          relationship: formData.emergencyContact.relationship,
        },
        allergies: allergiesArray,
      };

      // Add optional fields only if they have values
      if (formData.middleName?.trim()) payload.middleName = formData.middleName.trim();
      if (formData.suffix?.trim()) payload.suffix = formData.suffix.trim();
      if (formData.sex && formData.sex !== 'unknown') payload.sex = formData.sex;
      if (formData.civilStatus?.trim()) payload.civilStatus = formData.civilStatus.trim();
      if (formData.nationality?.trim()) payload.nationality = formData.nationality.trim();
      if (formData.occupation?.trim()) payload.occupation = formData.occupation.trim();
      if (formData.medicalHistory?.trim()) payload.medicalHistory = formData.medicalHistory.trim();
      if (cleanedIdentifiers) payload.identifiers = cleanedIdentifiers;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Check for authentication errors
      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        console.error('Response status:', res.status);
        console.error('Response headers:', Object.fromEntries(res.headers.entries()));
        setError(`Failed to save patient: API error (Status: ${res.status})`);
        setTimeout(() => setError(null), 5000);
        return;
      }
      
      if (data.success) {
        setShowForm(false);
        setEditingPatient(null);
        setSuccess(editingPatient ? 'Patient updated successfully!' : 'Patient created successfully!');
        setTimeout(() => setSuccess(null), 3000);
        fetchPatients();
      } else {
        console.error('API error response:', data);
        setError('Error: ' + (data.error || 'Unknown error occurred'));
        setTimeout(() => setError(null), 5000);
      }
    } catch (error: any) {
      console.error('Failed to save patient:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      setError(`Failed to save patient: ${error.message || 'Unknown error'}`);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleDeleteClick = (id: string) => {
    setPatientToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!patientToDelete) return;

    try {
      const res = await fetch(`/api/patients/${patientToDelete}`, { method: 'DELETE' });
      
      // Check for authentication errors
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      
      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        setError('Failed to delete patient: API error');
        setTimeout(() => setError(null), 5000);
        return;
      }
      if (data.success) {
        fetchPatients();
        setDeleteDialogOpen(false);
        setPatientToDelete(null);
        setSuccess('Patient deleted successfully!');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Error: ' + data.error);
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error('Failed to delete patient:', error);
      setError('Failed to delete patient');
      setTimeout(() => setError(null), 5000);
    }
  };

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-3" style={{ minHeight: '50vh', justifyContent: 'center' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-700">Loading patients...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <p className="text-green-800 text-sm">{success}</p>
            </div>
          )}

          {/* Header */}
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-center sm:items-center gap-3 mb-3">
              <div>
                <h1 className="text-3xl font-bold mb-1">Patients</h1>
                <p className="text-sm text-gray-500">Manage patient records and information</p>
              </div>
          <button
            onClick={() => {
              setEditingPatient(null);
              setShowForm(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Add New Patient
          </button>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-2 mb-3 flex-wrap">
          <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[150px]">
            <div className="p-2">
              <div className="text-xs text-gray-500 mb-1">Total Patients</div>
              <div className="text-2xl font-bold">{patients.length}</div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[150px]">
            <div className="p-2">
              <div className="text-xs text-gray-500 mb-1">Showing</div>
              <div className="text-2xl font-bold">{filteredPatients.length}</div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[150px]">
            <div className="p-2">
              <div className="text-xs text-gray-500 mb-1">This Month</div>
              <div className="text-2xl font-bold">
                {patients.filter((p) => {
                  const created = new Date((p as any).createdAt || 0);
                  const now = new Date();
                  return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
                }).length}
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[150px]">
            <div className="p-2">
              <div className="text-xs text-gray-500 mb-1">Active</div>
              <div className="text-2xl font-bold">
                {patients.filter((p) => (p as any).active !== false).length}
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="p-3">
            <div className={`flex flex-col sm:flex-row gap-3 ${debouncedSearchQuery || activeFilterCount > 0 ? "mb-2" : "mb-0"}`}>
              {/* Search Input */}
              <div className="flex-1" style={{ minWidth: 0 }}>
                <div className="relative w-full">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search by name, email, phone, code, or location..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  {searchQuery && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="cursor-pointer p-1 text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Sort Dropdown */}
              <div style={{ minWidth: '180px' }}>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                  <option value="date-desc">Date of Birth (Newest)</option>
                  <option value="date-asc">Date of Birth (Oldest)</option>
                  <option value="code-asc">Patient Code (A-Z)</option>
                  <option value="code-desc">Patient Code (Z-A)</option>
                </select>
              </div>

              {/* Filter Toggle Button */}
              <button
                className={`px-4 py-2 rounded-md transition-colors flex items-center ${
                  showFilters || activeFilterCount > 0 
                    ? "bg-blue-600 text-white hover:bg-blue-700" 
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <svg className="w-4 h-4 mr-1" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Filter Panel */}
            {showFilters && (
              <div className="pt-3 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
                  {/* Sex Filter */}
                  <div style={{ minWidth: '140px', flex: '1 1 140px' }}>
                    <div className="text-xs font-medium mb-1">Sex</div>
                    <select
                      value={filters.sex}
                      onChange={(e) => setFilters({ ...filters, sex: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                      <option value="all">All</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Active Status Filter */}
                  <div style={{ minWidth: '140px', flex: '1 1 140px' }}>
                    <div className="text-xs font-medium mb-1">Status</div>
                    <select
                      value={filters.active}
                      onChange={(e) => setFilters({ ...filters, active: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                      <option value="all">All</option>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>

                  {/* Age Range Filters */}
                  <div style={{ minWidth: '100px', flex: '1 1 100px' }}>
                    <div className="text-xs font-medium mb-1">Min Age</div>
                    <input
                      type="number"
                      placeholder="Min"
                      value={filters.minAge}
                      onChange={(e) => setFilters({ ...filters, minAge: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div style={{ minWidth: '100px', flex: '1 1 100px' }}>
                    <div className="text-xs font-medium mb-1">Max Age</div>
                    <input
                      type="number"
                      placeholder="Max"
                      value={filters.maxAge}
                      onChange={(e) => setFilters({ ...filters, maxAge: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* City Filter */}
                  <div style={{ minWidth: '140px', flex: '1 1 140px' }}>
                    <div className="text-xs font-medium mb-1">City</div>
                    <input
                      type="text"
                      placeholder="City"
                      value={filters.city}
                      onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* State Filter */}
                  <div style={{ minWidth: '140px', flex: '1 1 140px' }}>
                    <div className="text-xs font-medium mb-1">State</div>
                    <input
                      type="text"
                      placeholder="State"
                      value={filters.state}
                      onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Clear Filters Button */}
                  {activeFilterCount > 0 && (
                    <div className="flex items-end">
                      <button
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                        onClick={clearFilters}
                      >
                        Clear Filters
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Results Count */}
            {(debouncedSearchQuery || activeFilterCount > 0) && (
              <div className="pt-2 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Found {filteredPatients.length} {filteredPatients.length === 1 ? 'patient' : 'patients'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Form Modal/Overlay */}
      <Modal open={showForm} onOpenChange={(open) => {
        if (!open) {
          setShowForm(false);
          setEditingPatient(null);
        }
      }} className="max-w-3xl">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingPatient ? 'Edit Patient' : 'New Patient'}
          </h2>
          <div className="py-4">
            <PatientForm
              initialData={editingPatient ? {
                ...editingPatient,
                sex: editingPatient.sex as 'male' | 'female' | 'other' | 'unknown' | undefined,
                address: editingPatient.address ? {
                  street: (editingPatient.address as any).street || '',
                  city: editingPatient.address.city || '',
                  state: editingPatient.address.state || '',
                  zipCode: (editingPatient.address as any).zipCode || '',
                } : {
                  street: '',
                  city: '',
                  state: '',
                  zipCode: '',
                },
                emergencyContact: (editingPatient as any).emergencyContact || {
                  name: '',
                  phone: '',
                  relationship: '',
                },
              } : undefined}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setEditingPatient(null);
              }}
            />
          </div>
        </div>
      </Modal>

      {/* Patients List */}
      {filteredPatients.length === 0 && patients.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="p-8 text-center">
            <div className="mb-3">
              <svg className="w-12 h-12 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-1">No patients found</h2>
            <p className="text-sm text-gray-500 mb-3">Try adjusting your search or filter criteria.</p>
            <button onClick={() => setSearchQuery('')} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors">
              Clear Search
            </button>
          </div>
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="p-4 text-center">
            <div className="mb-2">
              <svg className="w-12 h-12 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-1">No patients found</h2>
            <p className="text-sm text-gray-500 mb-3">Get started by adding your first patient.</p>
            <button
              onClick={() => {
                setEditingPatient(null);
                setShowForm(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Add First Patient
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex flex-col gap-2">
            {filteredPatients.map((patient) => {
              const age = Math.floor((new Date().getTime() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
              return (
                <div key={patient._id} className="bg-white border border-gray-200 rounded-lg cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/patients/${patient._id}`)}>
                  <div className="p-3">
                    <div className="flex items-center gap-3 justify-between flex-wrap sm:flex-nowrap">
                      {/* Patient Info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white text-base font-bold flex-shrink-0"
                        >
                          {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-base font-bold overflow-hidden text-ellipsis whitespace-nowrap">
                              {patient.firstName} {patient.lastName}
                            </span>
                            {patient.patientCode && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">
                                {patient.patientCode}
                              </span>
                            )}
                            {patient.sex && patient.sex !== 'unknown' && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full capitalize">
                                {patient.sex}
                              </span>
                            )}
                            {age > 0 && (
                              <span className="text-sm text-gray-500">
                                {age} years
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-gray-500 flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                {patient.email}
                              </span>
                              <span className="text-sm text-gray-500 flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                {patient.phone}
                              </span>
                              <span className="text-sm text-gray-500 flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {new Date(patient.dateOfBirth).toLocaleDateString()}
                              </span>
                              {patient.address && (patient.address.city || patient.address.state) && (
                                <span className="text-sm text-gray-500 flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                  {[patient.address.city, patient.address.state].filter(Boolean).join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Link href={`/patients/${patient._id}`} className="p-2 bg-green-50 text-green-700 rounded-md hover:bg-green-100 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Link>
                        <Link href={`/appointments/new?patientId=${patient._id}`} className="p-2 bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </Link>
                        <button
                          onClick={() => {
                            setEditingPatient(patient);
                            setShowForm(true);
                          }}
                          className="p-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteClick(patient._id)}
                          className="p-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Patient"
        description="Are you sure you want to delete this patient? This action cannot be undone."
      >
        <button
          onClick={() => setDeleteDialogOpen(false)}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        >
          Delete
        </button>
      </AlertDialog>
        </div>
      </div>
    </section>
  );
}
