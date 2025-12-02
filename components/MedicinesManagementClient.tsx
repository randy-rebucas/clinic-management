'use client';

import { useState, useEffect, useCallback } from 'react';

interface Medicine {
  _id: string;
  name: string;
  genericName?: string;
  brandNames?: string[];
  form: 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'drops' | 'inhaler' | 'other';
  strength: string;
  unit: string;
  route: 'oral' | 'iv' | 'im' | 'topical' | 'inhalation' | 'ophthalmic' | 'otic' | 'other';
  category: string;
  indications: string[];
  contraindications?: string[];
  sideEffects?: string[];
  standardDosage?: string;
  standardFrequency?: string;
  duration?: string;
  requiresPrescription: boolean;
  controlledSubstance?: boolean;
  schedule?: string;
  active: boolean;
  createdAt: string;
}

interface MedicinesManagementClientProps {
  user: { role: string; [key: string]: any };
}

const FORMS = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'syrup', label: 'Syrup' },
  { value: 'injection', label: 'Injection' },
  { value: 'cream', label: 'Cream' },
  { value: 'drops', label: 'Drops' },
  { value: 'inhaler', label: 'Inhaler' },
  { value: 'other', label: 'Other' },
];

const ROUTES = [
  { value: 'oral', label: 'Oral' },
  { value: 'iv', label: 'IV' },
  { value: 'im', label: 'IM' },
  { value: 'topical', label: 'Topical' },
  { value: 'inhalation', label: 'Inhalation' },
  { value: 'ophthalmic', label: 'Ophthalmic' },
  { value: 'otic', label: 'Otic' },
  { value: 'other', label: 'Other' },
];

const CATEGORIES = [
  'Analgesic', 'Antibiotic', 'Antihypertensive', 'Antihistamine', 'Antidiabetic',
  'Antacid', 'Antiemetic', 'Bronchodilator', 'Corticosteroid', 'Diuretic',
  'Laxative', 'NSAID', 'PPI', 'Sedative', 'Vitamin', 'Other'
];

export default function MedicinesManagementClient({ user }: MedicinesManagementClientProps) {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [formFilter, setFormFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    genericName: '',
    brandNames: '',
    form: 'tablet' as Medicine['form'],
    strength: '',
    unit: 'mg',
    route: 'oral' as Medicine['route'],
    category: 'Analgesic',
    indications: '',
    contraindications: '',
    sideEffects: '',
    standardDosage: '',
    standardFrequency: '',
    duration: '',
    requiresPrescription: true,
    controlledSubstance: false,
    schedule: '',
    active: true,
  });

  const fetchMedicines = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (categoryFilter) params.set('category', categoryFilter);
      if (formFilter) params.set('form', formFilter);
      if (search) params.set('search', search);

      const response = await fetch(`/api/medicines?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setMedicines(Array.isArray(data) ? data : data.medicines || []);
      }
    } catch (err) {
      console.error('Error fetching medicines:', err);
      setError('Failed to load medicines');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, formFilter, search]);

  useEffect(() => {
    fetchMedicines();
  }, [fetchMedicines]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        brandNames: formData.brandNames.split(',').map(s => s.trim()).filter(Boolean),
        indications: formData.indications.split(',').map(s => s.trim()).filter(Boolean),
        contraindications: formData.contraindications.split(',').map(s => s.trim()).filter(Boolean),
        sideEffects: formData.sideEffects.split(',').map(s => s.trim()).filter(Boolean),
      };

      const url = editingMedicine ? `/api/medicines/${editingMedicine._id}` : '/api/medicines';
      const method = editingMedicine ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message || 'Medicine saved successfully');
        setTimeout(() => setSuccess(null), 3000);
        setShowModal(false);
        resetForm();
        fetchMedicines();
      } else {
        setError(data.error || 'Failed to save medicine');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err) {
      setError('An error occurred');
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (medicine: Medicine) => {
    if (!confirm(`Are you sure you want to delete "${medicine.name}"?`)) return;

    try {
      const response = await fetch(`/api/medicines/${medicine._id}`, { method: 'DELETE' });

      if (response.ok) {
        setSuccess('Medicine deleted successfully');
        setTimeout(() => setSuccess(null), 3000);
        fetchMedicines();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete medicine');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err) {
      setError('An error occurred');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleEdit = (medicine: Medicine) => {
    setEditingMedicine(medicine);
    setFormData({
      name: medicine.name,
      genericName: medicine.genericName || '',
      brandNames: medicine.brandNames?.join(', ') || '',
      form: medicine.form,
      strength: medicine.strength,
      unit: medicine.unit,
      route: medicine.route,
      category: medicine.category,
      indications: medicine.indications?.join(', ') || '',
      contraindications: medicine.contraindications?.join(', ') || '',
      sideEffects: medicine.sideEffects?.join(', ') || '',
      standardDosage: medicine.standardDosage || '',
      standardFrequency: medicine.standardFrequency || '',
      duration: medicine.duration || '',
      requiresPrescription: medicine.requiresPrescription,
      controlledSubstance: medicine.controlledSubstance || false,
      schedule: medicine.schedule || '',
      active: medicine.active,
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingMedicine(null);
    setFormData({
      name: '',
      genericName: '',
      brandNames: '',
      form: 'tablet',
      strength: '',
      unit: 'mg',
      route: 'oral',
      category: 'Analgesic',
      indications: '',
      contraindications: '',
      sideEffects: '',
      standardDosage: '',
      standardFrequency: '',
      duration: '',
      requiresPrescription: true,
      controlledSubstance: false,
      schedule: '',
      active: true,
    });
  };

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-3" style={{ minHeight: '50vh', justifyContent: 'center' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-700">Loading medicines...</p>
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <div>
              <h1 className="text-3xl font-bold mb-1">Medicines Catalog</h1>
              <p className="text-sm text-gray-500">Manage medicine database for prescriptions</p>
            </div>
            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Medicine
            </button>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[150px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Total Medicines</div>
                <div className="text-2xl font-bold">{medicines.length}</div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[150px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Prescription Only</div>
                <div className="text-2xl font-bold text-red-600">{medicines.filter(m => m.requiresPrescription).length}</div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[150px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Controlled</div>
                <div className="text-2xl font-bold text-purple-600">{medicines.filter(m => m.controlledSubstance).length}</div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2 flex-1 min-w-[150px]">
              <div className="p-2">
                <div className="text-xs text-gray-500 mb-1">Active</div>
                <div className="text-2xl font-bold text-green-600">{medicines.filter(m => m.active).length}</div>
              </div>
            </div>
          </div>

          {/* Search and Filter Bar */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="p-3">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search Input */}
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" viewBox="0 0 16 16" fill="none">
                        <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search medicines..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    {search && (
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                        <button onClick={() => setSearch('')} className="cursor-pointer p-1 text-gray-400 hover:text-gray-600">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Category Dropdown */}
                <div style={{ minWidth: '160px' }}>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">All Categories</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Form Dropdown */}
                <div style={{ minWidth: '120px' }}>
                  <select
                    value={formFilter}
                    onChange={(e) => setFormFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">All Forms</option>
                    {FORMS.map(form => (
                      <option key={form.value} value={form.value}>{form.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Medicines List */}
          {medicines.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-8 text-center">
                <div className="mb-3">
                  <svg className="w-12 h-12 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold mb-1">No medicines found</h2>
                <p className="text-sm text-gray-500 mb-3">Get started by adding your first medicine.</p>
                <button
                  onClick={() => { resetForm(); setShowModal(true); }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Add First Medicine
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {medicines.map((medicine) => (
                <div key={medicine._id} className="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                  <div className="p-3">
                    <div className="flex items-center gap-3 justify-between flex-wrap sm:flex-nowrap">
                      {/* Medicine Info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-12 h-12 rounded-md bg-blue-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                          {medicine.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-base font-bold overflow-hidden text-ellipsis whitespace-nowrap">
                              {medicine.name}
                            </span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                              {medicine.category}
                            </span>
                            {medicine.requiresPrescription && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded-full">Rx</span>
                            )}
                            {medicine.controlledSubstance && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded-full">Ctrl</span>
                            )}
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              medicine.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {medicine.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap text-sm text-gray-500">
                            {medicine.genericName && (
                              <span className="italic">{medicine.genericName}</span>
                            )}
                            <span>{FORMS.find(f => f.value === medicine.form)?.label || medicine.form}</span>
                            <span>•</span>
                            <span>{medicine.strength}</span>
                            <span>•</span>
                            <span>{ROUTES.find(r => r.value === medicine.route)?.label || medicine.route}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 items-center flex-shrink-0">
                        <button
                          onClick={() => handleEdit(medicine)}
                          className="p-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(medicine)}
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
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-4">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold">
                  {editingMedicine ? 'Edit Medicine' : 'Add New Medicine'}
                </h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Name */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Medicine Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {/* Generic Name */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Generic Name</label>
                    <input
                      type="text"
                      value={formData.genericName}
                      onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Brand Names */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Brand Names</label>
                    <input
                      type="text"
                      value={formData.brandNames}
                      onChange={(e) => setFormData({ ...formData, brandNames: e.target.value })}
                      placeholder="Comma separated"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Form */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Form *</label>
                    <select
                      value={formData.form}
                      onChange={(e) => setFormData({ ...formData, form: e.target.value as Medicine['form'] })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                      {FORMS.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Route */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Route *</label>
                    <select
                      value={formData.route}
                      onChange={(e) => setFormData({ ...formData, route: e.target.value as Medicine['route'] })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                      {ROUTES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Strength */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Strength *</label>
                    <input
                      type="text"
                      value={formData.strength}
                      onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                      required
                      placeholder="e.g., 500 mg"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Indications */}
                  <div className="col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Indications</label>
                    <input
                      type="text"
                      value={formData.indications}
                      onChange={(e) => setFormData({ ...formData, indications: e.target.value })}
                      placeholder="Comma separated (e.g., Pain, Fever)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Options */}
                  <div className="col-span-3 flex flex-wrap gap-6">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.requiresPrescription}
                        onChange={(e) => setFormData({ ...formData, requiresPrescription: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm text-gray-700">Requires Prescription</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.controlledSubstance}
                        onChange={(e) => setFormData({ ...formData, controlledSubstance: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm text-gray-700">Controlled Substance</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.active}
                        onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm text-gray-700">Active</span>
                    </label>
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); resetForm(); }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : editingMedicine ? 'Update Medicine' : 'Create Medicine'}
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
