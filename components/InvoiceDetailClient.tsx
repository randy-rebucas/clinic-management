'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSetting } from './SettingsContext';

interface InvoiceItem {
  serviceId?: {
    _id: string;
    name: string;
    code?: string;
    category?: string;
    unitPrice?: number;
  } | string;
  code?: string;
  description?: string;
  category?: string;
  quantity?: number;
  unitPrice: number;
  total: number;
}

interface Discount {
  type: 'pwd' | 'senior' | 'membership' | 'promotional' | 'other';
  reason?: string;
  percentage?: number;
  amount: number;
  appliedBy?: {
    _id: string;
    name: string;
  };
}

interface Payment {
  method: 'cash' | 'gcash' | 'bank_transfer' | 'card' | 'check' | 'insurance' | 'hmo' | 'other';
  amount: number;
  date: string;
  receiptNo?: string;
  referenceNo?: string;
  processedBy?: {
    _id: string;
    name: string;
  };
  notes?: string;
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    };
  };
  visit?: {
    _id: string;
    visitCode: string;
    date: string;
    visitType?: string;
  };
  items: InvoiceItem[];
  subtotal?: number;
  discounts: Discount[];
  tax?: number;
  total?: number;
  payments: Payment[];
  insurance?: {
    provider: string;
    policyNumber?: string;
    memberId?: string;
    coverageType?: 'full' | 'partial' | 'co-pay';
    coverageAmount?: number;
    claimNumber?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'paid';
    notes?: string;
  };
  outstandingBalance?: number;
  totalPaid?: number;
  status: 'unpaid' | 'partial' | 'paid' | 'refunded';
  createdAt: string;
  createdBy?: {
    _id: string;
    name: string;
    email?: string;
  };
  updatedAt: string;
}

export default function InvoiceDetailClient({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const currency = useSetting('billingSettings.currency', 'PHP');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPaymentMethod = (method: string) => {
    const methods: Record<string, string> = {
      cash: 'Cash',
      gcash: 'GCash',
      bank_transfer: 'Bank Transfer',
      card: 'Credit/Debit Card',
      check: 'Check',
      insurance: 'Insurance',
      hmo: 'HMO',
      other: 'Other',
    };
    return methods[method] || method;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'unpaid':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'refunded':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  useEffect(() => {
    fetchInvoice();
  }, [invoiceId]);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/invoices/${invoiceId}`);

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
        setError(`API error: ${res.status} ${res.statusText}`);
        return;
      }

      if (!res.ok) {
        const errorMsg = data?.error || `Failed to load invoice: ${res.status} ${res.statusText}`;
        setError(errorMsg);
        return;
      }

      if (data.success && data.data) {
        setInvoice(data.data);
      } else {
        setError(data.error || 'Failed to load invoice');
      }
    } catch (error: any) {
      console.error('Failed to fetch invoice:', error);
      setError(error.message || 'Failed to load invoice. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintReceipt = () => {
    window.open(`/api/invoices/${invoiceId}/receipt`, '_blank');
  };

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3 min-h-[256px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-500">Loading invoice...</p>
          </div>
        </div>
      </section>
    );
  }

  if (error || !invoice) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="text-sm text-red-700 mt-1">{error || 'Invoice not found'}</p>
                <button
                  onClick={() => router.push('/invoices')}
                  className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
                >
                  ← Back to Invoices
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Link
              href="/invoices"
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-1">Invoice Details</h1>
              <p className="text-sm text-gray-600">Invoice #{invoice.invoiceNumber}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePrintReceipt}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Receipt
              </button>
            </div>
          </div>

          {/* Invoice Info Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="flex flex-col gap-4">
                  <div>
                    <h2 className="text-lg font-semibold mb-3">Invoice Information</h2>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Invoice Number:</span>
                        <span className="font-medium">{invoice.invoiceNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Status:</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(invoice.status)}`}>
                          {invoice.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Date Created:</span>
                        <span className="font-medium">{formatDate(invoice.createdAt)}</span>
                      </div>
                      {invoice.visit && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Visit:</span>
                          <Link href={`/visits/${invoice.visit._id}`} className="font-medium text-blue-600 hover:underline">
                            {invoice.visit.visitCode}
                          </Link>
                        </div>
                      )}
                      {invoice.createdBy && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Created By:</span>
                          <span className="font-medium">{invoice.createdBy.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold mb-3">Patient Information</h2>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Patient:</span>
                        <Link href={`/patients/${invoice.patient._id}`} className="font-medium text-blue-600 hover:underline">
                          {invoice.patient.firstName} {invoice.patient.lastName}
                        </Link>
                      </div>
                      {invoice.patient.patientCode && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Patient Code:</span>
                          <span className="font-medium">{invoice.patient.patientCode}</span>
                        </div>
                      )}
                      {invoice.patient.email && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Email:</span>
                          <span className="font-medium">{invoice.patient.email}</span>
                        </div>
                      )}
                      {invoice.patient.phone && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Phone:</span>
                          <span className="font-medium">{invoice.patient.phone}</span>
                        </div>
                      )}
                      {invoice.patient.address && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Address:</span>
                          <span className="font-medium text-right">
                            {[
                              invoice.patient.address.street,
                              invoice.patient.address.city,
                              invoice.patient.address.state,
                              invoice.patient.address.zipCode,
                            ].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column - Financial Summary */}
                <div>
                  <h2 className="text-lg font-semibold mb-3">Financial Summary</h2>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">{formatCurrency(invoice.subtotal || 0)}</span>
                    </div>
                    {invoice.discounts && invoice.discounts.length > 0 && (
                      <div className="space-y-1">
                        {invoice.discounts.map((discount, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-gray-600">
                              Discount ({discount.type === 'pwd' ? 'PWD' : discount.type === 'senior' ? 'Senior' : discount.type === 'membership' ? 'Membership' : discount.reason || 'Other'}):
                            </span>
                            <span className="font-medium text-red-600">-{formatCurrency(discount.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {invoice.tax && invoice.tax > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Tax:</span>
                        <span className="font-medium">{formatCurrency(invoice.tax)}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-300 pt-3">
                      <div className="flex justify-between">
                        <span className="font-semibold">Total:</span>
                        <span className="font-bold text-lg">{formatCurrency(invoice.total || 0)}</span>
                      </div>
                    </div>
                    {invoice.totalPaid !== undefined && invoice.totalPaid > 0 && (
                      <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                        <span className="text-gray-600">Total Paid:</span>
                        <span className="font-medium text-green-600">{formatCurrency(invoice.totalPaid)}</span>
                      </div>
                    )}
                    {invoice.outstandingBalance !== undefined && invoice.outstandingBalance > 0 && (
                      <div className="flex justify-between text-sm pt-2">
                        <span className="text-gray-600">Outstanding Balance:</span>
                        <span className="font-medium text-red-600">{formatCurrency(invoice.outstandingBalance)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Invoice Items</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Category</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Quantity</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Unit Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {invoice.items.map((item, idx) => {
                      const serviceName = typeof item.serviceId === 'object' && item.serviceId?.name 
                        ? item.serviceId.name 
                        : item.description || 'Service';
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{item.code || '—'}</td>
                          <td className="px-4 py-3 text-sm font-medium">{serviceName}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{item.category || '—'}</td>
                          <td className="px-4 py-3 text-sm text-right">{item.quantity || 1}</td>
                          <td className="px-4 py-3 text-sm text-right">{formatCurrency(item.unitPrice)}</td>
                          <td className="px-4 py-3 text-sm font-medium text-right">{formatCurrency(item.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Payments */}
          {invoice.payments && invoice.payments.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">Payments</h2>
                <div className="space-y-3">
                  {invoice.payments.map((payment, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="flex justify-between mb-2">
                            <span className="text-gray-600">Payment Method:</span>
                            <span className="font-medium">{formatPaymentMethod(payment.method)}</span>
                          </div>
                          <div className="flex justify-between mb-2">
                            <span className="text-gray-600">Amount:</span>
                            <span className="font-medium text-green-600">{formatCurrency(payment.amount)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Date:</span>
                            <span className="font-medium">{formatDateTime(payment.date)}</span>
                          </div>
                        </div>
                        <div>
                          {payment.receiptNo && (
                            <div className="flex justify-between mb-2">
                              <span className="text-gray-600">Receipt No:</span>
                              <span className="font-medium">{payment.receiptNo}</span>
                            </div>
                          )}
                          {payment.referenceNo && (
                            <div className="flex justify-between mb-2">
                              <span className="text-gray-600">Reference No:</span>
                              <span className="font-medium">{payment.referenceNo}</span>
                            </div>
                          )}
                          {payment.processedBy && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Processed By:</span>
                              <span className="font-medium">{payment.processedBy.name}</span>
                            </div>
                          )}
                          {payment.notes && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <span className="text-gray-600 text-xs">Notes: {payment.notes}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Insurance Information */}
          {invoice.insurance && invoice.insurance.provider && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">Insurance/HMO Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Provider:</span>
                      <span className="font-medium">{invoice.insurance.provider}</span>
                    </div>
                    {invoice.insurance.policyNumber && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Policy Number:</span>
                        <span className="font-medium">{invoice.insurance.policyNumber}</span>
                      </div>
                    )}
                    {invoice.insurance.memberId && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Member ID:</span>
                        <span className="font-medium">{invoice.insurance.memberId}</span>
                      </div>
                    )}
                    {invoice.insurance.coverageType && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Coverage Type:</span>
                        <span className="font-medium capitalize">{invoice.insurance.coverageType}</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {invoice.insurance.coverageAmount && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Coverage Amount:</span>
                        <span className="font-medium">{formatCurrency(invoice.insurance.coverageAmount)}</span>
                      </div>
                    )}
                    {invoice.insurance.claimNumber && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Claim Number:</span>
                        <span className="font-medium">{invoice.insurance.claimNumber}</span>
                      </div>
                    )}
                    {invoice.insurance.status && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Status:</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          invoice.insurance.status === 'approved' || invoice.insurance.status === 'paid'
                            ? 'bg-green-100 text-green-800'
                            : invoice.insurance.status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {invoice.insurance.status.toUpperCase()}
                        </span>
                      </div>
                    )}
                    {invoice.insurance.notes && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <span className="text-gray-600 text-xs">Notes: {invoice.insurance.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

