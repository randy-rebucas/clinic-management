'use client';

import { useState, useEffect, useCallback } from 'react';

interface Staff {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  employeeId?: string;
  department?: string;
  specialization?: string;
  licenseNumber?: string;
  certification?: string;
  status: 'active' | 'inactive' | 'on-leave';
  staffType: 'nurse' | 'receptionist' | 'accountant';
  hireDate?: string;
  createdAt: string;
}

interface StaffManagementClientProps {
  user: { role: string; [key: string]: any };
}

const STAFF_TYPES = [
  { value: 'all', label: 'All Staff' },
  { value: 'nurse', label: 'Nurses' },
  { value: 'receptionist', label: 'Receptionists' },
  { value: 'accountant', label: 'Accountants' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'bg-green-100 text-green-800' },
  { value: 'inactive', label: 'Inactive', color: 'bg-gray-100 text-gray-800' },
  { value: 'on-leave', label: 'On Leave', color: 'bg-yellow-100 text-yellow-800' },
];

export default function StaffManagementClient({ user }: StaffManagementClientProps) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState({ nurses: 0, receptionists: 0, accountants: 0 });
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    staffType: 'nurse',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    employeeId: '',
    department: '',
    specialization: '',
    licenseNumber: '',
    certification: '',
    status: 'active',
    hireDate: '',
    address: '',
  });

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('type', filter);
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);

      const response = await fetch(`/api/staff?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setStaff(data.staff);
        if (data.counts) setCounts(data.counts);
      }
    } catch (err) {
      console.error('Error fetching staff:', err);
      setError('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [filter, statusFilter, search]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const url = editingStaff ? `/api/staff/${editingStaff._id}` : '/api/staff';
      const method = editingStaff ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message || 'Staff saved successfully');
        setTimeout(() => setSuccess(null), 3000);
        setShowModal(false);
        resetForm();
        fetchStaff();
      } else {
        setError(data.error || 'Failed to save staff');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err) {
      setError('An error occurred');
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (staffMember: Staff) => {
    if (!confirm(`Are you sure you want to delete ${staffMember.firstName} ${staffMember.lastName}? This will also delete their user account.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/staff/${staffMember._id}?type=${staffMember.staffType}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSuccess('Staff member deleted successfully');
        setTimeout(() => setSuccess(null), 3000);
        fetchStaff();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete staff');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err) {
      setError('An error occurred');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleEdit = (staffMember: Staff) => {
    setEditingStaff(staffMember);
    setFormData({
      staffType: staffMember.staffType,
      firstName: staffMember.firstName,
      lastName: staffMember.lastName,
      email: staffMember.email,
      phone: staffMember.phone,
      employeeId: staffMember.employeeId || '',
      department: staffMember.department || '',
      specialization: staffMember.specialization || '',
      licenseNumber: staffMember.licenseNumber || '',
      certification: staffMember.certification || '',
      status: staffMember.status,
      hireDate: staffMember.hireDate ? new Date(staffMember.hireDate).toISOString().split('T')[0] : '',
      address: '',
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingStaff(null);
    setFormData({
      staffType: 'nurse',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      employeeId: '',
      department: '',
      specialization: '',
      licenseNumber: '',
      certification: '',
      status: 'active',
      hireDate: '',
      address: '',
    });
  };

  const getStaffTypeLabel = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getStatusBadge = (status: string) => {
    const option = STATUS_OPTIONS.find(s => s.value === status);
    return option ? (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${option.color}`}>
        {option.label}
      </span>
    ) : status;
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-teal-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-teal-100 border-t-teal-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading staff...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-teal-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-500 rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="text-red-800 text-sm font-semibold">{error}</p>
              </div>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-500 rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-green-800 text-sm font-semibold">{success}</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Staff Management</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Manage nurses, receptionists, and accountants</p>
                </div>
              </div>
              <button
                onClick={() => { resetForm(); setShowModal(true); }}
                className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all inline-flex items-center gap-2 text-sm font-semibold shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Staff Member
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-teal-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Total Staff</div>
              </div>
              <div className="text-2xl font-bold text-gray-900">{counts.nurses + counts.receptionists + counts.accountants}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-green-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Nurses</div>
              </div>
              <div className="text-2xl font-bold text-green-600">{counts.nurses}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-purple-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Receptionists</div>
              </div>
              <div className="text-2xl font-bold text-purple-600">{counts.receptionists}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-orange-500 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Accountants</div>
              </div>
              <div className="text-2xl font-bold text-orange-600">{counts.accountants}</div>
            </div>
          </div>

          {/* Search and Filter Bar */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-teal-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">Search & Filter</h2>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search Input */}
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-gray-400" viewBox="0 0 16 16" fill="none">
                        <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search by name, email, or employee ID..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-12 pr-12 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                    />
                    {search && (
                      <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                        <button onClick={() => setSearch('')} className="cursor-pointer p-1 text-gray-400 hover:text-gray-600">
                          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Type Dropdown */}
                <div style={{ minWidth: '180px' }}>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                  >
                    {STAFF_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>

                {/* Status Dropdown */}
                <div style={{ minWidth: '160px' }}>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                  >
                    <option value="">All Status</option>
                    {STATUS_OPTIONS.map(status => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Staff List */}
          {staff.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">No staff members found</h2>
                <p className="text-sm text-gray-600 font-medium mb-4">Get started by adding your first staff member.</p>
                <button
                  onClick={() => { resetForm(); setShowModal(true); }}
                  className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all font-semibold shadow-md"
                >
                  Add First Staff Member
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {staff.map((member) => (
                <div key={member._id} className="bg-white border border-gray-200 rounded-xl hover:shadow-md transition-all">
                  <div className="p-4">
                    <div className="flex items-center gap-3 justify-between flex-wrap sm:flex-nowrap">
                      {/* Staff Info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-base font-bold flex-shrink-0 shadow-md ${
                          member.staffType === 'nurse' ? 'bg-gradient-to-br from-green-500 to-green-600' :
                          member.staffType === 'receptionist' ? 'bg-gradient-to-br from-purple-500 to-purple-600' :
                          'bg-gradient-to-br from-orange-500 to-orange-600'
                        }`}>
                          {member.firstName.charAt(0)}{member.lastName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-base font-bold text-gray-900 overflow-hidden text-ellipsis whitespace-nowrap">
                              {member.firstName} {member.lastName}
                            </span>
                            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
                              member.staffType === 'nurse' ? 'bg-green-100 text-green-800 border-green-200' :
                              member.staffType === 'receptionist' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                              'bg-orange-100 text-orange-800 border-orange-200'
                            }`}>
                              {getStaffTypeLabel(member.staffType)}
                            </span>
                            {getStatusBadge(member.status)}
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-gray-600 font-medium flex items-center gap-1.5">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              {member.email}
                            </span>
                            <span className="text-sm text-gray-600 font-medium flex items-center gap-1.5">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              {member.phone}
                            </span>
                            {member.department && (
                              <span className="text-sm text-gray-600 font-medium flex items-center gap-1.5">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                {member.department}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 items-center flex-shrink-0">
                        <button
                          onClick={() => handleEdit(member)}
                          className="p-2.5 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(member)}
                          className="p-2.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
              <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-teal-50 to-teal-100/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {editingStaff ? 'Edit Staff Member' : 'Add New Staff Member'}
                  </h2>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Staff Type */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Staff Type *</label>
                    <select
                      value={formData.staffType}
                      onChange={(e) => setFormData({ ...formData, staffType: e.target.value })}
                      disabled={!!editingStaff}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100"
                    >
                      <option value="nurse">Nurse</option>
                      <option value="receptionist">Receptionist</option>
                      <option value="accountant">Accountant</option>
                    </select>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                    />
                  </div>

                  {/* Contact */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                    />
                  </div>

                  {/* Employee Info */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                    <input
                      type="text"
                      value={formData.employeeId}
                      onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                    />
                  </div>

                  {/* Type-specific fields */}
                  {formData.staffType === 'nurse' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Specialization</label>
                        <input
                          type="text"
                          value={formData.specialization}
                          onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                          placeholder="e.g., Emergency, Pediatrics"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">License Number</label>
                        <input
                          type="text"
                          value={formData.licenseNumber}
                          onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                        />
                      </div>
                    </>
                  )}

                  {formData.staffType === 'accountant' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Certification</label>
                        <input
                          type="text"
                          value={formData.certification}
                          onChange={(e) => setFormData({ ...formData, certification: e.target.value })}
                          placeholder="e.g., CPA, CMA"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">License Number</label>
                        <input
                          type="text"
                          value={formData.licenseNumber}
                          onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                        />
                      </div>
                    </>
                  )}

                  {/* Hire Date & Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hire Date</label>
                    <input
                      type="date"
                      value={formData.hireDate}
                      onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                    >
                      {STATUS_OPTIONS.map(status => (
                        <option key={status.value} value={status.value}>{status.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Address */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      rows={2}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); resetForm(); }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 disabled:from-teal-400 disabled:to-teal-500 transition-all font-semibold shadow-md"
                  >
                    {saving ? 'Saving...' : editingStaff ? 'Update Staff' : 'Create Staff'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
