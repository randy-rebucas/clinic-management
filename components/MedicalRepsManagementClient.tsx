'use client';

import { useState, useEffect, useCallback } from 'react';

interface Company {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
}

interface MedicalRep {
  _id: string;
  repCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company: Company;
  territory: string[];
  products: string[];
  notes?: string;
  status: 'active' | 'inactive';
  userId?: {
    _id: string;
    name: string;
    email: string;
    status: string;
  };
  createdAt: string;
}

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  territory: string;
  products: string;
  notes: string;
}

const initialFormData: FormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  companyName: '',
  companyPhone: '',
  companyEmail: '',
  territory: '',
  products: '',
  notes: '',
};

export default function MedicalRepsManagementClient() {
  const [reps, setReps] = useState<MedicalRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [showModal, setShowModal] = useState(false);
  const [editingRep, setEditingRep] = useState<MedicalRep | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchReps = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      
      const response = await fetch(`/api/medical-representatives?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setReps(data.data || []);
      } else {
        setError(data.error || 'Failed to fetch medical representatives');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch medical representatives');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    fetchReps();
  }, [fetchReps]);

  const handleOpenModal = (rep?: MedicalRep) => {
    if (rep) {
      setEditingRep(rep);
      setFormData({
        firstName: rep.firstName,
        lastName: rep.lastName,
        email: rep.email,
        phone: rep.phone || '',
        companyName: rep.company?.name || '',
        companyPhone: rep.company?.phone || '',
        companyEmail: rep.company?.email || '',
        territory: rep.territory?.join(', ') || '',
        products: rep.products?.join(', ') || '',
        notes: rep.notes || '',
      });
    } else {
      setEditingRep(null);
      setFormData(initialFormData);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingRep(null);
    setFormData(initialFormData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone || undefined,
        company: {
          name: formData.companyName,
          phone: formData.companyPhone || undefined,
          email: formData.companyEmail || undefined,
        },
        territory: formData.territory ? formData.territory.split(',').map(t => t.trim()).filter(Boolean) : [],
        products: formData.products ? formData.products.split(',').map(p => p.trim()).filter(Boolean) : [],
        notes: formData.notes || undefined,
      };

      const url = editingRep
        ? `/api/medical-representatives/${editingRep._id}`
        : '/api/medical-representatives';
      
      const response = await fetch(url, {
        method: editingRep ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(editingRep ? 'Medical representative updated successfully' : 'Medical representative created successfully');
        setTimeout(() => setSuccess(null), 3000);
        handleCloseModal();
        fetchReps();
      } else {
        setError(data.error || 'Failed to save medical representative');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save medical representative');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rep: MedicalRep) => {
    if (!confirm(`Are you sure you want to deactivate ${rep.firstName} ${rep.lastName}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/medical-representatives/${rep._id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Medical representative deactivated successfully');
        setTimeout(() => setSuccess(null), 3000);
        fetchReps();
      } else {
        setError(data.error || 'Failed to deactivate medical representative');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to deactivate medical representative');
    }
  };

  const handleToggleStatus = async (rep: MedicalRep) => {
    const newStatus = rep.status === 'active' ? 'inactive' : 'active';
    
    try {
      const response = await fetch(`/api/medical-representatives/${rep._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`Medical representative ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
        setTimeout(() => setSuccess(null), 3000);
        fetchReps();
      } else {
        setError(data.error || 'Failed to update status');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-amber-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-amber-100 border-t-amber-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading medical representatives...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-amber-50/30 min-h-screen">
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
                <div className="p-2 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Medical Representatives</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Manage pharmaceutical and medical device representatives</p>
                </div>
              </div>
              <button
                onClick={() => handleOpenModal()}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg hover:from-amber-600 hover:to-amber-700 transition-all inline-flex items-center gap-2 text-sm font-semibold shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Representative
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-amber-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Total Reps</div>
              </div>
              <div className="text-3xl font-bold text-gray-900">{reps.length}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Active</div>
              </div>
              <div className="text-3xl font-bold text-green-600">{reps.filter(r => r.status === 'active').length}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gray-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Inactive</div>
              </div>
              <div className="text-3xl font-bold text-gray-600">{reps.filter(r => r.status === 'inactive').length}</div>
            </div>
          </div>

          {/* Search and Filter Bar */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">Search & Filter</h2>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-gray-400" viewBox="0 0 16 16" fill="none">
                        <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search by name, email, or company..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-12 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    />
                    {searchQuery && (
                      <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                        <button onClick={() => setSearchQuery('')} className="cursor-pointer p-1 text-gray-400 hover:text-gray-600">
                          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ minWidth: '160px' }}>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Representatives List */}
          {reps.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">No medical representatives found</h2>
                <p className="text-sm text-gray-600 font-medium mb-4">Get started by adding your first representative.</p>
                <button
                  onClick={() => handleOpenModal()}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg hover:from-amber-600 hover:to-amber-700 transition-all font-semibold shadow-md"
                >
                  Add First Representative
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Code</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Company</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Products</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reps.map((rep) => (
                <tr key={rep._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-mono text-gray-600">{rep.repCode}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{rep.firstName} {rep.lastName}</div>
                    <div className="text-sm text-gray-500">{rep.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{rep.company?.name || '-'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{rep.phone || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(rep.products || []).slice(0, 3).map((product, idx) => (
                        <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {product}
                        </span>
                      ))}
                      {(rep.products || []).length > 3 && (
                        <span className="text-xs text-gray-500">+{rep.products.length - 3} more</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleToggleStatus(rep)}
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold cursor-pointer hover:opacity-80 border ${
                        rep.status === 'active'
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : 'bg-gray-100 text-gray-800 border-gray-200'
                      }`}
                    >
                      {rep.status}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleOpenModal(rep)}
                      className="px-3 py-1.5 text-xs font-semibold bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors mr-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(rep)}
                      className="px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
        </div>

        {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-amber-100/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingRep ? 'Edit Medical Representative' : 'Add Medical Representative'}
                </h2>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Personal Information */}
                <div className="col-span-2">
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-500 rounded-lg">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-bold text-gray-900">Personal Information</h3>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>

                {/* Company Information */}
                <div className="col-span-2 mt-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-blue-500 rounded-lg">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-bold text-gray-900">Company Information</h3>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Phone</label>
                  <input
                    type="tel"
                    value={formData.companyPhone}
                    onChange={(e) => setFormData({ ...formData, companyPhone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Email</label>
                  <input
                    type="email"
                    value={formData.companyEmail}
                    onChange={(e) => setFormData({ ...formData, companyEmail: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>

                {/* Products & Territory */}
                <div className="col-span-2 mt-4">
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-purple-500 rounded-lg">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-bold text-gray-900">Products & Territory</h3>
                    </div>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Products (comma-separated)</label>
                  <input
                    type="text"
                    value={formData.products}
                    onChange={(e) => setFormData({ ...formData, products: e.target.value })}
                    placeholder="e.g., Amoxicillin, Paracetamol, Vitamin C"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Territory (comma-separated)</label>
                  <input
                    type="text"
                    value={formData.territory}
                    onChange={(e) => setFormData({ ...formData, territory: e.target.value })}
                    placeholder="e.g., Metro Manila, Cebu, Davao"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg hover:from-amber-600 hover:to-amber-700 disabled:from-amber-400 disabled:to-amber-500 transition-all font-semibold shadow-md"
                >
                  {submitting ? 'Saving...' : (editingRep ? 'Update' : 'Create')}
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

