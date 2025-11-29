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
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-4">
            <div className="h-10 w-[300px] bg-gray-200 rounded animate-pulse"></div>
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
                  onClick={handleCancel}
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
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Link
              href={`/inventory/${itemId}`}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-3xl font-bold mb-1">Restock Inventory</h1>
              <p className="text-sm text-gray-600">{item.name}</p>
            </div>
          </div>

          {/* Current Stock Info */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Current Quantity</p>
                <p className="text-2xl font-bold">{item.quantity} {item.unit}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Reorder Level</p>
                <p className="text-sm text-gray-900">{item.reorderLevel} {item.unit}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Suggested Reorder Qty</p>
                <p className="text-sm text-gray-900">{item.reorderQuantity} {item.unit}</p>
              </div>
              {restockQty > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">New Quantity</p>
                  <p className="text-2xl font-bold text-green-600">{newQuantity} {item.unit}</p>
                </div>
              )}
            </div>
          </div>

          {/* Restock Form */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-4">
                {/* Restock Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Restock Quantity <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 font-medium">+</span>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={restockQuantity}
                      onChange={(e) => setRestockQuantity(e.target.value)}
                      placeholder={`Suggested: ${item.reorderQuantity} ${item.unit}`}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <span className="text-sm text-gray-500">{item.unit}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Suggested reorder quantity: {item.reorderQuantity} {item.unit}
                  </p>
                </div>

                {/* Unit Cost */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unit Cost (Optional)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{new Intl.NumberFormat('en-PH', { style: 'currency', currency: currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(0).replace(/[\d.,]/g, '').trim()}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                      placeholder={`Current: ${formatCurrency(item.unitCost)}`}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Current unit cost: {formatCurrency(item.unitCost)}. Leave blank to keep current.
                  </p>
                </div>

                {/* Supplier */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Supplier (Optional)
                  </label>
                  <input
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder={item.supplier || 'Enter supplier name'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  {item.supplier && (
                    <p className="text-xs text-gray-500 mt-1">
                      Current supplier: {item.supplier}
                    </p>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g., Order #12345, Batch number, etc."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
                  />
                </div>

                {/* Cost Summary */}
                {restockQty > 0 && unitCost && parseFloat(unitCost) > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-blue-900 mb-1">Cost Summary</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-blue-700">Quantity:</span>
                        <span className="font-medium ml-2">{restockQty} {item.unit}</span>
                      </div>
                      <div>
                        <span className="text-blue-700">Unit Cost:</span>
                        <span className="font-medium ml-2">{formatCurrency(parseFloat(unitCost))}</span>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-blue-200">
                        <span className="text-blue-900 font-semibold">Total Cost:</span>
                        <span className="font-bold text-lg ml-2">{formatCurrency(totalCost)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview */}
                {restockQty > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-green-900 mb-1">Restock Preview</p>
                    <p className="text-sm">
                      <span className="font-medium">{item.quantity} {item.unit}</span>
                      {' + '}
                      <span className="font-medium text-green-700">{restockQty} {item.unit}</span>
                      {' = '}
                      <span className="font-bold text-lg">{newQuantity} {item.unit}</span>
                    </p>
                  </div>
                )}

                {/* Form Actions */}
                <hr className="border-gray-300" />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !restockQuantity || parseFloat(restockQuantity) <= 0}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

