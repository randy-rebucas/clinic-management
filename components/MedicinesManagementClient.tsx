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
  const [medicineSuggestions, setMedicineSuggestions] = useState<Medicine[]>([]);
  const [showMedicineSuggestions, setShowMedicineSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
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
        // Handle both array response and object with data property
        if (data.success && data.data) {
          setMedicines(Array.isArray(data.data) ? data.data : []);
        } else if (Array.isArray(data)) {
          setMedicines(data);
        } else if (data.medicines) {
          setMedicines(Array.isArray(data.medicines) ? data.medicines : []);
        } else {
          setMedicines([]);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || 'Failed to load medicines');
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

  // Fetch medicine suggestions for autocomplete
  useEffect(() => {
    if (formData.name.length >= 2 && !editingMedicine) {
      const timer = setTimeout(() => {
        const params = new URLSearchParams();
        params.set('search', formData.name);
        params.set('active', 'true');
        
        fetch(`/api/medicines?${params.toString()}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.data) {
              // Filter out exact matches and limit to 10 suggestions
              const suggestions = data.data
                .filter((m: Medicine) => 
                  m.name.toLowerCase() !== formData.name.toLowerCase() &&
                  m.name.toLowerCase().includes(formData.name.toLowerCase())
                )
                .slice(0, 10);
              setMedicineSuggestions(suggestions);
              setShowMedicineSuggestions(suggestions.length > 0);
            } else {
              setMedicineSuggestions([]);
              setShowMedicineSuggestions(false);
            }
          })
          .catch(() => {
            setMedicineSuggestions([]);
            setShowMedicineSuggestions(false);
          });
      }, 300); // Debounce for 300ms
      
      return () => clearTimeout(timer);
    } else {
      setMedicineSuggestions([]);
      setShowMedicineSuggestions(false);
    }
  }, [formData.name, editingMedicine]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.medicine-name-autocomplete')) {
        setShowMedicineSuggestions(false);
        setHighlightedIndex(-1);
      }
    };

    if (showMedicineSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMedicineSuggestions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

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

      if (response.ok && data.success) {
        setSuccess(editingMedicine ? 'Medicine updated successfully' : 'Medicine created successfully');
        setTimeout(() => setSuccess(null), 3000);
        setShowModal(false);
        resetForm();
        fetchMedicines();
      } else {
        setError(data.error || 'Failed to save medicine');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err: any) {
      console.error('Error saving medicine:', err);
      setError(err.message || 'An error occurred while saving the medicine');
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (medicine: Medicine) => {
    if (!confirm(`Are you sure you want to delete "${medicine.name}"?`)) return;

    try {
      const response = await fetch(`/api/medicines/${medicine._id}`, { method: 'DELETE' });
      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess(data.message || 'Medicine deleted successfully');
        setTimeout(() => setSuccess(null), 3000);
        fetchMedicines();
      } else {
        setError(data.error || 'Failed to delete medicine');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err: any) {
      console.error('Error deleting medicine:', err);
      setError(err.message || 'An error occurred while deleting the medicine');
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

  const selectMedicineSuggestion = (medicine: Medicine) => {
    setFormData({
      ...formData,
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
    setShowMedicineSuggestions(false);
    setHighlightedIndex(-1);
  };

  const handleMedicineNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showMedicineSuggestions || medicineSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => 
        prev < medicineSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      selectMedicineSuggestion(medicineSuggestions[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setShowMedicineSuggestions(false);
      setHighlightedIndex(-1);
    }
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
    setMedicineSuggestions([]);
    setShowMedicineSuggestions(false);
    setHighlightedIndex(-1);
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-indigo-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-100 border-t-indigo-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading medicines...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-indigo-50/30 min-h-screen">
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
                <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Medicines Catalog</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Manage medicine database for prescriptions</p>
                </div>
              </div>
              <button
                onClick={() => { resetForm(); setShowModal(true); }}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-lg hover:from-indigo-600 hover:to-indigo-700 transition-all inline-flex items-center gap-2 text-sm font-semibold shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Medicine
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Total Medicines</div>
              </div>
              <div className="text-3xl font-bold text-gray-900">{medicines.length}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-red-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Prescription Only</div>
              </div>
              <div className="text-3xl font-bold text-red-600">{medicines.filter(m => m.requiresPrescription).length}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Controlled</div>
              </div>
              <div className="text-3xl font-bold text-purple-600">{medicines.filter(m => m.controlledSubstance).length}</div>
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
              <div className="text-3xl font-bold text-green-600">{medicines.filter(m => m.active).length}</div>
            </div>
          </div>

          {/* Search and Filter Bar */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-500 rounded-lg">
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
                      placeholder="Search medicines..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-12 pr-12 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
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

                {/* Category Dropdown */}
                <div style={{ minWidth: '180px' }}>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  >
                    <option value="">All Categories</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Form Dropdown */}
                <div style={{ minWidth: '140px' }}>
                  <select
                    value={formFilter}
                    onChange={(e) => setFormFilter(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
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
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">No medicines found</h2>
                <p className="text-sm text-gray-600 font-medium mb-4">Get started by adding your first medicine.</p>
                <button
                  onClick={() => { resetForm(); setShowModal(true); }}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-lg hover:from-indigo-600 hover:to-indigo-700 transition-all font-semibold shadow-md"
                >
                  Add First Medicine
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {medicines.map((medicine) => (
                <div key={medicine._id} className="bg-white border border-gray-200 rounded-xl hover:shadow-md transition-all">
                  <div className="p-4">
                    <div className="flex items-center gap-3 justify-between flex-wrap sm:flex-nowrap">
                      {/* Medicine Info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0 shadow-md">
                          {medicine.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-base font-bold text-gray-900 overflow-hidden text-ellipsis whitespace-nowrap">
                              {medicine.name}
                            </span>
                            <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 text-xs font-semibold rounded-full border border-indigo-200">
                              {medicine.category}
                            </span>
                            {medicine.requiresPrescription && (
                              <span className="px-2.5 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded-full border border-red-200">Rx</span>
                            )}
                            {medicine.controlledSubstance && (
                              <span className="px-2.5 py-1 bg-purple-100 text-purple-800 text-xs font-semibold rounded-full border border-purple-200">Ctrl</span>
                            )}
                            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
                              medicine.active ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-800 border-gray-200'
                            }`}>
                              {medicine.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap text-sm text-gray-600 font-medium">
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
                      <div className="flex gap-2 items-center flex-shrink-0">
                        <button
                          onClick={() => handleEdit(medicine)}
                          className="p-2.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(medicine)}
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
            <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-4">
              <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-indigo-100/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {editingMedicine ? 'Edit Medicine' : 'Add New Medicine'}
                  </h2>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Name */}
                  <div className="col-span-2 medicine-name-autocomplete relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Medicine Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => {
                        setFormData({ ...formData, name: e.target.value });
                        setShowMedicineSuggestions(true);
                        setHighlightedIndex(-1);
                      }}
                      onFocus={() => {
                        if (medicineSuggestions.length > 0 && formData.name.length >= 2) {
                          setShowMedicineSuggestions(true);
                        }
                      }}
                      onKeyDown={handleMedicineNameKeyDown}
                      required
                      placeholder="Start typing to see suggestions..."
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    />
                    {showMedicineSuggestions && medicineSuggestions.length > 0 && !editingMedicine && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                        {medicineSuggestions.map((medicine, index) => (
                          <button
                            key={medicine._id}
                            type="button"
                            onClick={() => selectMedicineSuggestion(medicine)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            className={`w-full text-left px-4 py-3 hover:bg-indigo-50 rounded transition-colors ${
                              highlightedIndex === index ? 'bg-indigo-50' : ''
                            }`}
                          >
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-semibold text-sm text-gray-900">{medicine.name}</span>
                              {medicine.genericName && (
                                <span className="text-xs text-gray-600 italic">{medicine.genericName}</span>
                              )}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-gray-500">
                                  {FORMS.find(f => f.value === medicine.form)?.label || medicine.form}
                                </span>
                                <span className="text-xs text-gray-400">•</span>
                                <span className="text-xs text-gray-500">{medicine.strength}</span>
                                <span className="text-xs text-gray-400">•</span>
                                <span className="text-xs text-gray-500">{medicine.category}</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    />
                  </div>

                  {/* Form */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Form *</label>
                    <select
                      value={formData.form}
                      onChange={(e) => setFormData({ ...formData, form: e.target.value as Medicine['form'] })}
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
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
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-lg hover:from-indigo-600 hover:to-indigo-700 disabled:from-indigo-400 disabled:to-indigo-500 transition-all font-semibold shadow-md"
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
