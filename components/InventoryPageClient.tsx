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
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        data = { success: false, error: `API error: ${res.status} ${res.statusText}` };
      }
      
      if (data.success) {
        setItems(data.data);
      } else {
        console.error('Failed to fetch inventory:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
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
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold mb-1">Inventory Management</h1>
              <p className="text-sm text-gray-600">Track medicines and supplies</p>
            </div>
            <Link 
              href="/inventory/new"
              className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Item
            </Link>
          </div>

          {/* Low Stock Alert */}
          {lowStockItems.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
              <svg className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-yellow-800">
                {lowStockItems.length} item(s) need restocking
              </p>
            </div>
          )}

          {/* Search and Filters */}
          <div className="flex flex-col gap-2">
            <div className="relative w-full">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search by item name..."
                value={searchQuery || ''}
                onChange={(e) => setSearchQuery(e.target.value || '')}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <select 
                value={filterCategory || 'all'} 
                onChange={(e) => setFilterCategory(e.target.value || 'all')}
                className="min-w-[150px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
              >
                <option value="all">All Categories</option>
                <option value="medicine">Medicine</option>
                <option value="supply">Supply</option>
                <option value="equipment">Equipment</option>
                <option value="other">Other</option>
              </select>
              <select 
                value={filterStatus || 'all'} 
                onChange={(e) => setFilterStatus(e.target.value || 'all')}
                className="min-w-[150px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="in-stock">In Stock</option>
                <option value="low-stock">Low Stock</option>
                <option value="out-of-stock">Out of Stock</option>
                <option value="expired">Expired</option>
              </select>
              {(searchQuery || filterCategory !== 'all' || filterStatus !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFilterCategory('all');
                    setFilterStatus('all');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Inventory Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-3 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold">Inventory Items</h2>
              <p className="text-sm text-gray-600">
                {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Item Name</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Category</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Quantity</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Unit</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Reorder Level</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Status</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Expiry Date</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-6">
                        <div className="flex flex-col items-center gap-2">
                          <div>
                            <svg className="w-8 h-8 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium">
                            {searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'No items match your filters' : 'No inventory items found'}
                          </p>
                          <p className="text-sm text-gray-600 mb-2">
                            {searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Add your first inventory item to get started'}
                          </p>
                          {!searchQuery && filterCategory === 'all' && filterStatus === 'all' && (
                            <Link 
                              href="/inventory/new"
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Add Item
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item._id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3">
                          <p className="text-sm font-medium">{item.name}</p>
                        </td>
                        <td className="py-2 px-3">
                          <p className="text-sm text-gray-600 capitalize">{item.category}</p>
                        </td>
                        <td className="py-2 px-3">
                          <p className="text-sm font-medium">{item.quantity}</p>
                        </td>
                        <td className="py-2 px-3">
                          <p className="text-sm text-gray-600">{item.unit}</p>
                        </td>
                        <td className="py-2 px-3">
                          <p className="text-sm text-gray-600">{item.reorderLevel}</p>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getBadgeColorClasses(getStatusColor(item.status))}`}>
                            {item.status.replace('-', ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <p className="text-sm text-gray-600">
                            {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                          </p>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Link 
                            href={`/inventory/${item._id}`}
                            className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
                          >
                            View →
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

