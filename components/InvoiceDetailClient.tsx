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
  professionalFee?: number;
  professionalFeeType?: 'consultation' | 'procedure' | 'reading' | 'other';
  professionalFeeDoctor?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  professionalFeeNotes?: string;
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
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
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

  useEffect(() => {
    if (invoice && !newStatus) {
      setNewStatus(invoice.status);
    }
  }, [invoice]);

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

  const handleUpdateStatus = async () => {
    if (!newStatus || newStatus === invoice?.status) return;

    try {
      setUpdatingStatus(true);
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }

      const data = await res.json();
      if (data.success && data.data) {
        setInvoice(data.data);
        setNewStatus(data.data.status);
        alert('Invoice status updated successfully');
      }
    } catch (error: any) {
      console.error('Failed to update status:', error);
      alert(error.message || 'Failed to update invoice status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-emerald-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-emerald-100 border-t-emerald-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading invoice...</p>
          </div>
        </div>
      </section>
    );
  }

  if (error || !invoice) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-emerald-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-full flex-shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-800 mb-1">Error</h3>
                <p className="text-sm text-red-700 mb-4">{error || 'Invoice not found'}</p>
                <button
                  onClick={() => router.push('/invoices')}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold"
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
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-emerald-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <Link
                href="/invoices"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="flex items-center gap-3 flex-1">
                <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Invoice Details</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Invoice #{invoice.invoiceNumber}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePrintReceipt}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Receipt
                </button>
              </div>
            </div>
          </div>

          {/* Invoice Info Card */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-6 sm:p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="flex flex-col gap-6">
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-emerald-500 rounded-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900">Invoice Information</h2>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Invoice Number:</span>
                        <span className="font-bold text-gray-900">{invoice.invoiceNumber}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Status:</span>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(invoice.status)}`}>
                          {invoice.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Date Created:</span>
                        <span className="font-medium text-gray-900">{formatDate(invoice.createdAt)}</span>
                      </div>
                      {invoice.visit && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Visit:</span>
                          <Link href={`/visits/${invoice.visit._id}`} className="font-bold text-emerald-600 hover:text-emerald-700 hover:underline transition-colors">
                            {invoice.visit.visitCode}
                          </Link>
                        </div>
                      )}
                      {invoice.createdBy && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Created By:</span>
                          <span className="font-medium text-gray-900">{invoice.createdBy.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 border border-cyan-200 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-cyan-500 rounded-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900">Patient Information</h2>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Patient:</span>
                        <Link href={`/patients/${invoice.patient._id}`} className="font-bold text-cyan-600 hover:text-cyan-700 hover:underline transition-colors">
                          {invoice.patient.firstName} {invoice.patient.lastName}
                        </Link>
                      </div>
                      {invoice.patient.patientCode && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Patient Code:</span>
                          <span className="font-medium text-gray-900">{invoice.patient.patientCode}</span>
                        </div>
                      )}
                      {invoice.patient.email && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Email:</span>
                          <span className="font-medium text-gray-900">{invoice.patient.email}</span>
                        </div>
                      )}
                      {invoice.patient.phone && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Phone:</span>
                          <span className="font-medium text-gray-900">{invoice.patient.phone}</span>
                        </div>
                      )}
                      {invoice.patient.address && (
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Address:</span>
                          <span className="font-medium text-gray-900 text-right">
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
                <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-purple-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">Financial Summary</h2>
                  </div>
                  <div className="bg-white rounded-lg p-5 space-y-3 border border-purple-200">
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold text-gray-700">Subtotal:</span>
                      <span className="font-bold text-gray-900">{formatCurrency(invoice.subtotal || 0)}</span>
                    </div>
                    {invoice.professionalFee && invoice.professionalFee > 0 && (
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold text-purple-700">
                            Professional Fee {invoice.professionalFeeType && `(${invoice.professionalFeeType})`}:
                          </span>
                          <span className="font-bold text-purple-700">+{formatCurrency(invoice.professionalFee)}</span>
                        </div>
                        {invoice.professionalFeeDoctor && (
                          <div className="text-xs text-purple-600 font-medium">
                            Dr. {invoice.professionalFeeDoctor.firstName} {invoice.professionalFeeDoctor.lastName}
                          </div>
                        )}
                        {invoice.professionalFeeNotes && (
                          <div className="text-xs text-gray-600">{invoice.professionalFeeNotes}</div>
                        )}
                      </div>
                    )}
                    {invoice.discounts && invoice.discounts.length > 0 && (
                      <div className="space-y-2">
                        {invoice.discounts.map((discount, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="font-semibold text-gray-700">
                              Discount ({discount.type === 'pwd' ? 'PWD' : discount.type === 'senior' ? 'Senior' : discount.type === 'membership' ? 'Membership' : discount.reason || 'Other'}):
                            </span>
                            <span className="font-bold text-red-600">-{formatCurrency(discount.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {invoice.tax && invoice.tax > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold text-gray-700">Tax:</span>
                        <span className="font-bold text-gray-900">{formatCurrency(invoice.tax)}</span>
                      </div>
                    )}
                    <div className="border-t-2 border-gray-300 pt-3">
                      <div className="flex justify-between">
                        <span className="text-lg font-bold text-gray-900">Total:</span>
                        <span className="text-lg font-bold text-emerald-600">{formatCurrency(invoice.total || 0)}</span>
                      </div>
                    </div>
                    {invoice.totalPaid !== undefined && invoice.totalPaid > 0 && (
                      <div className="flex justify-between text-sm pt-3 border-t border-gray-200">
                        <span className="font-semibold text-gray-700">Total Paid:</span>
                        <span className="font-bold text-green-600">{formatCurrency(invoice.totalPaid)}</span>
                      </div>
                    )}
                    {invoice.outstandingBalance !== undefined && invoice.outstandingBalance > 0 && (
                      <div className="flex justify-between text-sm pt-2">
                        <span className="font-semibold text-gray-700">Outstanding Balance:</span>
                        <span className="font-bold text-red-600">{formatCurrency(invoice.outstandingBalance)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Status Management */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-5 border-b border-gray-200 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">Status Management</h2>
              </div>
            </div>
            <div className="p-5">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Update Invoice Status
                  </label>
                  <p className="text-xs text-gray-600 mb-3">
                    Change the payment status of this invoice. This helps track outstanding balances and completed payments.
                  </p>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full sm:w-64 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partially Paid</option>
                    <option value="paid">Paid</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="block text-sm font-semibold text-gray-700 opacity-0 pointer-events-none sm:block hidden">
                    Action
                  </label>
                  <button
                    onClick={handleUpdateStatus}
                    disabled={updatingStatus || newStatus === invoice.status}
                    className={`px-5 py-2.5 rounded-lg transition-all flex items-center gap-2 text-sm font-semibold shadow-md whitespace-nowrap ${
                      updatingStatus || newStatus === invoice.status
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700'
                    }`}
                  >
                    {updatingStatus ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Updating...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Update Status
                      </>
                    )}
                  </button>
                </div>
              </div>
              
              {/* Status Guide */}
              <div className="mt-5 pt-5 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Status Guide:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 border border-red-200 font-semibold">UNPAID</span>
                    <span className="text-gray-600">No payment received yet</span>
                  </div>
                  <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200 font-semibold">PARTIAL</span>
                    <span className="text-gray-600">Some payment received, balance remains</span>
                  </div>
                  <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                    <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 border border-green-200 font-semibold">PAID</span>
                    <span className="text-gray-600">Full payment received</span>
                  </div>
                  <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 border border-gray-200 font-semibold">REFUNDED</span>
                    <span className="text-gray-600">Payment returned to patient</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-5 border-b border-gray-200 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">Invoice Items</h2>
              </div>
            </div>
            <div className="p-5">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Code</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Description</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Category</th>
                      <th className="px-5 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Quantity</th>
                      <th className="px-5 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Unit Price</th>
                      <th className="px-5 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {invoice.items.map((item, idx) => {
                      const serviceName = typeof item.serviceId === 'object' && item.serviceId?.name 
                        ? item.serviceId.name 
                        : item.description || 'Service';
                      return (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-4 text-sm font-medium text-gray-900">{item.code || '—'}</td>
                          <td className="px-5 py-4 text-sm font-bold text-gray-900">{serviceName}</td>
                          <td className="px-5 py-4 text-sm text-gray-600">{item.category || '—'}</td>
                          <td className="px-5 py-4 text-sm text-right font-medium">{item.quantity || 1}</td>
                          <td className="px-5 py-4 text-sm text-right font-medium">{formatCurrency(item.unitPrice)}</td>
                          <td className="px-5 py-4 text-sm font-bold text-right text-gray-900">{formatCurrency(item.total)}</td>
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
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Payments</h2>
                </div>
              </div>
              <div className="p-5">
                <div className="space-y-3">
                  {invoice.payments.map((payment, idx) => (
                    <div key={idx} className="bg-gradient-to-r from-white to-green-50/50 border border-green-200 rounded-lg p-5 hover:shadow-md transition-all">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="flex justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Payment Method:</span>
                            <span className="font-bold text-gray-900">{formatPaymentMethod(payment.method)}</span>
                          </div>
                          <div className="flex justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Amount:</span>
                            <span className="font-bold text-green-600">{formatCurrency(payment.amount)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Date:</span>
                            <span className="font-medium text-gray-900">{formatDateTime(payment.date)}</span>
                          </div>
                        </div>
                        <div>
                          {payment.receiptNo && (
                            <div className="flex justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Receipt No:</span>
                              <span className="font-medium text-gray-900">{payment.receiptNo}</span>
                            </div>
                          )}
                          {payment.referenceNo && (
                            <div className="flex justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Reference No:</span>
                              <span className="font-medium text-gray-900">{payment.referenceNo}</span>
                            </div>
                          )}
                          {payment.processedBy && (
                            <div className="flex justify-between">
                              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Processed By:</span>
                              <span className="font-medium text-gray-900">{payment.processedBy.name}</span>
                            </div>
                          )}
                          {payment.notes && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Notes:</span>
                              <p className="text-sm text-gray-900 mt-1">{payment.notes}</p>
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
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Insurance/HMO Information</h2>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Provider:</span>
                      <span className="font-bold text-gray-900">{invoice.insurance.provider}</span>
                    </div>
                    {invoice.insurance.policyNumber && (
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Policy Number:</span>
                        <span className="font-medium text-gray-900">{invoice.insurance.policyNumber}</span>
                      </div>
                    )}
                    {invoice.insurance.memberId && (
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Member ID:</span>
                        <span className="font-medium text-gray-900">{invoice.insurance.memberId}</span>
                      </div>
                    )}
                    {invoice.insurance.coverageType && (
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Coverage Type:</span>
                        <span className="font-medium text-gray-900 capitalize">{invoice.insurance.coverageType}</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    {invoice.insurance.coverageAmount && (
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Coverage Amount:</span>
                        <span className="font-bold text-gray-900">{formatCurrency(invoice.insurance.coverageAmount)}</span>
                      </div>
                    )}
                    {invoice.insurance.claimNumber && (
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Claim Number:</span>
                        <span className="font-medium text-gray-900">{invoice.insurance.claimNumber}</span>
                      </div>
                    )}
                    {invoice.insurance.status && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Status:</span>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          invoice.insurance.status === 'approved' || invoice.insurance.status === 'paid'
                            ? 'bg-green-100 text-green-700 border-green-200'
                            : invoice.insurance.status === 'rejected'
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                        }`}>
                          {invoice.insurance.status.toUpperCase()}
                        </span>
                      </div>
                    )}
                    {invoice.insurance.notes && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Notes:</span>
                        <p className="text-sm text-gray-900 mt-1">{invoice.insurance.notes}</p>
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

