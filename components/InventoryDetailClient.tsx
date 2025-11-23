'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-4">
            <div className="h-10 w-[300px] bg-gray-200 rounded animate-pulse"></div>
            <div className="flex gap-4 flex-wrap">
              <div className="h-[200px] bg-gray-200 rounded animate-pulse flex-1" style={{ flex: '1 1 300px' }}></div>
              <div className="h-[200px] bg-gray-200 rounded animate-pulse flex-1" style={{ flex: '1 1 300px' }}></div>
            </div>
            <div className="h-[400px] bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
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
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <button
                  onClick={() => router.push('/inventory')}
                  className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
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
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-4" style={{ minHeight: '50vh' }}>
            <h2 className="text-2xl font-semibold">Inventory item not found</h2>
            <Link 
              href="/inventory"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <Link 
                href="/inventory"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-1">
                  {item.name}
                </h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-gray-500 capitalize">{item.category}</p>
                  {item.sku && (
                    <>
                      <p className="text-sm text-gray-500">•</p>
                      <p className="text-sm text-gray-500">SKU: {item.sku}</p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link 
                  href={`/inventory/${itemId}/edit`}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </Link>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex gap-2 flex-wrap mb-3">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                <div className="p-2">
                  <p className="text-xs text-gray-500 mb-1">Current Stock</p>
                  <p className="text-2xl font-bold">{item.quantity} {item.unit}</p>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                <div className="p-2">
                  <p className="text-xs text-gray-500 mb-1">Unit Cost</p>
                  <p className="text-2xl font-bold">${item.unitCost.toFixed(2)}</p>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                <div className="p-2">
                  <p className="text-xs text-gray-500 mb-1">Total Value</p>
                  <p className="text-2xl font-bold text-blue-600">${totalValue.toFixed(2)}</p>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[150px]">
                <div className="p-2">
                  <p className="text-xs text-gray-500 mb-1">Reorder Level</p>
                  <p className="text-2xl font-bold">{item.reorderLevel} {item.unit}</p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-3">
              <div className="p-3">
                <h3 className="text-lg font-semibold mb-2">Quick Actions</h3>
                <div className="flex gap-2 flex-wrap">
                  <Link 
                    href={`/inventory/${itemId}/restock`}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-1 flex-1 min-w-[150px]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Restock
                  </Link>
                  <Link 
                    href={`/inventory/${itemId}/adjust`}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-1 flex-1 min-w-[150px]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Adjust
                  </Link>
                  <Link 
                    href={`/inventory/${itemId}/edit`}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-1 flex-1 min-w-[150px]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Item
                  </Link>
                </div>
              </div>
            </div>

            {/* Status Alert */}
            {needsReorder && (
              <div className={`border rounded-lg p-3 mb-3 ${
                item.status === 'out-of-stock' 
                  ? 'bg-red-50 border-red-200' 
                  : 'bg-yellow-50 border-yellow-200'
              }`}>
                <div className="flex items-start gap-2">
                  <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                    item.status === 'out-of-stock' ? 'text-red-600' : 'text-yellow-600'
                  }`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className={`text-sm font-medium ${
                      item.status === 'out-of-stock' ? 'text-red-800' : 'text-yellow-800'
                    }`}>
                      {item.status === 'out-of-stock' 
                        ? 'Out of Stock' 
                        : 'Low Stock - Reorder Required'}
                    </p>
                    <p className={`text-sm mt-1 ${
                      item.status === 'out-of-stock' ? 'text-red-700' : 'text-yellow-700'
                    }`}>
                      Current quantity ({item.quantity} {item.unit}) is below reorder level ({item.reorderLevel} {item.unit})
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-3">
              <div className="border-b border-gray-200 overflow-x-auto">
                <nav className="flex -mb-px min-w-max">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === 'overview'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === 'history'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    History ({transactions.length})
                  </button>
                </nav>
              </div>

              <div className="p-3">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Basic Information */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Basic Information</h3>
                        <dl className="space-y-2">
                          <div>
                            <dt className="text-xs font-medium text-gray-500">Status</dt>
                            <dd className="mt-1">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded text-sm font-medium border ${getBadgeColorClasses(getStatusColor(item.status))}`}>
                                {item.status.replace('-', ' ')}
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500">Category</dt>
                            <dd className="text-sm text-gray-900 capitalize">{item.category}</dd>
                          </div>
                          {item.sku && (
                            <div>
                              <dt className="text-xs font-medium text-gray-500">SKU</dt>
                              <dd className="text-sm text-gray-900">{item.sku}</dd>
                            </div>
                          )}
                          <div>
                            <dt className="text-xs font-medium text-gray-500">Unit</dt>
                            <dd className="text-sm text-gray-900">{item.unit}</dd>
                          </div>
                        </dl>
                      </div>

                      {/* Stock Information */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Stock Information</h3>
                        <dl className="space-y-2">
                          <div>
                            <dt className="text-xs font-medium text-gray-500">Current Quantity</dt>
                            <dd className="text-sm text-gray-900 font-semibold">{item.quantity} {item.unit}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500">Reorder Level</dt>
                            <dd className="text-sm text-gray-900">{item.reorderLevel} {item.unit}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500">Reorder Quantity</dt>
                            <dd className="text-sm text-gray-900">{item.reorderQuantity} {item.unit}</dd>
                          </div>
                          {item.location && (
                            <div>
                              <dt className="text-xs font-medium text-gray-500">Storage Location</dt>
                              <dd className="text-sm text-gray-900">{item.location}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    </div>

                    {/* Financial Information */}
                    <div className="bg-gray-50 rounded-lg p-3">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Financial Information</h3>
                      <dl className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Unit Cost</dt>
                          <dd className="text-sm text-gray-900 font-semibold">${item.unitCost.toFixed(2)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Total Value</dt>
                          <dd className="text-sm text-gray-900 font-semibold text-blue-600">${totalValue.toFixed(2)}</dd>
                        </div>
                        {item.supplier && (
                          <div>
                            <dt className="text-xs font-medium text-gray-500">Supplier</dt>
                            <dd className="text-sm text-gray-900">{item.supplier}</dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    {/* Dates & References */}
                    <div className="bg-gray-50 rounded-lg p-3">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Dates & References</h3>
                      <dl className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {item.expiryDate && (
                          <div>
                            <dt className="text-xs font-medium text-gray-500">Expiry Date</dt>
                            <dd className="text-sm text-gray-900">
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
                            <dt className="text-xs font-medium text-gray-500">Last Restocked</dt>
                            <dd className="text-sm text-gray-900">
                              {new Date(item.lastRestocked).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                              {item.lastRestockedBy && (
                                <span className="text-gray-500 ml-1">by {item.lastRestockedBy.name}</span>
                              )}
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Created</dt>
                          <dd className="text-sm text-gray-900">
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
                          <dt className="text-xs font-medium text-gray-500">Last Updated</dt>
                          <dd className="text-sm text-gray-900">
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
                      <div className="bg-gray-50 rounded-lg p-3">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Related Medicine</h3>
                        <dl className="space-y-2">
                          <div>
                            <dt className="text-xs font-medium text-gray-500">Name</dt>
                            <dd className="text-sm text-gray-900 font-medium">{item.medicineId.name}</dd>
                          </div>
                          {item.medicineId.genericName && (
                            <div>
                              <dt className="text-xs font-medium text-gray-500">Generic Name</dt>
                              <dd className="text-sm text-gray-900">{item.medicineId.genericName}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}

                    {/* Notes */}
                    {item.notes && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                  <div>
                    {transactions.length === 0 ? (
                      <div className="text-center py-12">
                        <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">No transaction history</h3>
                        <p className="text-gray-600">Transaction history will appear here once items are restocked or adjusted.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {transactions.map((transaction) => (
                          <div
                            key={transaction._id}
                            className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-1">
                                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                                    transaction.type === 'restock' ? 'bg-green-100 text-green-800' :
                                    transaction.type === 'adjustment' ? 'bg-blue-100 text-blue-800' :
                                    transaction.type === 'usage' ? 'bg-orange-100 text-orange-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {transaction.type}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-700">
                                  Quantity: {transaction.quantity > 0 ? '+' : ''}{transaction.quantity} {item.unit}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
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
                                  <p className="text-sm text-gray-600 mt-1">{transaction.notes}</p>
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
      </div>
    </section>
  );
}


