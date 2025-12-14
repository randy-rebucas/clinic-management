'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from './ui/Modal';

interface InventoryItem {
  _id: string;
  name: string;
  category: 'medicine' | 'supply' | 'equipment' | 'other';
  quantity: number;
  unit: string;
  reorderLevel: number;
  status: 'in-stock' | 'low-stock' | 'out-of-stock' | 'expired';
  expiryDate?: string;
}

export default function InventoryPageClient() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const router = useRouter();

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const res = await fetch('/api/inventory');
      
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      
      const contentType = res.headers.get('content-type');
      let data;
      
      // Try to parse JSON response regardless of status
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch (parseError) {
          console.error('Failed to parse JSON response:', parseError);
          const text = await res.text();
          console.error('Response text:', text.substring(0, 500));
          throw new Error(`API returned invalid JSON: ${res.status} ${res.statusText}`);
        }
      } else {
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }
      
      if (!res.ok) {
        const errorMsg = data?.error || `Failed to fetch inventory: ${res.status} ${res.statusText}`;
        console.error('API error response:', res.status, res.statusText, errorMsg);
        throw new Error(errorMsg);
      }
      
      if (data.success) {
        setItems(data.data || []);
      } else {
        const errorMsg = data.error || 'Failed to fetch inventory';
        console.error('Failed to fetch inventory:', errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
      // Set empty array on error to prevent UI issues
      setItems([]);
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-3">
            <div className="h-8 w-48 bg-gray-200 animate-pulse rounded" />
            <div className="flex gap-3 flex-wrap">
              <div className="h-24 bg-gray-200 animate-pulse rounded flex-1 min-w-[200px]" />
              <div className="h-24 bg-gray-200 animate-pulse rounded flex-1 min-w-[200px]" />
              <div className="h-24 bg-gray-200 animate-pulse rounded flex-1 min-w-[200px]" />
            </div>
            <div className="h-96 bg-gray-200 animate-pulse rounded" />
          </div>
        </div>
      </section>
    );
  }

  const filteredItems = items.filter(item => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const name = (item.name || '').toLowerCase();
      if (!name.includes(query)) return false;
    }
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    return true;
  });

  const lowStockItems = filteredItems.filter(item => item.status === 'low-stock' || item.status === 'out-of-stock');

  const getBadgeColorClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      green: 'bg-green-100 text-green-800 border-green-200',
      blue: 'bg-blue-100 text-blue-800 border-blue-200',
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      gray: 'bg-gray-100 text-gray-800 border-gray-200',
      red: 'bg-red-100 text-red-800 border-red-200',
      orange: 'bg-orange-100 text-orange-800 border-orange-200',
    };
    return colorMap[color] || colorMap.gray;
  };

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-teal-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Inventory Management</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Track medicines and supplies</p>
                </div>
              </div>
              <Link 
                href="/inventory/new"
                className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Item
              </Link>
            </div>
          </div>

          {/* Low Stock Alert */}
          {lowStockItems.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
              <div className="p-1.5 bg-yellow-500 rounded-lg flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-yellow-900">
                  {lowStockItems.length} item(s) need restocking
                </p>
                <p className="text-xs text-yellow-700 mt-1">Please review and restock these items soon</p>
              </div>
            </div>
          )}

          {/* Search and Filters */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-5">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 transform -translate-y-1/2 p-1.5">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search by item name..."
                      value={searchQuery || ''}
                      onChange={(e) => setSearchQuery(e.target.value || '')}
                      className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <div className="min-w-[200px]">
                  <select 
                    value={filterCategory || 'all'} 
                    onChange={(e) => setFilterCategory(e.target.value || 'all')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  >
                    <option value="all">All Categories</option>
                    <option value="medicine">Medicine</option>
                    <option value="supply">Supply</option>
                    <option value="equipment">Equipment</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="min-w-[200px]">
                  <select 
                    value={filterStatus || 'all'} 
                    onChange={(e) => setFilterStatus(e.target.value || 'all')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  >
                    <option value="all">All Statuses</option>
                    <option value="in-stock">In Stock</option>
                    <option value="low-stock">Low Stock</option>
                    <option value="out-of-stock">Out of Stock</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
                {(searchQuery || filterCategory !== 'all' || filterStatus !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setFilterCategory('all');
                      setFilterStatus('all');
                    }}
                    className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Inventory Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-200 bg-gray-50/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Inventory Items</h2>
                </div>
                <p className="text-sm font-semibold text-gray-600">
                  {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Item Name</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Category</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Quantity</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Unit</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Reorder Level</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Expiry Date</th>
                    <th className="px-5 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12">
                        <div className="flex flex-col items-center gap-4">
                          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">
                              {searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'No items match your filters' : 'No inventory items found'}
                            </h3>
                            <p className="text-sm text-gray-600 mb-4">
                              {searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Add your first inventory item to get started'}
                            </p>
                            {!searchQuery && filterCategory === 'all' && filterStatus === 'all' && (
                              <Link 
                                href="/inventory/new"
                                className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all flex items-center gap-2 mx-auto text-sm font-semibold shadow-md"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Item
                              </Link>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <p className="text-sm font-bold text-gray-900">{item.name}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-gray-600 capitalize">{item.category}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-bold text-gray-900">{item.quantity}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-gray-600">{item.unit}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-gray-600">{item.reorderLevel}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getBadgeColorClasses(getStatusColor(item.status))}`}>
                            {item.status.replace('-', ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-gray-900">
                            {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link 
                            href={`/inventory/${item._id}`}
                            className="inline-flex items-center px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors text-xs font-semibold border border-teal-200"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

