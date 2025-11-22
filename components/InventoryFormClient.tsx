'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import InventoryForm from './InventoryForm';

export default function InventoryFormClient() {
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (formData: any) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        router.push('/inventory');
      } else {
        alert(data.error || 'Failed to create inventory item');
      }
    } catch (error) {
      console.error('Failed to create inventory item:', error);
      alert('Failed to create inventory item. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/inventory');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-3">
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-0.5">
            <button
              onClick={handleCancel}
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-900">New Inventory Item</h1>
          </div>
          <p className="text-gray-600 text-xs ml-7">Add a new item to inventory</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
          {submitting ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
                <p className="mt-3 text-sm text-gray-600">Creating inventory item...</p>
              </div>
            </div>
          ) : (
            <InventoryForm
              onSubmit={handleSubmit}
              onCancel={handleCancel}
            />
          )}
        </div>
      </div>
    </div>
  );
}

