'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSetting } from './SettingsContext';

interface InventoryItem {
  _id: string;
  name: string;
  category: 'medicine' | 'supply' | 'equipment' | 'other';
  quantity: number;
  unit: string;
  reorderLevel: number;
  reorderQuantity: number;
  unitCost: number;
  supplier?: string;
  notes?: string;
}

export default function InventoryRestockClient({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restockQuantity, setRestockQuantity] = useState<string>('');
  const [unitCost, setUnitCost] = useState<string>('');
  const [supplier, setSupplier] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
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
        // Pre-fill with suggested values
        setRestockQuantity(data.data.reorderQuantity?.toString() || '');
        setUnitCost(data.data.unitCost?.toString() || '');
        setSupplier(data.data.supplier || '');
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!restockQuantity) {
      alert('Please enter a restock quantity');
      return;
    }

    const quantity = parseFloat(restockQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      alert('Please enter a valid positive number for quantity');
      return;
    }

    setSubmitting(true);
    try {
      const newQuantity = item!.quantity + quantity;
      const updateData: any = {
        quantity: newQuantity,
      };

      // Update unit cost if provided
      if (unitCost) {
        const cost = parseFloat(unitCost);
        if (!isNaN(cost) && cost >= 0) {
          updateData.unitCost = cost;
        }
      }

      // Update supplier if provided
      if (supplier.trim()) {
        updateData.supplier = supplier.trim();
      }

      // Add notes if provided
      if (notes.trim()) {
        const existingNotes = item!.notes || '';
        updateData.notes = existingNotes 
          ? `${existingNotes}\n\nRestocked ${quantity} ${item!.unit}${notes.trim() ? ` - ${notes.trim()}` : ''}`
          : `Restocked ${quantity} ${item!.unit}${notes.trim() ? ` - ${notes.trim()}` : ''}`;
      } else {
        const existingNotes = item!.notes || '';
        updateData.notes = existingNotes 
          ? `${existingNotes}\n\nRestocked ${quantity} ${item!.unit}`
          : `Restocked ${quantity} ${item!.unit}`;
      }

      const res = await fetch(`/api/inventory/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      if (res.status === 403) {
        alert('You do not have permission to restock inventory items');
        return;
      }

      const data = await res.json();
      if (data.success) {
        router.push(`/inventory/${itemId}`);
      } else {
        alert(data.error || 'Failed to restock inventory item');
      }
    } catch (error) {
      console.error('Failed to restock inventory item:', error);
      alert('Failed to restock inventory item. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push(`/inventory/${itemId}`);
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
                  onClick={handleCancel}
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
            <button
              onClick={handleCancel}
              className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all text-sm font-semibold shadow-md"
            >
              Back to Inventory
            </button>
          </div>
        </div>
      </section>
    );
  }

  const restockQty = parseFloat(restockQuantity) || 0;
  const newQuantity = item.quantity + restockQty;
  const totalCost = restockQty * (parseFloat(unitCost) || item.unitCost || 0);

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-teal-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <Link
                href={`/inventory/${itemId}`}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Restock Inventory</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">{item.name}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Current Stock Info */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Current Quantity</p>
                <p className="text-2xl font-bold text-gray-900">{item.quantity} {item.unit}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Reorder Level</p>
                <p className="text-sm font-bold text-gray-900">{item.reorderLevel} {item.unit}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Suggested Reorder Qty</p>
                <p className="text-sm font-bold text-gray-900">{item.reorderQuantity} {item.unit}</p>
              </div>
              {restockQty > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">New Quantity</p>
                  <p className="text-2xl font-bold text-green-600">{newQuantity} {item.unit}</p>
                </div>
              )}
            </div>
          </div>

          {/* Restock Form */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-200 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Restock Details</h3>
              </div>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-6 p-6">
                {/* Restock Quantity */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">
                    Restock Quantity <span className="text-red-600">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-green-600 font-bold text-lg">+</span>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={restockQuantity}
                      onChange={(e) => setRestockQuantity(e.target.value)}
                      placeholder={`Suggested: ${item.reorderQuantity} ${item.unit}`}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                    <span className="text-sm font-semibold text-gray-600">{item.unit}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-2 font-medium">
                    Suggested reorder quantity: {item.reorderQuantity} {item.unit}
                  </p>
                </div>

                {/* Unit Cost */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">
                    Unit Cost (Optional)
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 font-semibold">{new Intl.NumberFormat('en-PH', { style: 'currency', currency: currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(0).replace(/[\d.,]/g, '').trim()}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                      placeholder={`Current: ${formatCurrency(item.unitCost)}`}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-2 font-medium">
                    Current unit cost: {formatCurrency(item.unitCost)}. Leave blank to keep current.
                  </p>
                </div>

                {/* Supplier */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">
                    Supplier (Optional)
                  </label>
                  <input
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder={item.supplier || 'Enter supplier name'}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                  {item.supplier && (
                    <p className="text-xs text-gray-600 mt-2 font-medium">
                      Current supplier: {item.supplier}
                    </p>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">
                    Notes (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g., Order #12345, Batch number, etc."
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all text-sm resize-y"
                  />
                </div>

                {/* Cost Summary */}
                {restockQty > 0 && unitCost && parseFloat(unitCost) > 0 && (
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-blue-500 rounded-lg">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-blue-900">Cost Summary</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-blue-700 font-semibold">Quantity:</span>
                        <span className="font-bold ml-2">{restockQty} {item.unit}</span>
                      </div>
                      <div>
                        <span className="text-blue-700 font-semibold">Unit Cost:</span>
                        <span className="font-bold ml-2">{formatCurrency(parseFloat(unitCost))}</span>
                      </div>
                      <div className="col-span-2 pt-3 border-t border-blue-200">
                        <span className="text-blue-900 font-bold">Total Cost:</span>
                        <span className="font-bold text-lg ml-2">{formatCurrency(totalCost)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview */}
                {restockQty > 0 && (
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-green-500 rounded-lg">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-green-900">Restock Preview</p>
                    </div>
                    <p className="text-sm font-semibold">
                      <span className="font-bold">{item.quantity} {item.unit}</span>
                      {' + '}
                      <span className="font-bold text-green-700">{restockQty} {item.unit}</span>
                      {' = '}
                      <span className="font-bold text-lg">{newQuantity} {item.unit}</span>
                    </p>
                  </div>
                )}

                {/* Form Actions */}
                <hr className="border-gray-200" />
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors border border-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !restockQuantity || parseFloat(restockQuantity) <= 0}
                    className="px-4 py-2.5 text-sm bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-semibold transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Restocking...' : 'Restock Item'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

