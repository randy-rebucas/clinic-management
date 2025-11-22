'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Flex, Box, Text, TextField, Select, Button, Separator, Heading, Badge, IconButton, Card } from '@radix-ui/themes';
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
      <Box style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <Flex direction="column" gap="3" p="4">
          {/* Patient Selection */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">
              Patient <Text color="red">*</Text>
            </Text>
            <Box position="relative" className="patient-search-container">
              <TextField.Root size="2">
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
                  style={{ all: 'unset', flex: 1 }}
                />
              </TextField.Root>
              {showPatientSearch && filteredPatients.length > 0 && (
                <Box
                  position="absolute"
                  style={{
                    zIndex: 10,
                    marginTop: '4px',
                    width: '100%',
                    backgroundColor: 'white',
                    border: '1px solid var(--gray-6)',
                    borderRadius: '6px',
                    boxShadow: 'var(--shadow-4)',
                    maxHeight: '192px',
                    overflowY: 'auto',
                  }}
                >
                  {filteredPatients.map((patient) => (
                    <Button
                      key={patient._id}
                      type="button"
                      variant="ghost"
                      onClick={() => selectPatient(patient)}
                      style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
                    >
                      <Flex direction="column" align="start" gap="1">
                        <Text size="2" weight="medium">{patient.firstName} {patient.lastName}</Text>
                        {patient.patientCode && (
                          <Text size="1" color="gray">{patient.patientCode}</Text>
                        )}
                      </Flex>
                    </Button>
                  ))}
                </Box>
              )}
            </Box>
          </Box>

          {/* Visit Selection (Optional) */}
          {formData.patient && visits.length > 0 && (
            <Box>
              <Text size="2" weight="medium" mb="2" as="div">Visit (Optional)</Text>
              <Select.Root
                size="2"
                value={formData.visit}
                onValueChange={(value) => setFormData({ ...formData, visit: value })}
              >
                <Select.Trigger placeholder="Select a visit..." />
                <Select.Content>
                  {visits.map((visit) => (
                    <Select.Item key={visit._id} value={visit._id}>
                      {visit.visitCode} - {new Date(visit.date).toLocaleDateString()}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>
          )}

          {/* Invoice Items */}
          <Box>
            <Flex justify="between" align="center" mb="2">
              <Text size="2" weight="medium" as="div">
                Invoice Items <Text color="red">*</Text>
              </Text>
              <Box position="relative" className="service-search-container" style={{ width: '200px' }}>
                <TextField.Root size="1">
                  <input
                    type="text"
                    value={serviceSearch}
                    onChange={(e) => {
                      setServiceSearch(e.target.value);
                      setShowServiceSearch(true);
                    }}
                    onFocus={() => setShowServiceSearch(true)}
                    placeholder="Search services..."
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
                {showServiceSearch && filteredServices.length > 0 && (
                  <Box
                    position="absolute"
                    style={{
                      zIndex: 10,
                      marginTop: '4px',
                      width: '100%',
                      backgroundColor: 'white',
                      border: '1px solid var(--gray-6)',
                      borderRadius: '6px',
                      boxShadow: 'var(--shadow-4)',
                      maxHeight: '192px',
                      overflowY: 'auto',
                    }}
                  >
                    {filteredServices.map((service) => (
                      <Button
                        key={service._id}
                        type="button"
                        variant="ghost"
                        onClick={() => addItem(service)}
                        style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
                      >
                        <Flex direction="column" align="start" gap="1">
                          <Text size="2" weight="medium">{service.name}</Text>
                          <Text size="1" color="gray">
                            {service.code && `${service.code} • `}{formatCurrency(service.unitPrice)}
                          </Text>
                        </Flex>
                      </Button>
                    ))}
                  </Box>
                )}
              </Box>
            </Flex>

            {formData.items.length === 0 ? (
              <Box p="2" style={{ textAlign: 'center', border: '1px solid var(--gray-6)', borderRadius: '6px', backgroundColor: 'var(--gray-2)' }}>
                <Text size="1" color="gray">No items added. Search and select services above.</Text>
              </Box>
            ) : (
              <Flex direction="column" gap="2">
                {formData.items.map((item, index) => (
                  <Card key={index} size="1" variant="surface">
                    <Flex gap="2" align="end" wrap="wrap">
                      <Box flexGrow="1" style={{ minWidth: '200px' }}>
                        <Text size="1" weight="medium" color="gray" mb="1" as="div">Description</Text>
                        <TextField.Root size="1">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(index, 'description', e.target.value)}
                            required
                            style={{ all: 'unset', flex: 1 }}
                          />
                        </TextField.Root>
                      </Box>
                      <Box style={{ width: '80px' }}>
                        <Text size="1" weight="medium" color="gray" mb="1" as="div">Qty</Text>
                        <TextField.Root size="1" type="number">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                            required
                            style={{ all: 'unset', flex: 1 }}
                          />
                        </TextField.Root>
                      </Box>
                      <Box style={{ width: '100px' }}>
                        <Text size="1" weight="medium" color="gray" mb="1" as="div">Unit Price</Text>
                        <TextField.Root size="1" type="number">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                            required
                            style={{ all: 'unset', flex: 1 }}
                          />
                        </TextField.Root>
                      </Box>
                      <Box style={{ width: '100px' }}>
                        <Text size="1" weight="medium" color="gray" mb="1" as="div">Total</Text>
                        <Box p="1">
                          <Text size="2" weight="medium">
                            {formatCurrency(item.total)}
                          </Text>
                        </Box>
                      </Box>
                      <IconButton
                        type="button"
                        variant="ghost"
                        color="red"
                        size="1"
                        onClick={() => removeItem(index)}
                      >
                        ×
                      </IconButton>
                    </Flex>
                  </Card>
                ))}
              </Flex>
            )}
          </Box>

          {/* Discounts */}
          <Box>
            <Flex justify="between" align="center" mb="2">
              <Text size="2" weight="medium" as="div">Discounts</Text>
              <Flex gap="1">
                {selectedPatient?.discountEligibility?.pwd?.eligible && (
                  <Button
                    type="button"
                    variant="soft"
                    color="blue"
                    size="1"
                    onClick={() => addDiscount('pwd')}
                  >
                    PWD
                  </Button>
                )}
                {selectedPatient?.discountEligibility?.senior?.eligible && (
                  <Button
                    type="button"
                    variant="soft"
                    color="blue"
                    size="1"
                    onClick={() => addDiscount('senior')}
                  >
                    Senior
                  </Button>
                )}
                {selectedPatient?.discountEligibility?.membership?.eligible && (
                  <Button
                    type="button"
                    variant="soft"
                    color="blue"
                    size="1"
                    onClick={() => addDiscount('membership')}
                  >
                    Membership
                  </Button>
                )}
                <Button
                  type="button"
                  variant="soft"
                  size="1"
                  onClick={() => addDiscount('promotional')}
                >
                  Promo
                </Button>
                <Button
                  type="button"
                  variant="soft"
                  size="1"
                  onClick={() => addDiscount('other')}
                >
                  Other
                </Button>
              </Flex>
            </Flex>

            {formData.discounts.length > 0 && (
              <Flex direction="column" gap="2">
                {formData.discounts.map((discount, index) => (
                  <Card key={index} size="1" variant="surface">
                    <Flex gap="2" align="end" wrap="wrap">
                      <Box style={{ width: '120px' }}>
                        <Text size="1" weight="medium" color="gray" mb="1" as="div">Type</Text>
                        <Select.Root
                          size="1"
                          value={discount.type}
                          onValueChange={(value) => updateDiscount(index, 'type', value)}
                        >
                          <Select.Trigger />
                          <Select.Content>
                            <Select.Item value="pwd">PWD</Select.Item>
                            <Select.Item value="senior">Senior</Select.Item>
                            <Select.Item value="membership">Membership</Select.Item>
                            <Select.Item value="promotional">Promotional</Select.Item>
                            <Select.Item value="other">Other</Select.Item>
                          </Select.Content>
                        </Select.Root>
                      </Box>
                      <Box style={{ width: '80px' }}>
                        <Text size="1" weight="medium" color="gray" mb="1" as="div">%</Text>
                        <TextField.Root size="1" type="number">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={discount.percentage || ''}
                            onChange={(e) => updateDiscount(index, 'percentage', parseFloat(e.target.value) || 0)}
                            style={{ all: 'unset', flex: 1 }}
                          />
                        </TextField.Root>
                      </Box>
                      <Box style={{ width: '100px' }}>
                        <Text size="1" weight="medium" color="gray" mb="1" as="div">Amount</Text>
                        <TextField.Root size="1" type="number">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={discount.amount}
                            onChange={(e) => updateDiscount(index, 'amount', parseFloat(e.target.value) || 0)}
                            required
                            style={{ all: 'unset', flex: 1 }}
                          />
                        </TextField.Root>
                      </Box>
                      <Box flexGrow="1" style={{ minWidth: '150px' }}>
                        <Text size="1" weight="medium" color="gray" mb="1" as="div">Reason</Text>
                        <TextField.Root size="1">
                          <input
                            type="text"
                            value={discount.reason || ''}
                            onChange={(e) => updateDiscount(index, 'reason', e.target.value)}
                            style={{ all: 'unset', flex: 1 }}
                          />
                        </TextField.Root>
                      </Box>
                      <IconButton
                        type="button"
                        variant="ghost"
                        color="red"
                        size="1"
                        onClick={() => removeDiscount(index)}
                      >
                        ×
                      </IconButton>
                    </Flex>
                  </Card>
                ))}
              </Flex>
            )}
          </Box>

          {/* Tax */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">
              Tax {defaultTaxRate > 0 ? `(${defaultTaxRate}% applied automatically)` : '(Manual)'}
            </Text>
            <TextField.Root size="2" type="number" disabled={defaultTaxRate > 0}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={defaultTaxRate > 0 ? '' : (formData.tax || 0)}
                onChange={(e) => setFormData({ ...formData, tax: parseFloat(e.target.value) || 0 })}
                disabled={defaultTaxRate > 0}
                placeholder={defaultTaxRate > 0 ? 'Calculated automatically' : 'Enter tax amount'}
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>

          {/* Insurance/HMO (Optional) */}
          <Box>
            <Separator />
            <Flex direction="column" gap="3" pt="3">
              <Text size="2" weight="medium" as="div">Insurance/HMO (Optional)</Text>
              <Flex gap="2" wrap="wrap">
                <Box flexGrow="1" style={{ minWidth: '200px' }}>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Provider</Text>
                  <TextField.Root size="1">
                    <input
                      type="text"
                      value={formData.insurance.provider}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          insurance: { ...formData.insurance, provider: e.target.value },
                        })
                      }
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1" style={{ minWidth: '200px' }}>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Policy Number</Text>
                  <TextField.Root size="1">
                    <input
                      type="text"
                      value={formData.insurance.policyNumber}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          insurance: { ...formData.insurance, policyNumber: e.target.value },
                        })
                      }
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1" style={{ minWidth: '200px' }}>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Member ID</Text>
                  <TextField.Root size="1">
                    <input
                      type="text"
                      value={formData.insurance.memberId}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          insurance: { ...formData.insurance, memberId: e.target.value },
                        })
                      }
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1" style={{ minWidth: '200px' }}>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Coverage Type</Text>
                  <Select.Root
                    size="1"
                    value={formData.insurance.coverageType}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        insurance: { ...formData.insurance, coverageType: value as any },
                      })
                    }
                  >
                    <Select.Trigger placeholder="Select..." />
                    <Select.Content>
                      <Select.Item value="full">Full</Select.Item>
                      <Select.Item value="partial">Partial</Select.Item>
                      <Select.Item value="co-pay">Co-pay</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </Box>
              </Flex>
            </Flex>
          </Box>

          {/* Totals Summary */}
          <Box>
            <Separator />
            <Flex direction="column" gap="1" pt="3">
              <Flex justify="between">
                <Text size="2" color="gray">Subtotal:</Text>
                <Text size="2" weight="medium">{formatCurrency(subtotal)}</Text>
              </Flex>
              {discountTotal > 0 && (
                <Flex justify="between">
                  <Text size="2" color="red">Discounts:</Text>
                  <Text size="2" weight="medium" color="red">-{formatCurrency(discountTotal)}</Text>
                </Flex>
              )}
              {tax > 0 && (
                <Flex justify="between">
                  <Text size="2" color="gray">Tax:</Text>
                  <Text size="2" weight="medium">{formatCurrency(tax)}</Text>
                </Flex>
              )}
              <Separator />
              <Flex justify="between">
                <Text size="4" weight="bold">Total:</Text>
                <Text size="4" weight="bold">{formatCurrency(total)}</Text>
              </Flex>
            </Flex>
          </Box>

          {/* Form Actions */}
          <Separator />
          <Flex justify="end" gap="2">
            {onCancel && (
              <Button type="button" variant="soft" onClick={onCancel} size="2">
                Cancel
              </Button>
            )}
            <Button type="submit" size="2">
              Create Invoice
            </Button>
          </Flex>
        </Flex>
      </Box>
    </form>
  );
}

