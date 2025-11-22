'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import PatientForm from '@/components/PatientForm';
import { useRouter } from 'next/navigation';
import { Button, TextField, Select, Dialog, Card, Flex, Box, Text, Spinner, Badge, AlertDialog, Tooltip, IconButton, Separator, Heading, Callout } from '@radix-ui/themes';

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
      <Box p="4" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Flex direction="column" align="center" gap="3">
          <Spinner size="3" />
          <Text>Loading patients...</Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box p="4">
      {/* Error/Success Messages */}
      {error && (
        <Callout.Root color="red" mb="3">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}
      {success && (
        <Callout.Root color="green" mb="3">
          <Callout.Text>{success}</Callout.Text>
        </Callout.Root>
      )}

      {/* Header */}
      <Box mb="4">
        <Flex direction={{ initial: 'column', sm: 'row' }} justify="between" align={{ sm: 'center' }} gap="3" mb="3">
          <Box>
            <Heading size="7" mb="1">Patients</Heading>
            <Text size="2" color="gray">Manage patient records and information</Text>
          </Box>
          <Button
            onClick={() => {
              setEditingPatient(null);
              setShowForm(true);
            }}
            size="3"
          >
            Add New Patient
          </Button>
        </Flex>

        {/* Quick Stats */}
        <Flex gap="2" mb="3" wrap="wrap">
          <Card style={{ flex: '1 1 150px', minWidth: '120px' }}>
            <Box p="2">
              <Text size="1" color="gray" mb="1" as="div">Total Patients</Text>
              <Text size="5" weight="bold">{patients.length}</Text>
            </Box>
          </Card>
          <Card style={{ flex: '1 1 150px', minWidth: '120px' }}>
            <Box p="2">
              <Text size="1" color="gray" mb="1" as="div">Showing</Text>
              <Text size="5" weight="bold">{filteredPatients.length}</Text>
            </Box>
          </Card>
          <Card style={{ flex: '1 1 150px', minWidth: '120px' }}>
            <Box p="2">
              <Text size="1" color="gray" mb="1" as="div">This Month</Text>
              <Text size="5" weight="bold">
                {patients.filter((p) => {
                  const created = new Date((p as any).createdAt || 0);
                  const now = new Date();
                  return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
                }).length}
              </Text>
            </Box>
          </Card>
          <Card style={{ flex: '1 1 150px', minWidth: '120px' }}>
            <Box p="2">
              <Text size="1" color="gray" mb="1" as="div">Active</Text>
              <Text size="5" weight="bold">
                {patients.filter((p) => (p as any).active !== false).length}
              </Text>
            </Box>
          </Card>
        </Flex>

        {/* Search and Filter Bar */}
        <Card>
          <Box p="3">
            <Flex direction={{ initial: 'column', sm: 'row' }} gap="3" mb={debouncedSearchQuery || activeFilterCount > 0 ? "2" : "0"}>
              {/* Search Input */}
              <Box flexGrow="1" style={{ minWidth: 0 }}>
                <TextField.Root size="2" style={{ width: '100%' }}>
                  <TextField.Slot>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                  </TextField.Slot>
                  <input
                    type="text"
                    placeholder="Search by name, email, phone, code, or location..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ 
                      all: 'unset', 
                      flex: 1, 
                      width: '100%',
                      padding: '0',
                      fontSize: 'var(--font-size-2)',
                      lineHeight: 'var(--line-height-2)'
                    }}
                  />
                  {searchQuery && (
                    <TextField.Slot>
                      <Button 
                        variant="ghost" 
                        size="1" 
                        onClick={() => setSearchQuery('')}
                        style={{ cursor: 'pointer', padding: '4px' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                      </Button>
                    </TextField.Slot>
                  )}
                </TextField.Root>
              </Box>

              {/* Sort Dropdown */}
              <Box style={{ minWidth: '180px' }}>
                <Select.Root
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as SortOption)}
                >
                  <Select.Trigger placeholder="Sort by..." />
                  <Select.Content>
                    <Select.Item value="name-asc">Name (A-Z)</Select.Item>
                    <Select.Item value="name-desc">Name (Z-A)</Select.Item>
                    <Select.Item value="date-desc">Date of Birth (Newest)</Select.Item>
                    <Select.Item value="date-asc">Date of Birth (Oldest)</Select.Item>
                    <Select.Item value="code-asc">Patient Code (A-Z)</Select.Item>
                    <Select.Item value="code-desc">Patient Code (Z-A)</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>

              {/* Filter Toggle Button */}
              <Button
                variant={showFilters || activeFilterCount > 0 ? "solid" : "soft"}
                size="2"
                onClick={() => setShowFilters(!showFilters)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '4px' }}>
                  <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Filters
                {activeFilterCount > 0 && (
                  <Badge size="1" variant="solid" color="blue" style={{ marginLeft: '6px' }}>
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </Flex>

            {/* Filter Panel */}
            {showFilters && (
              <Box pt="3" style={{ borderTop: '1px solid var(--gray-6)' }}>
                <Flex direction={{ initial: 'column', sm: 'row' }} gap="3" wrap="wrap">
                  {/* Sex Filter */}
                  <Box style={{ minWidth: '140px', flex: '1 1 140px' }}>
                    <Text size="1" weight="medium" mb="1" as="div">Sex</Text>
                    <Select.Root
                      value={filters.sex}
                      onValueChange={(value) => setFilters({ ...filters, sex: value })}
                    >
                      <Select.Trigger />
                      <Select.Content>
                        <Select.Item value="all">All</Select.Item>
                        <Select.Item value="male">Male</Select.Item>
                        <Select.Item value="female">Female</Select.Item>
                        <Select.Item value="other">Other</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  </Box>

                  {/* Active Status Filter */}
                  <Box style={{ minWidth: '140px', flex: '1 1 140px' }}>
                    <Text size="1" weight="medium" mb="1" as="div">Status</Text>
                    <Select.Root
                      value={filters.active}
                      onValueChange={(value) => setFilters({ ...filters, active: value })}
                    >
                      <Select.Trigger />
                      <Select.Content>
                        <Select.Item value="all">All</Select.Item>
                        <Select.Item value="true">Active</Select.Item>
                        <Select.Item value="false">Inactive</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  </Box>

                  {/* Age Range Filters */}
                  <Box style={{ minWidth: '100px', flex: '1 1 100px' }}>
                    <Text size="1" weight="medium" mb="1" as="div">Min Age</Text>
                    <TextField.Root
                      size="2"
                      type="number"
                      placeholder="Min"
                      value={filters.minAge}
                      onChange={(e) => setFilters({ ...filters, minAge: e.target.value })}
                    />
                  </Box>
                  <Box style={{ minWidth: '100px', flex: '1 1 100px' }}>
                    <Text size="1" weight="medium" mb="1" as="div">Max Age</Text>
                    <TextField.Root
                      size="2"
                      type="number"
                      placeholder="Max"
                      value={filters.maxAge}
                      onChange={(e) => setFilters({ ...filters, maxAge: e.target.value })}
                    />
                  </Box>

                  {/* City Filter */}
                  <Box style={{ minWidth: '140px', flex: '1 1 140px' }}>
                    <Text size="1" weight="medium" mb="1" as="div">City</Text>
                    <TextField.Root
                      size="2"
                      placeholder="City"
                      value={filters.city}
                      onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                    />
                  </Box>

                  {/* State Filter */}
                  <Box style={{ minWidth: '140px', flex: '1 1 140px' }}>
                    <Text size="1" weight="medium" mb="1" as="div">State</Text>
                    <TextField.Root
                      size="2"
                      placeholder="State"
                      value={filters.state}
                      onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                    />
                  </Box>

                  {/* Clear Filters Button */}
                  {activeFilterCount > 0 && (
                    <Box style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <Button
                        variant="soft"
                        size="2"
                        onClick={clearFilters}
                      >
                        Clear Filters
                      </Button>
                    </Box>
                  )}
                </Flex>
              </Box>
            )}

            {/* Results Count */}
            {(debouncedSearchQuery || activeFilterCount > 0) && (
              <Box pt="2" style={{ borderTop: '1px solid var(--gray-6)' }}>
                <Text size="2" color="gray">
                  Found {filteredPatients.length} {filteredPatients.length === 1 ? 'patient' : 'patients'}
                </Text>
              </Box>
            )}
          </Box>
        </Card>
      </Box>

      {/* Form Modal/Overlay */}
      <Dialog.Root open={showForm} onOpenChange={(open) => {
        if (!open) {
          setShowForm(false);
          setEditingPatient(null);
        }
      }}>
        <Dialog.Content style={{ maxWidth: '800px' }}>
          <Dialog.Title>
            {editingPatient ? 'Edit Patient' : 'New Patient'}
          </Dialog.Title>
          <Box py="4">
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
          </Box>
        </Dialog.Content>
      </Dialog.Root>

      {/* Patients List */}
      {filteredPatients.length === 0 && patients.length > 0 ? (
        <Card>
          <Box p="8" style={{ textAlign: 'center' }}>
            <Box mb="3">
              <svg style={{ width: '48px', height: '48px', margin: '0 auto', color: 'var(--gray-9)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Box>
            <Heading size="3" mb="1">No patients found</Heading>
            <Text size="2" color="gray" mb="3" as="div">Try adjusting your search or filter criteria.</Text>
            <Button onClick={() => setSearchQuery('')} variant="soft" color="blue">
              Clear Search
            </Button>
          </Box>
        </Card>
      ) : filteredPatients.length === 0 ? (
        <Card>
          <Box p="4" style={{ textAlign: 'center' }}>
            <Box mb="2">
              <svg style={{ width: '48px', height: '48px', margin: '0 auto', color: 'var(--gray-9)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </Box>
            <Heading size="3" mb="1">No patients found</Heading>
            <Text size="2" color="gray" mb="3" as="div">Get started by adding your first patient.</Text>
            <Button
              onClick={() => {
                setEditingPatient(null);
                setShowForm(true);
              }}
            >
              Add First Patient
            </Button>
          </Box>
        </Card>
      ) : (
        <Box>
          <Flex direction="column" gap="2">
            {filteredPatients.map((patient) => {
              const age = Math.floor((new Date().getTime() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
              return (
                <Card key={patient._id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/patients/${patient._id}`)}>
                  <Box p="3">
                    <Flex align="center" gap="3" justify="between" wrap={{ initial: 'wrap', sm: 'nowrap' }}>
                      {/* Patient Info */}
                      <Flex align="center" gap="3" style={{ flex: 1, minWidth: 0 }}>
                        <Box
                          style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            background: 'var(--blue-9)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            flexShrink: 0,
                          }}
                        >
                          {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
                        </Box>
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Flex align="center" gap="2" mb="1" wrap="wrap">
                            <Text size="3" weight="bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {patient.firstName} {patient.lastName}
                            </Text>
                            {patient.patientCode && (
                              <Badge size="1" variant="soft" color="gray">
                                {patient.patientCode}
                              </Badge>
                            )}
                            {patient.sex && patient.sex !== 'unknown' && (
                              <Badge size="1" variant="soft" color="blue" style={{ textTransform: 'capitalize' }}>
                                {patient.sex}
                              </Badge>
                            )}
                            {age > 0 && (
                              <Text size="2" color="gray">
                                {age} years
                              </Text>
                            )}
                          </Flex>
                          <Flex direction="column" gap="1">
                            <Flex align="center" gap="2" wrap="wrap">
                              <Text size="2" color="gray" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                {patient.email}
                              </Text>
                              <Text size="2" color="gray" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                {patient.phone}
                              </Text>
                              <Text size="2" color="gray" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {new Date(patient.dateOfBirth).toLocaleDateString()}
                              </Text>
                              {patient.address && (patient.address.city || patient.address.state) && (
                                <Text size="2" color="gray" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                  {[patient.address.city, patient.address.state].filter(Boolean).join(', ')}
                                </Text>
                              )}
                            </Flex>
                          </Flex>
                        </Box>
                      </Flex>

                      {/* Actions */}
                      <Flex gap="1" align="center" onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
                        <Tooltip content="View Details">
                          <Button asChild size="2" variant="soft" color="green">
                            <Link href={`/patients/${patient._id}`}>
                              <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </Link>
                          </Button>
                        </Tooltip>
                        <Tooltip content="Schedule Appointment">
                          <Button asChild size="2" variant="soft" color="purple">
                            <Link href={`/appointments/new?patientId=${patient._id}`}>
                              <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </Link>
                          </Button>
                        </Tooltip>
                        <Tooltip content="Edit Patient">
                          <Button
                            onClick={() => {
                              setEditingPatient(patient);
                              setShowForm(true);
                            }}
                            size="2"
                            variant="soft"
                            color="blue"
                          >
                            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </Button>
                        </Tooltip>
                        <Tooltip content="Delete Patient">
                          <Button
                            onClick={() => handleDeleteClick(patient._id)}
                            size="2"
                            variant="soft"
                            color="red"
                          >
                            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </Button>
                        </Tooltip>
                      </Flex>
                    </Flex>
                  </Box>
                </Card>
              );
            })}
          </Flex>
        </Box>
      )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialog.Content>
            <AlertDialog.Title>Delete Patient</AlertDialog.Title>
            <AlertDialog.Description>
              Are you sure you want to delete this patient? This action cannot be undone.
            </AlertDialog.Description>
            <Flex gap="3" mt="4" justify="end">
              <AlertDialog.Cancel>
                <Button variant="soft" color="gray">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action>
                <Button variant="solid" color="red" onClick={handleDelete}>Delete</Button>
              </AlertDialog.Action>
            </Flex>
          </AlertDialog.Content>
        </AlertDialog.Root>
      </Box>
    );
  }
