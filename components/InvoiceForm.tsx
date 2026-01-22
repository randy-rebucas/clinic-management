'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useSetting } from './SettingsContext';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  patientCode?: string;
  discountEligibility?: {
    pwd?: { eligible: boolean; idNumber?: string };
    senior?: { eligible: boolean; idNumber?: string };
    membership?: { eligible: boolean; membershipType?: string; discountPercentage?: number };
  };
}

interface Visit {
  _id: string;
  visitCode: string;
  date: string;
  visitType?: string;
}

interface Service {
  _id: string;
  name: string;
  code?: string;
  category?: string;
  unitPrice: number;
  unit?: string;
}

interface InvoiceItem {
  serviceId?: string;
  code?: string;
  description: string;
  category?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Discount {
  type: 'pwd' | 'senior' | 'membership' | 'promotional' | 'other';
  reason?: string;
  percentage?: number;
  amount: number;
}

interface InvoiceFormProps {
  initialData?: {
    patient?: string;
    visit?: string;
  };
  patients: Patient[];
  visits: Visit[];
  services: Service[];
  onSubmit: (data: any) => void;
  onCancel?: () => void;
}

export default function InvoiceForm({
  initialData,
  patients,
  visits,
  services,
  onSubmit,
  onCancel,
}: InvoiceFormProps) {
  const currency = useSetting('billingSettings.currency', 'PHP');
  const defaultTaxRate = useSetting('billingSettings.taxRate', 0);
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };
  
  const [formData, setFormData] = useState({
    patient: initialData?.patient || '',
    visit: initialData?.visit || '',
    items: [] as InvoiceItem[],
    discounts: [] as Discount[],
    tax: defaultTaxRate,
    insurance: {
      provider: '',
      policyNumber: '',
      memberId: '',
      coverageType: '' as 'full' | 'partial' | 'co-pay' | '',
      coverageAmount: 0,
      claimNumber: '',
      status: '' as 'pending' | 'approved' | 'rejected' | 'paid' | '',
      notes: '',
    },
  });

  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [serviceSearch, setServiceSearch] = useState('');
  const [showServiceSearch, setShowServiceSearch] = useState(false);
  const [filteredServices, setFilteredServices] = useState<Service[]>([]);

  useEffect(() => {
    if (formData.patient) {
      const patient = patients.find((p) => p._id === formData.patient);
      setTimeout(() => {
        setSelectedPatient(patient || null);
        if (patient) {
          setPatientSearch(`${patient.firstName} ${patient.lastName}`);
        }
      }, 0);
    }
  }, [formData.patient, patients]);

  useEffect(() => {
    if (serviceSearch.length >= 2) {
      const filtered = services.filter((service) => {
        const searchLower = serviceSearch.toLowerCase();
        return (
          service.name.toLowerCase().includes(searchLower) ||
          (service.code && service.code.toLowerCase().includes(searchLower)) ||
          (service.category && service.category.toLowerCase().includes(searchLower))
        );
      });
      setTimeout(() => {
        setFilteredServices(filtered.slice(0, 10));
      }, 0);
    } else {
      setTimeout(() => {
        setFilteredServices([]);
      }, 0);
    }
  }, [serviceSearch, services]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.patient-search-container') && !target.closest('.service-search-container')) {
        setShowPatientSearch(false);
        setShowServiceSearch(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const calculateTotals = () => {
    const subtotal = formData.items.reduce((sum, item) => sum + item.total, 0);
    const discountTotal = formData.discounts.reduce((sum, disc) => sum + disc.amount, 0);
    const afterDiscount = subtotal - discountTotal;
    // Calculate tax as percentage of after-discount amount if tax rate is set, otherwise use manual tax
    const taxAmount = defaultTaxRate > 0 
      ? (afterDiscount * defaultTaxRate / 100)
      : (formData.tax || 0);
    const total = afterDiscount + taxAmount;

    return { subtotal, discountTotal, afterDiscount, tax: taxAmount, total };
  };
  
  // Update formData.tax when defaultTaxRate changes (for display purposes)
  useEffect(() => {
    if (defaultTaxRate > 0) {
      const subtotal = formData.items.reduce((sum, item) => sum + item.total, 0);
      const discountTotal = formData.discounts.reduce((sum, disc) => sum + disc.amount, 0);
      const afterDiscount = subtotal - discountTotal;
      const calculatedTax = afterDiscount * defaultTaxRate / 100;
      // Don't update if user manually set tax to 0
      if (formData.tax !== calculatedTax) {
        setTimeout(() => {
          setFormData(prev => ({ ...prev, tax: calculatedTax }));
        }, 0);
      }
    }
  }, [defaultTaxRate, formData.items, formData.discounts]);

  const { subtotal, discountTotal, afterDiscount, tax, total } = calculateTotals();

  const addItem = (service?: Service) => {
    const newItem: InvoiceItem = {
      serviceId: service?._id,
      code: service?.code || '',
      description: service?.name || '',
      category: service?.category || '',
      quantity: 1,
      unitPrice: service?.unitPrice || 0,
      total: service?.unitPrice || 0,
    };
    setFormData({
      ...formData,
      items: [...formData.items, newItem],
    });
    setServiceSearch('');
    setShowServiceSearch(false);
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const updated = [...formData.items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'quantity' || field === 'unitPrice') {
      updated[index].total = updated[index].quantity * updated[index].unitPrice;
    }
    setFormData({ ...formData, items: updated });
  };

  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const addDiscount = (type: Discount['type']) => {
    let amount = 0;
    let percentage = 0;

    if (type === 'pwd' || type === 'senior') {
      percentage = 20; // Default 20% for PWD/Senior
      amount = (subtotal * percentage) / 100;
    } else if (type === 'membership' && selectedPatient?.discountEligibility?.membership?.discountPercentage) {
      percentage = selectedPatient.discountEligibility.membership.discountPercentage;
      amount = (subtotal * percentage) / 100;
    }

    const newDiscount: Discount = {
      type,
      amount,
      percentage: percentage > 0 ? percentage : undefined,
      reason: type === 'pwd' ? 'PWD Discount' : type === 'senior' ? 'Senior Citizen Discount' : undefined,
    };
    setFormData({
      ...formData,
      discounts: [...formData.discounts, newDiscount],
    });
  };

  const updateDiscount = (index: number, field: keyof Discount, value: any) => {
    const updated = [...formData.discounts];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'percentage' && value > 0) {
      updated[index].amount = (subtotal * value) / 100;
    }
    setFormData({ ...formData, discounts: updated });
  };

  const removeDiscount = (index: number) => {
    setFormData({
      ...formData,
      discounts: formData.discounts.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.patient || !selectedPatient) {
      alert('Please select a valid patient');
      setShowPatientSearch(true);
      return;
    }
    if (formData.items.length === 0) {
      alert('Please add at least one invoice item');
      return;
    }

    const submitData = {
      patient: formData.patient,
      visit: formData.visit || undefined,
      items: formData.items.map((item) => ({
        serviceId: item.serviceId || undefined,
        code: item.code || undefined,
        description: item.description,
        category: item.category || undefined,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
      })),
      discounts: formData.discounts.length > 0 ? formData.discounts : undefined,
      tax: formData.tax || 0,
      insurance: formData.insurance.provider
        ? {
            provider: formData.insurance.provider,
            policyNumber: formData.insurance.policyNumber || undefined,
            memberId: formData.insurance.memberId || undefined,
            coverageType: formData.insurance.coverageType || undefined,
            coverageAmount: formData.insurance.coverageAmount || undefined,
            claimNumber: formData.insurance.claimNumber || undefined,
            status: formData.insurance.status || undefined,
            notes: formData.insurance.notes || undefined,
          }
        : undefined,
    };

    onSubmit(submitData);
  };

  const filteredPatients = patients.filter((patient) => {
    const searchLower = patientSearch.toLowerCase();
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    const patientCode = (patient.patientCode || '').toLowerCase();
    return fullName.includes(searchLower) || patientCode.includes(searchLower);
  });

  const selectPatient = (patient: Patient) => {
    setFormData({ ...formData, patient: patient._id });
    setSelectedPatient(patient);
    setPatientSearch(`${patient.firstName} ${patient.lastName}`);
    setShowPatientSearch(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="max-h-[80vh] overflow-y-auto">
        <div className="flex flex-col gap-6 p-4 sm:p-6">
          {/* Patient Selection */}
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <label className="block text-sm font-bold text-gray-900">
                Patient <span className="text-red-600">*</span>
              </label>
            </div>
            <div className="relative patient-search-container">
              <input
                type="text"
                required
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value);
                  setShowPatientSearch(true);
                  if (!e.target.value) {
                    setFormData({ ...formData, patient: '' });
                    setSelectedPatient(null);
                  }
                }}
                onFocus={() => setShowPatientSearch(true)}
                placeholder="Type to search patients..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm"
              />
              {showPatientSearch && filteredPatients.length > 0 && (
                <div
                  className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto"
                >
                  {filteredPatients.map((patient) => (
                    <button
                      key={patient._id}
                      type="button"
                      onClick={() => selectPatient(patient)}
                      className="w-full text-left px-3 py-2 hover:bg-emerald-50 rounded transition-colors"
                    >
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-sm font-semibold text-gray-900">{patient.firstName} {patient.lastName}</span>
                        {patient.patientCode && (
                          <span className="text-xs text-gray-600">{patient.patientCode}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Visit Selection (Optional) */}
            {formData.patient && visits.length > 0 && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-gray-700 mb-2">Visit (Optional)</label>
                <select
                  value={formData.visit}
                  onChange={(e) => setFormData({ ...formData, visit: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                >
                  <option value="">Select a visit...</option>
                  {visits.map((visit) => (
                    <option key={visit._id} value={visit._id}>
                      {visit.visitCode} - {new Date(visit.date).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Invoice Items */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                Invoice Items <span className="text-red-600">*</span>
              </h3>
            </div>
            <div className="flex justify-between items-center mb-4">
              <div className="relative service-search-container flex-1 max-w-xs">
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={(e) => {
                    setServiceSearch(e.target.value);
                    setShowServiceSearch(true);
                  }}
                  onFocus={() => setShowServiceSearch(true)}
                  placeholder="Search services..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
                {showServiceSearch && filteredServices.length > 0 && (
                  <div
                    className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto"
                  >
                    {filteredServices.map((service) => (
                      <button
                        key={service._id}
                        type="button"
                        onClick={() => addItem(service)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 rounded transition-colors"
                      >
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-sm font-semibold text-gray-900">{service.name}</span>
                          <span className="text-xs text-gray-600">
                            {service.code && `${service.code} • `}{formatCurrency(service.unitPrice)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {formData.items.length === 0 ? (
              <div className="p-6 text-center border-2 border-dashed border-blue-200 rounded-lg bg-white/50">
                <span className="text-sm text-gray-600 font-medium">No items added. Search and select services above.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {formData.items.map((item, index) => (
                  <div key={index} className="bg-gradient-to-r from-white to-blue-50/50 border border-blue-200 rounded-lg p-4 hover:shadow-md transition-all">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-5">
                        <div className="text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Description</div>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(index, 'description', e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Qty</div>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Unit Price</div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Total</div>
                        <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                          <span className="text-sm font-bold text-gray-900">
                            {formatCurrency(item.total)}
                          </span>
                        </div>
                      </div>
                      <div className="md:col-span-1">
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="w-full px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors font-semibold text-sm"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discounts */}
          <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Discounts</h3>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedPatient?.discountEligibility?.pwd?.eligible && (
                <button
                  type="button"
                  onClick={() => addDiscount('pwd')}
                  className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors font-semibold border border-amber-200"
                >
                  PWD
                </button>
              )}
              {selectedPatient?.discountEligibility?.senior?.eligible && (
                <button
                  type="button"
                  onClick={() => addDiscount('senior')}
                  className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors font-semibold border border-amber-200"
                >
                  Senior
                </button>
              )}
              {selectedPatient?.discountEligibility?.membership?.eligible && (
                <button
                  type="button"
                  onClick={() => addDiscount('membership')}
                  className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors font-semibold border border-amber-200"
                >
                  Membership
                </button>
              )}
              <button
                type="button"
                onClick={() => addDiscount('promotional')}
                className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors font-semibold border border-amber-200"
              >
                Promo
              </button>
              <button
                type="button"
                onClick={() => addDiscount('other')}
                className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors font-semibold border border-amber-200"
              >
                Other
              </button>
            </div>

            {formData.discounts.length > 0 && (
              <div className="flex flex-col gap-3">
                {formData.discounts.map((discount, index) => (
                  <div key={index} className="bg-white border border-amber-200 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-2">
                        <div className="text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Type</div>
                        <select
                          value={discount.type}
                          onChange={(e) => updateDiscount(index, 'type', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                        >
                          <option value="pwd">PWD</option>
                          <option value="senior">Senior</option>
                          <option value="membership">Membership</option>
                          <option value="promotional">Promotional</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">%</div>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={discount.percentage || ''}
                          onChange={(e) => updateDiscount(index, 'percentage', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all text-sm"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <div className="text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Amount</div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={discount.amount}
                          onChange={(e) => updateDiscount(index, 'amount', parseFloat(e.target.value) || 0)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all text-sm"
                        />
                      </div>
                      <div className="md:col-span-4">
                        <div className="text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Reason</div>
                        <input
                          type="text"
                          value={discount.reason || ''}
                          onChange={(e) => updateDiscount(index, 'reason', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all text-sm"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <button
                          type="button"
                          onClick={() => removeDiscount(index)}
                          className="w-full px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors font-semibold text-sm"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tax & Insurance */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gray-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-5m-6 5v-5m6 5h.01M9 17h.01M9 12h.01M12 12h.01M15 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Tax & Insurance</h3>
            </div>
            <div className="flex flex-col gap-4">
              {/* Tax */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Tax {defaultTaxRate > 0 ? `(${defaultTaxRate}% applied automatically)` : '(Manual)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={defaultTaxRate > 0 ? tax : (formData.tax || 0)}
                  onChange={(e) => setFormData({ ...formData, tax: parseFloat(e.target.value) || 0 })}
                  disabled={defaultTaxRate > 0}
                  placeholder={defaultTaxRate > 0 ? 'Calculated automatically' : 'Enter tax amount'}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all text-sm disabled:bg-gray-100"
                />
              </div>
              {/* Insurance/HMO (Optional) */}
              <div className="pt-4 border-t border-gray-200">
                <h4 className="text-sm font-bold text-gray-900 mb-3">Insurance/HMO (Optional)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">Provider</label>
                    <input
                      type="text"
                      value={formData.insurance.provider}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          insurance: { ...formData.insurance, provider: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">Policy Number</label>
                    <input
                      type="text"
                      value={formData.insurance.policyNumber}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          insurance: { ...formData.insurance, policyNumber: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">Member ID</label>
                    <input
                      type="text"
                      value={formData.insurance.memberId}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          insurance: { ...formData.insurance, memberId: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">Coverage Type</label>
                    <select
                      value={formData.insurance.coverageType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          insurance: { ...formData.insurance, coverageType: e.target.value as any },
                        })
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                    >
                      <option value="">Select...</option>
                      <option value="full">Full</option>
                      <option value="partial">Partial</option>
                      <option value="co-pay">Co-pay</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Totals Summary */}
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-5m-6 5v-5m6 5h.01M9 17h.01M9 12h.01M12 12h.01M15 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Summary</h3>
            </div>
            <div className="bg-white rounded-lg p-4 space-y-3 border border-emerald-200">
              <div className="flex justify-between">
                <span className="text-sm font-semibold text-gray-700">Subtotal:</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(subtotal)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm font-semibold text-red-600">Discounts:</span>
                  <span className="text-sm font-bold text-red-600">-{formatCurrency(discountTotal)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm font-semibold text-gray-700">Tax:</span>
                  <span className="text-sm font-bold text-gray-900">{formatCurrency(tax)}</span>
                </div>
              )}
              <div className="border-t border-gray-300 pt-3">
                <div className="flex justify-between">
                  <span className="text-lg font-bold text-gray-900">Total:</span>
                  <span className="text-lg font-bold text-emerald-600">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <hr className="border-gray-200" />
          <div className="flex justify-end gap-3 pt-2">
            {onCancel && (
              <button type="button" onClick={onCancel} className="px-4 py-2.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold border border-gray-200">
                Cancel
              </button>
            )}
            <button type="submit" className="px-4 py-2.5 text-sm bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all font-semibold shadow-md">
              Create Invoice
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
