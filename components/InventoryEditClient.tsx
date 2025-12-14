'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import InventoryForm from './InventoryForm';

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
}

export default function InventoryEditClient({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleSubmit = async (formData: any) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      if (res.status === 403) {
        alert('You do not have permission to edit inventory items');
        return;
      }

      const data = await res.json();
      if (data.success) {
        router.push(`/inventory/${itemId}`);
      } else {
        alert(data.error || 'Failed to update inventory item');
      }
    } catch (error) {
      console.error('Failed to update inventory item:', error);
      alert('Failed to update inventory item. Please try again.');
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

  // Format expiry date for input field (YYYY-MM-DD)
  const formattedExpiryDate = item.expiryDate 
    ? new Date(item.expiryDate).toISOString().split('T')[0]
    : '';

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-teal-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <button 
                onClick={handleCancel}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Edit Inventory Item</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">{item.name}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {submitting ? (
              <div className="flex flex-col items-center gap-4 min-h-[200px] justify-center p-12">
                <div className="relative">
                  <div className="animate-spin rounded-full h-16 w-16 border-4 border-teal-100 border-t-teal-600"></div>
                </div>
                <p className="text-sm text-gray-600 font-medium">Updating inventory item...</p>
              </div>
            ) : (
              <InventoryForm
                initialData={{
                  name: item.name,
                  category: item.category,
                  sku: item.sku,
                  quantity: item.quantity,
                  unit: item.unit,
                  reorderLevel: item.reorderLevel,
                  reorderQuantity: item.reorderQuantity,
                  unitCost: item.unitCost,
                  supplier: item.supplier,
                  expiryDate: formattedExpiryDate,
                  location: item.location,
                  notes: item.notes,
                }}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                isEdit={true}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

