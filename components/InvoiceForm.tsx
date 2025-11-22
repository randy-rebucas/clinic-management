'use client';

import { useState, useEffect, FormEvent } from 'react';
// Radix UI components not used - using native HTML form elements
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
    <form onSubmit={handleSubmit} className="space-y-2 max-h-[80vh] overflow-y-auto">
      {/* Patient Selection */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-0.5">Patient *</label>
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
            className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          {showPatientSearch && filteredPatients.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
              {filteredPatients.map((patient) => (
                <button
                  key={patient._id}
                  type="button"
                  onClick={() => selectPatient(patient)}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-xs transition-colors"
                >
                  <div className="font-medium">{patient.firstName} {patient.lastName}</div>
                  {patient.patientCode && (
                    <div className="text-xs text-gray-500">{patient.patientCode}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Visit Selection (Optional) */}
      {formData.patient && visits.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-0.5">Visit (Optional)</label>
          <select
            value={formData.visit}
            onChange={(e) => setFormData({ ...formData, visit: e.target.value })}
            className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
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
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-gray-700">Invoice Items *</label>
          <div className="relative service-search-container">
            <input
              type="text"
              value={serviceSearch}
              onChange={(e) => {
                setServiceSearch(e.target.value);
                setShowServiceSearch(true);
              }}
              onFocus={() => setShowServiceSearch(true)}
              placeholder="Search services..."
              className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            {showServiceSearch && filteredServices.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {filteredServices.map((service) => (
                  <button
                    key={service._id}
                    type="button"
                    onClick={() => addItem(service)}
                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-xs transition-colors"
                  >
                    <div className="font-medium">{service.name}</div>
                    <div className="text-xs text-gray-500">
                      {service.code && `${service.code} • `}{formatCurrency(service.unitPrice)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {formData.items.length === 0 ? (
          <div className="text-center py-2 text-xs text-gray-500 border border-gray-200 rounded-md bg-gray-50">
            No items added. Search and select services above.
          </div>
        ) : (
          <div className="space-y-1.5">
            {formData.items.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-md p-1.5 bg-gray-50">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <label className="block text-xs text-gray-600 mb-0.5">Description</label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      className="block w-full rounded-md border border-gray-200 px-2 py-1 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-600 mb-0.5">Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                      className="block w-full rounded-md border border-gray-200 px-2 py-1 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-600 mb-0.5">Unit Price</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="block w-full rounded-md border border-gray-200 px-2 py-1 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-600 mb-0.5">Total</label>
                    <div className="px-1.5 py-0.5 text-xs font-medium text-gray-900">
                      {formatCurrency(item.total)}
                    </div>
                  </div>
                  <div className="col-span-1">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-red-600 hover:text-red-800 text-xs"
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
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-gray-700">Discounts</label>
          <div className="flex gap-1">
            {selectedPatient?.discountEligibility?.pwd?.eligible && (
              <button
                type="button"
                onClick={() => addDiscount('pwd')}
                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                PWD
              </button>
            )}
            {selectedPatient?.discountEligibility?.senior?.eligible && (
              <button
                type="button"
                onClick={() => addDiscount('senior')}
                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                Senior
              </button>
            )}
            {selectedPatient?.discountEligibility?.membership?.eligible && (
              <button
                type="button"
                onClick={() => addDiscount('membership')}
                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                Membership
              </button>
            )}
            <button
              type="button"
              onClick={() => addDiscount('promotional')}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Promo
            </button>
            <button
              type="button"
              onClick={() => addDiscount('other')}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Other
            </button>
          </div>
        </div>

        {formData.discounts.length > 0 && (
          <div className="space-y-1.5">
            {formData.discounts.map((discount, index) => (
              <div key={index} className="border border-gray-200 rounded-md p-1.5 bg-gray-50">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <label className="block text-xs text-gray-600 mb-0.5">Type</label>
                    <select
                      value={discount.type}
                      onChange={(e) => updateDiscount(index, 'type', e.target.value)}
                      className="block w-full rounded-md border border-gray-200 px-2 py-1 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="pwd">PWD</option>
                      <option value="senior">Senior</option>
                      <option value="membership">Membership</option>
                      <option value="promotional">Promotional</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-600 mb-0.5">%</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discount.percentage || ''}
                      onChange={(e) => updateDiscount(index, 'percentage', parseFloat(e.target.value) || 0)}
                      className="block w-full rounded-md border border-gray-200 px-2 py-1 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs text-gray-600 mb-0.5">Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discount.amount}
                      onChange={(e) => updateDiscount(index, 'amount', parseFloat(e.target.value) || 0)}
                      className="block w-full rounded-md border border-gray-200 px-2 py-1 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs text-gray-600 mb-0.5">Reason</label>
                    <input
                      type="text"
                      value={discount.reason || ''}
                      onChange={(e) => updateDiscount(index, 'reason', e.target.value)}
                      className="block w-full rounded-md border border-gray-200 px-2 py-1 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="col-span-1">
                    <button
                      type="button"
                      onClick={() => removeDiscount(index)}
                      className="text-red-600 hover:text-red-800 text-xs"
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

      {/* Tax */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-0.5">
          Tax {defaultTaxRate > 0 ? `(${defaultTaxRate}% applied automatically)` : '(Manual)'}
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={defaultTaxRate > 0 ? '' : (formData.tax || 0)}
          onChange={(e) => setFormData({ ...formData, tax: parseFloat(e.target.value) || 0 })}
          disabled={defaultTaxRate > 0}
          placeholder={defaultTaxRate > 0 ? 'Calculated automatically' : 'Enter tax amount'}
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Insurance/HMO (Optional) */}
      <div className="border-t border-gray-100 pt-2">
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Insurance/HMO (Optional)</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-600 mb-0.5">Provider</label>
            <input
              type="text"
              value={formData.insurance.provider}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  insurance: { ...formData.insurance, provider: e.target.value },
                })
              }
              className="block w-full rounded-md border border-gray-200 px-2 py-1 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-0.5">Policy Number</label>
            <input
              type="text"
              value={formData.insurance.policyNumber}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  insurance: { ...formData.insurance, policyNumber: e.target.value },
                })
              }
              className="block w-full rounded-md border border-gray-200 px-2 py-1 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-0.5">Member ID</label>
            <input
              type="text"
              value={formData.insurance.memberId}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  insurance: { ...formData.insurance, memberId: e.target.value },
                })
              }
              className="block w-full rounded-md border border-gray-200 px-2 py-1 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-0.5">Coverage Type</label>
            <select
              value={formData.insurance.coverageType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  insurance: { ...formData.insurance, coverageType: e.target.value as any },
                })
              }
              className="block w-full rounded-md border border-gray-200 px-2 py-1 text-xs bg-white transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Select...</option>
              <option value="full">Full</option>
              <option value="partial">Partial</option>
              <option value="co-pay">Co-pay</option>
            </select>
          </div>
        </div>
      </div>

      {/* Totals Summary */}
      <div className="border-t border-gray-100 pt-2">
        <div className="space-y-0.5 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal:</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
          {discountTotal > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Discounts:</span>
              <span>-{formatCurrency(discountTotal)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Tax:</span>
              <span className="font-medium">{formatCurrency(tax)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold border-t border-gray-100 pt-1">
            <span>Total:</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Create Invoice
        </button>
      </div>
    </form>
  );
}

