'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSetting } from './SettingsContext';

interface InventoryItem {
  _id: string;
  name: string;
  category: 'medicine' | 'supply' | 'equipment' | 'other';
  sku?: string;
  quantity: number;
  unit: string;
  reorderLevel: number;
  reorderQuantity: number;
  unitCost: number;
  supplier?: string;
  expiryDate?: string;
  location?: string;
  notes?: string;
  lastRestocked?: string;
  lastRestockedBy?: {
    _id: string;
    name: string;
  };
  medicineId?: {
    _id: string;
    name: string;
    genericName?: string;
  };
  status: 'in-stock' | 'low-stock' | 'out-of-stock' | 'expired';
  createdAt: string;
  updatedAt: string;
}

interface InventoryTransaction {
  _id: string;
  type: 'restock' | 'adjustment' | 'usage' | 'transfer';
  quantity: number;
  date: string;
  notes?: string;
  performedBy?: {
    _id: string;
    name: string;
  };
}

export default function InventoryDetailClient({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
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

  useEffect(() => {
    fetchItem();
    fetchTransactions();
  }, [itemId]);

  const fetchItem = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/inventory/${itemId}`);
      
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      
      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        let errorData;
        if (contentType && contentType.includes('application/json')) {
          errorData = await res.json();
        }
        const errorMsg = errorData?.error || `Failed to load inventory item: ${res.status} ${res.statusText}`;
        setError(errorMsg);
        return;
      }
      
      const data = await res.json();
      if (data.success && data.data) {
        setItem(data.data);
      } else {
        setError(data.error || 'Failed to load inventory item');
      }
    } catch (error) {
      console.error('Failed to fetch inventory item:', error);
      setError('Failed to load inventory item. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      // For now, we'll use an empty array. In the future, this could fetch from an API
      setTransactions([]);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    }
  };

  const getStatusColor = (status: string): 'green' | 'yellow' | 'red' | 'gray' => {
    switch (status) {
      case 'in-stock':
        return 'green';
      case 'low-stock':
        return 'yellow';
      case 'out-of-stock':
        return 'red';
      case 'expired':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getBadgeColorClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      green: 'bg-green-100 text-green-800 border-green-200',
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      red: 'bg-red-100 text-red-800 border-red-200',
      gray: 'bg-gray-100 text-gray-800 border-gray-200',
    };
    return colorMap[color] || colorMap.gray;
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-teal-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-teal-100 border-t-teal-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading inventory item...</p>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-teal-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-500 rounded-lg flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-red-900">Error</h3>
                <p className="text-sm text-red-700 mt-1.5 font-medium">{error}</p>
                <button
                  onClick={() => router.push('/inventory')}
                  className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold"
                >
                  ← Back to Inventory
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!item) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-teal-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Inventory item not found</h2>
            <Link 
              href="/inventory"
              className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all text-sm font-semibold shadow-md"
            >
              Back to Inventory
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const totalValue = item.quantity * item.unitCost;
  const needsReorder = item.quantity <= item.reorderLevel;

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-teal-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-center gap-4 mb-6">
              <Link 
                href="/inventory"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="flex items-center gap-3 flex-1">
                <div className="p-2 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
                    {item.name}
                  </h1>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-600 capitalize">{item.category}</p>
                    {item.sku && (
                      <>
                        <p className="text-sm text-gray-400">•</p>
                        <p className="text-sm font-medium text-gray-600">SKU: {item.sku}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link 
                  href={`/inventory/${itemId}/edit`}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all text-sm font-semibold flex items-center gap-2 shadow-md"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </Link>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-blue-500 rounded-lg">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Current Stock</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{item.quantity} {item.unit}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-emerald-500 rounded-lg">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Unit Cost</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(item.unitCost)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-teal-500 rounded-lg">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Total Value</p>
                </div>
                <p className="text-2xl font-bold text-teal-600">{formatCurrency(totalValue)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-purple-500 rounded-lg">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Reorder Level</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{item.reorderLevel} {item.unit}</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-3">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Quick Actions</h3>
                </div>
              </div>
              <div className="p-5">
                <div className="flex gap-3 flex-wrap">
                  <Link 
                    href={`/inventory/${itemId}/restock`}
                    className="px-4 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all text-sm font-semibold flex items-center gap-2 flex-1 min-w-[150px] shadow-md"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Restock
                  </Link>
                  <Link 
                    href={`/inventory/${itemId}/adjust`}
                    className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold flex items-center gap-2 flex-1 min-w-[150px] shadow-md"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Adjust
                  </Link>
                  <Link 
                    href={`/inventory/${itemId}/edit`}
                    className="px-4 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all text-sm font-semibold flex items-center gap-2 flex-1 min-w-[150px] shadow-md"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Item
                  </Link>
                </div>
              </div>
            </div>

            {/* Status Alert */}
            {needsReorder && (
              <div className={`border rounded-xl p-4 mb-3 shadow-sm ${
                item.status === 'out-of-stock' 
                  ? 'bg-red-50 border-red-200' 
                  : 'bg-yellow-50 border-yellow-200'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${
                    item.status === 'out-of-stock' ? 'bg-red-500' : 'bg-yellow-500'
                  }`}>
                    <svg className={`w-5 h-5 text-white`} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${
                      item.status === 'out-of-stock' ? 'text-red-900' : 'text-yellow-900'
                    }`}>
                      {item.status === 'out-of-stock' 
                        ? 'Out of Stock' 
                        : 'Low Stock - Reorder Required'}
                    </p>
                    <p className={`text-sm mt-1.5 font-medium ${
                      item.status === 'out-of-stock' ? 'text-red-700' : 'text-yellow-700'
                    }`}>
                      Current quantity ({item.quantity} {item.unit}) is below reorder level ({item.reorderLevel} {item.unit})
                    </p>
                  </div>
                </div>
              </div>
          )}

          {/* Tabs */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-3">
              <div className="border-b border-gray-200 overflow-x-auto">
                <nav className="flex -mb-px min-w-max">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === 'overview'
                        ? 'border-teal-500 text-teal-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === 'history'
                        ? 'border-teal-500 text-teal-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    History ({transactions.length})
                  </button>
                </nav>
              </div>

              <div className="p-6">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Basic Information */}
                      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-teal-500 rounded-lg">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-bold text-gray-900">Basic Information</h3>
                        </div>
                        <dl className="space-y-3">
                          <div>
                            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Status</dt>
                            <dd>
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold border ${getBadgeColorClasses(getStatusColor(item.status))}`}>
                                {item.status.replace('-', ' ')}
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Category</dt>
                            <dd className="text-sm font-bold text-gray-900 capitalize">{item.category}</dd>
                          </div>
                          {item.sku && (
                            <div>
                              <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">SKU</dt>
                              <dd className="text-sm font-bold text-gray-900">{item.sku}</dd>
                            </div>
                          )}
                          <div>
                            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Unit</dt>
                            <dd className="text-sm font-bold text-gray-900">{item.unit}</dd>
                          </div>
                        </dl>
                      </div>

                      {/* Stock Information */}
                      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-blue-500 rounded-lg">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-bold text-gray-900">Stock Information</h3>
                        </div>
                        <dl className="space-y-3">
                          <div>
                            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Current Quantity</dt>
                            <dd className="text-sm font-bold text-gray-900">{item.quantity} {item.unit}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Reorder Level</dt>
                            <dd className="text-sm font-bold text-gray-900">{item.reorderLevel} {item.unit}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Reorder Quantity</dt>
                            <dd className="text-sm font-bold text-gray-900">{item.reorderQuantity} {item.unit}</dd>
                          </div>
                          {item.location && (
                            <div>
                              <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Storage Location</dt>
                              <dd className="text-sm font-bold text-gray-900">{item.location}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    </div>

                    {/* Financial Information */}
                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-emerald-500 rounded-lg">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Financial Information</h3>
                      </div>
                      <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Unit Cost</dt>
                          <dd className="text-sm font-bold text-gray-900">{formatCurrency(item.unitCost)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total Value</dt>
                          <dd className="text-sm font-bold text-teal-600">{formatCurrency(totalValue)}</dd>
                        </div>
                        {item.supplier && (
                          <div>
                            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Supplier</dt>
                            <dd className="text-sm font-bold text-gray-900">{item.supplier}</dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    {/* Dates & References */}
                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-purple-500 rounded-lg">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Dates & References</h3>
                      </div>
                      <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {item.expiryDate && (
                          <div>
                            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Expiry Date</dt>
                            <dd className="text-sm font-bold text-gray-900">
                              {new Date(item.expiryDate).toLocaleDateString('en-US', { 
                                month: 'long', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                            </dd>
                          </div>
                        )}
                        {item.lastRestocked && (
                          <div>
                            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Last Restocked</dt>
                            <dd className="text-sm font-bold text-gray-900">
                              {new Date(item.lastRestocked).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                              {item.lastRestockedBy && (
                                <span className="text-gray-600 ml-1 font-medium">by {item.lastRestockedBy.name}</span>
                              )}
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Created</dt>
                          <dd className="text-sm font-bold text-gray-900">
                            {new Date(item.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Last Updated</dt>
                          <dd className="text-sm font-bold text-gray-900">
                            {new Date(item.updatedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {/* Medicine Reference */}
                    {item.medicineId && (
                      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-indigo-500 rounded-lg">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-bold text-gray-900">Related Medicine</h3>
                        </div>
                        <dl className="space-y-3">
                          <div>
                            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Name</dt>
                            <dd className="text-sm font-bold text-gray-900">{item.medicineId.name}</dd>
                          </div>
                          {item.medicineId.genericName && (
                            <div>
                              <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Generic Name</dt>
                              <dd className="text-sm font-bold text-gray-900">{item.medicineId.genericName}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}

                    {/* Notes */}
                    {item.notes && (
                      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-gray-500 rounded-lg">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-bold text-gray-900">Notes</h3>
                        </div>
                        <p className="text-sm font-medium text-gray-700 whitespace-pre-wrap">{item.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                  <div>
                    {transactions.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">No transaction history</h3>
                        <p className="text-sm text-gray-600 font-medium">Transaction history will appear here once items are restocked or adjusted.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {transactions.map((transaction) => (
                          <div
                            key={transaction._id}
                            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className={`text-xs px-2.5 py-1 rounded-full capitalize font-semibold border ${
                                    transaction.type === 'restock' ? 'bg-green-100 text-green-800 border-green-200' :
                                    transaction.type === 'adjustment' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                    transaction.type === 'usage' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                    'bg-gray-100 text-gray-800 border-gray-200'
                                  }`}>
                                    {transaction.type}
                                  </span>
                                </div>
                                <p className="text-sm font-bold text-gray-900">
                                  Quantity: {transaction.quantity > 0 ? '+' : ''}{transaction.quantity} {item.unit}
                                </p>
                                <p className="text-xs font-medium text-gray-600 mt-1.5">
                                  {new Date(transaction.date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit'
                                  })}
                                  {transaction.performedBy && (
                                    <span className="ml-1">by {transaction.performedBy.name}</span>
                                  )}
                                </p>
                                {transaction.notes && (
                                  <p className="text-sm font-medium text-gray-700 mt-2">{transaction.notes}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
        </div>
      </div>
    </section>
  );
}


