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
  const currency = useSetting('billingSettings.currency', 'USD');
  const defaultTaxRate = useSetting('billingSettings.taxRate', 0);
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
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
      setSelectedPatient(patient || null);
      if (patient) {
        setPatientSearch(`${patient.firstName} ${patient.lastName}`);
      }
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
      setFilteredServices(filtered.slice(0, 10));
    } else {
      setFilteredServices([]);
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
        setFormData(prev => ({ ...prev, tax: calculatedTax }));
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
        <div className="flex flex-col gap-3 p-4">
          {/* Patient Selection */}
          <div>
            <div className="text-sm font-medium mb-2">
              Patient <span className="text-red-500">*</span>
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
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              {showPatientSearch && filteredPatients.length > 0 && (
                <div
                  className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
                >
                  {filteredPatients.map((patient) => (
                    <button
                      key={patient._id}
                      type="button"
                      onClick={() => selectPatient(patient)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100"
                    >
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-sm font-medium">{patient.firstName} {patient.lastName}</span>
                        {patient.patientCode && (
                          <span className="text-xs text-gray-500">{patient.patientCode}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Visit Selection (Optional) */}
          {formData.patient && visits.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">Visit (Optional)</div>
              <select
                value={formData.visit}
                onChange={(e) => setFormData({ ...formData, visit: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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

          {/* Invoice Items */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm font-medium">
                Invoice Items <span className="text-red-500">*</span>
              </div>
              <div className="relative service-search-container" style={{ width: '200px' }}>
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={(e) => {
                    setServiceSearch(e.target.value);
                    setShowServiceSearch(true);
                  }}
                  onFocus={() => setShowServiceSearch(true)}
                  placeholder="Search services..."
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                {showServiceSearch && filteredServices.length > 0 && (
                  <div
                    className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
                  >
                    {filteredServices.map((service) => (
                      <button
                        key={service._id}
                        type="button"
                        onClick={() => addItem(service)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100"
                      >
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-sm font-medium">{service.name}</span>
                          <span className="text-xs text-gray-500">
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
              <div className="p-2 text-center border border-gray-300 rounded-md bg-gray-50">
                <span className="text-xs text-gray-500">No items added. Search and select services above.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {formData.items.map((item, index) => (
                  <div key={index} className="p-3 border border-gray-200 rounded-md bg-gray-50">
                    <div className="flex gap-2 items-end flex-wrap">
                      <div className="flex-grow" style={{ minWidth: '200px' }}>
                        <div className="text-xs font-medium text-gray-500 mb-1">Description</div>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(index, 'description', e.target.value)}
                          required
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div style={{ width: '80px' }}>
                        <div className="text-xs font-medium text-gray-500 mb-1">Qty</div>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                          required
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div style={{ width: '100px' }}>
                        <div className="text-xs font-medium text-gray-500 mb-1">Unit Price</div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                          required
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div style={{ width: '100px' }}>
                        <div className="text-xs font-medium text-gray-500 mb-1">Total</div>
                        <div className="p-1">
                          <span className="text-sm font-medium">
                            {formatCurrency(item.total)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="px-2 py-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discounts */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm font-medium">Discounts</div>
              <div className="flex gap-1">
                {selectedPatient?.discountEligibility?.pwd?.eligible && (
                  <button
                    type="button"
                    onClick={() => addDiscount('pwd')}
                    className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                  >
                    PWD
                  </button>
                )}
                {selectedPatient?.discountEligibility?.senior?.eligible && (
                  <button
                    type="button"
                    onClick={() => addDiscount('senior')}
                    className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                  >
                    Senior
                  </button>
                )}
                {selectedPatient?.discountEligibility?.membership?.eligible && (
                  <button
                    type="button"
                    onClick={() => addDiscount('membership')}
                    className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                  >
                    Membership
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => addDiscount('promotional')}
                  className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                >
                  Promo
                </button>
                <button
                  type="button"
                  onClick={() => addDiscount('other')}
                  className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                >
                  Other
                </button>
              </div>
            </div>

            {formData.discounts.length > 0 && (
              <div className="flex flex-col gap-2">
                {formData.discounts.map((discount, index) => (
                  <div key={index} className="p-3 border border-gray-200 rounded-md bg-gray-50">
                    <div className="flex gap-2 items-end flex-wrap">
                      <div style={{ width: '120px' }}>
                        <div className="text-xs font-medium text-gray-500 mb-1">Type</div>
                        <select
                          value={discount.type}
                          onChange={(e) => updateDiscount(index, 'type', e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        >
                          <option value="pwd">PWD</option>
                          <option value="senior">Senior</option>
                          <option value="membership">Membership</option>
                          <option value="promotional">Promotional</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div style={{ width: '80px' }}>
                        <div className="text-xs font-medium text-gray-500 mb-1">%</div>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={discount.percentage || ''}
                          onChange={(e) => updateDiscount(index, 'percentage', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div style={{ width: '100px' }}>
                        <div className="text-xs font-medium text-gray-500 mb-1">Amount</div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={discount.amount}
                          onChange={(e) => updateDiscount(index, 'amount', parseFloat(e.target.value) || 0)}
                          required
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div className="flex-grow" style={{ minWidth: '150px' }}>
                        <div className="text-xs font-medium text-gray-500 mb-1">Reason</div>
                        <input
                          type="text"
                          value={discount.reason || ''}
                          onChange={(e) => updateDiscount(index, 'reason', e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDiscount(index)}
                        className="px-2 py-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tax */}
          <div>
            <div className="text-sm font-medium mb-2">
              Tax {defaultTaxRate > 0 ? `(${defaultTaxRate}% applied automatically)` : '(Manual)'}
            </div>
            <input
              type="number"
              min="0"
              step="0.01"
              value={defaultTaxRate > 0 ? tax : (formData.tax || 0)}
              onChange={(e) => setFormData({ ...formData, tax: parseFloat(e.target.value) || 0 })}
              disabled={defaultTaxRate > 0}
              placeholder={defaultTaxRate > 0 ? 'Calculated automatically' : 'Enter tax amount'}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100"
            />
          </div>

          {/* Insurance/HMO (Optional) */}
          <div>
            <hr className="my-4" />
            <div className="flex flex-col gap-3 pt-3">
              <div className="text-sm font-medium">Insurance/HMO (Optional)</div>
              <div className="flex gap-2 flex-wrap">
                <div className="flex-grow" style={{ minWidth: '200px' }}>
                  <div className="text-xs font-medium text-gray-500 mb-2">Provider</div>
                  <input
                    type="text"
                    value={formData.insurance.provider}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        insurance: { ...formData.insurance, provider: e.target.value },
                      })
                    }
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="flex-grow" style={{ minWidth: '200px' }}>
                  <div className="text-xs font-medium text-gray-500 mb-2">Policy Number</div>
                  <input
                    type="text"
                    value={formData.insurance.policyNumber}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        insurance: { ...formData.insurance, policyNumber: e.target.value },
                      })
                    }
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="flex-grow" style={{ minWidth: '200px' }}>
                  <div className="text-xs font-medium text-gray-500 mb-2">Member ID</div>
                  <input
                    type="text"
                    value={formData.insurance.memberId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        insurance: { ...formData.insurance, memberId: e.target.value },
                      })
                    }
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="flex-grow" style={{ minWidth: '200px' }}>
                  <div className="text-xs font-medium text-gray-500 mb-2">Coverage Type</div>
                  <select
                    value={formData.insurance.coverageType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        insurance: { ...formData.insurance, coverageType: e.target.value as any },
                      })
                    }
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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

          {/* Totals Summary */}
          <div>
            <hr className="my-4" />
            <div className="flex flex-col gap-1 pt-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Subtotal:</span>
                <span className="text-sm font-medium">{formatCurrency(subtotal)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-red-500">Discounts:</span>
                  <span className="text-sm font-medium text-red-500">-{formatCurrency(discountTotal)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Tax:</span>
                  <span className="text-sm font-medium">{formatCurrency(tax)}</span>
                </div>
              )}
              <hr className="my-2" />
              <div className="flex justify-between">
                <span className="text-lg font-bold">Total:</span>
                <span className="text-lg font-bold">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <hr className="my-4" />
          <div className="flex justify-end gap-2">
            {onCancel && (
              <button type="button" onClick={onCancel} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                Cancel
              </button>
            )}
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
              Create Invoice
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
