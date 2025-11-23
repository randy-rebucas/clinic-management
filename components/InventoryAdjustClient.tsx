'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface InventoryItem {
  _id: string;
  name: string;
  category: 'medicine' | 'supply' | 'equipment' | 'other';
  quantity: number;
  unit: string;
}

export default function InventoryAdjustClient({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract' | 'set'>('add');
  const [adjustmentAmount, setAdjustmentAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const router = useRouter();

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

  const calculateNewQuantity = () => {
    if (!item || !adjustmentAmount) return null;
    const amount = parseFloat(adjustmentAmount);
    if (isNaN(amount) || amount < 0) return null;

    switch (adjustmentType) {
      case 'add':
        return item.quantity + amount;
      case 'subtract':
        return Math.max(0, item.quantity - amount);
      case 'set':
        return amount;
      default:
        return null;
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!adjustmentAmount) {
      alert('Please enter an adjustment amount');
      return;
    }

    const amount = parseFloat(adjustmentAmount);
    if (isNaN(amount) || amount < 0) {
      alert('Please enter a valid positive number');
      return;
    }

    if (adjustmentType === 'subtract' && amount > item!.quantity) {
      alert(`Cannot subtract more than current quantity (${item!.quantity} ${item!.unit})`);
      return;
    }

    setSubmitting(true);
    try {
      let newQuantity: number;
      switch (adjustmentType) {
        case 'add':
          newQuantity = item!.quantity + amount;
          break;
        case 'subtract':
          newQuantity = Math.max(0, item!.quantity - amount);
          break;
        case 'set':
          newQuantity = amount;
          break;
        default:
          newQuantity = item!.quantity;
      }

      const res = await fetch(`/api/inventory/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity: newQuantity,
          notes: item!.notes 
            ? `${item!.notes}\n\nAdjustment (${adjustmentType} ${amount} ${item!.unit}): ${reason || 'No reason provided'}`
            : `Adjustment (${adjustmentType} ${amount} ${item!.unit}): ${reason || 'No reason provided'}`,
        }),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      if (res.status === 403) {
        alert('You do not have permission to adjust inventory items');
        return;
      }

      const data = await res.json();
      if (data.success) {
        router.push(`/inventory/${itemId}`);
      } else {
        alert(data.error || 'Failed to adjust inventory item');
      }
    } catch (error) {
      console.error('Failed to adjust inventory item:', error);
      alert('Failed to adjust inventory item. Please try again.');
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

  const newQuantity = calculateNewQuantity();

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
              <h1 className="text-3xl font-bold mb-1">Adjust Inventory</h1>
              <p className="text-sm text-gray-600">{item.name}</p>
            </div>
          </div>

          {/* Current Stock Info */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Current Quantity</p>
                <p className="text-2xl font-bold">{item.quantity} {item.unit}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Category</p>
                <p className="text-sm text-gray-900 capitalize">{item.category}</p>
              </div>
              {newQuantity !== null && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">New Quantity</p>
                  <p className={`text-2xl font-bold ${newQuantity < item.quantity ? 'text-red-600' : 'text-green-600'}`}>
                    {newQuantity} {item.unit}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Adjustment Form */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-4">
                {/* Adjustment Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Adjustment Type
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjustmentType('add')}
                      className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                        adjustmentType === 'add'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="font-medium">Add</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustmentType('subtract')}
                      className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                        adjustmentType === 'subtract'
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                        <span className="font-medium">Subtract</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustmentType('set')}
                      className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                        adjustmentType === 'set'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium">Set To</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Adjustment Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {adjustmentType === 'set' ? 'Set Quantity To' : 'Adjustment Amount'} <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {adjustmentType === 'add' && (
                      <span className="text-green-600 font-medium">+</span>
                    )}
                    {adjustmentType === 'subtract' && (
                      <span className="text-red-600 font-medium">-</span>
                    )}
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={adjustmentAmount}
                      onChange={(e) => setAdjustmentAmount(e.target.value)}
                      placeholder={adjustmentType === 'set' ? `Enter new quantity` : 'Enter amount'}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <span className="text-sm text-gray-500">{item.unit}</span>
                  </div>
                  {adjustmentType === 'subtract' && adjustmentAmount && parseFloat(adjustmentAmount) > item.quantity && (
                    <p className="text-xs text-red-600 mt-1">
                      Cannot subtract more than current quantity ({item.quantity} {item.unit})
                    </p>
                  )}
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason for Adjustment (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., Damaged items, Found in storage, etc."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
                  />
                </div>

                {/* Preview */}
                {newQuantity !== null && (
                  <div className={`p-3 rounded-lg border-2 ${
                    newQuantity < item.quantity 
                      ? 'bg-red-50 border-red-200' 
                      : newQuantity > item.quantity
                      ? 'bg-green-50 border-green-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <p className="text-sm font-medium">
                      {adjustmentType === 'add' && `Adding ${adjustmentAmount} ${item.unit} to current stock`}
                      {adjustmentType === 'subtract' && `Subtracting ${adjustmentAmount} ${item.unit} from current stock`}
                      {adjustmentType === 'set' && `Setting quantity to ${adjustmentAmount} ${item.unit}`}
                    </p>
                    <p className="text-sm mt-1">
                      <span className="font-medium">{item.quantity} {item.unit}</span>
                      {' → '}
                      <span className="font-bold">{newQuantity} {item.unit}</span>
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
                    disabled={submitting || !adjustmentAmount || (adjustmentType === 'subtract' && parseFloat(adjustmentAmount) > item.quantity)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Adjusting...' : 'Apply Adjustment'}
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

