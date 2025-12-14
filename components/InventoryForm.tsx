'use client';

import { useState, FormEvent } from 'react';

interface InventoryFormProps {
  initialData?: {
    name?: string;
    category?: 'medicine' | 'supply' | 'equipment' | 'other';
    sku?: string;
    quantity?: number;
    unit?: string;
    reorderLevel?: number;
    reorderQuantity?: number;
    unitCost?: number;
    supplier?: string;
    expiryDate?: string;
    location?: string;
    notes?: string;
  };
  onSubmit: (data: any) => void;
  onCancel?: () => void;
  isEdit?: boolean;
}

export default function InventoryForm({
  initialData,
  onSubmit,
  onCancel,
  isEdit = false,
}: InventoryFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    category: initialData?.category || 'medicine' as 'medicine' | 'supply' | 'equipment' | 'other',
    sku: initialData?.sku || '',
    quantity: initialData?.quantity || 0,
    unit: initialData?.unit || 'pieces',
    reorderLevel: initialData?.reorderLevel || 10,
    reorderQuantity: initialData?.reorderQuantity || 50,
    unitCost: initialData?.unitCost || 0,
    supplier: initialData?.supplier || '',
    expiryDate: initialData?.expiryDate || '',
    location: initialData?.location || '',
    notes: initialData?.notes || '',
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert('Please enter an item name');
      return;
    }

    if (formData.quantity < 0) {
      alert('Quantity cannot be negative');
      return;
    }

    if (formData.reorderLevel < 0) {
      alert('Reorder level cannot be negative');
      return;
    }

    if (formData.unitCost < 0) {
      alert('Unit cost cannot be negative');
      return;
    }

    const submitData: any = {
      name: formData.name.trim(),
      category: formData.category,
      quantity: formData.quantity,
      unit: formData.unit.trim(),
      reorderLevel: formData.reorderLevel,
      reorderQuantity: formData.reorderQuantity,
      unitCost: formData.unitCost,
    };

    if (formData.sku.trim()) {
      submitData.sku = formData.sku.trim();
    }
    if (formData.supplier.trim()) {
      submitData.supplier = formData.supplier.trim();
    }
    if (formData.expiryDate) {
      submitData.expiryDate = formData.expiryDate;
    }
    if (formData.location.trim()) {
      submitData.location = formData.location.trim();
    }
    if (formData.notes.trim()) {
      submitData.notes = formData.notes.trim();
    }

    onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        {/* Basic Information */}
        <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 border border-teal-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-teal-500 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Basic Information</h3>
          </div>
          <div className="flex flex-col md:flex-row gap-4 flex-wrap">
            {/* Item Name */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Item Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter item name"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>

            {/* Category */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Category <span className="text-red-600">*</span>
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm bg-white"
              >
                <option value="medicine">Medicine</option>
                <option value="supply">Supply</option>
                <option value="equipment">Equipment</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* SKU */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-700 mb-2">SKU (Stock Keeping Unit)</label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="Enter SKU"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>
          </div>
        </div>

        {/* Stock Information */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Stock Information</h3>
          </div>
          <div className="flex flex-col md:flex-row gap-4 flex-wrap">

            {/* Quantity */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Quantity <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                placeholder="0"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>

            {/* Unit */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Unit <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                placeholder="pieces, boxes, bottles, etc."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>

            {/* Unit Cost */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-700 mb-2">Unit Cost</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.unitCost}
                onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>

            {/* Reorder Level */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Reorder Level <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.reorderLevel}
                onChange={(e) => setFormData({ ...formData, reorderLevel: parseInt(e.target.value) || 0 })}
                placeholder="10"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
              <p className="text-xs text-gray-600 mt-1.5 font-medium">Minimum quantity before reordering</p>
            </div>

            {/* Reorder Quantity */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-700 mb-2">Reorder Quantity</label>
              <input
                type="number"
                min="0"
                value={formData.reorderQuantity}
                onChange={(e) => setFormData({ ...formData, reorderQuantity: parseInt(e.target.value) || 0 })}
                placeholder="50"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
              <p className="text-xs text-gray-600 mt-1.5 font-medium">Quantity to order when reordering</p>
            </div>
          </div>
        </div>

        {/* Additional Information */}
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Additional Information</h3>
          </div>
          <div className="flex flex-col md:flex-row gap-4 flex-wrap">

            {/* Supplier */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-700 mb-2">Supplier</label>
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                placeholder="Enter supplier name"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>

            {/* Expiry Date */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-700 mb-2">Expiry Date</label>
              <input
                type="date"
                value={formData.expiryDate}
                onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm"
              />
              <p className="text-xs text-gray-600 mt-1.5 font-medium">For medicines with expiry dates</p>
            </div>

            {/* Location */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-700 mb-2">Storage Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g., Room A, Shelf 3"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gray-500 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Notes</h3>
          </div>
          <textarea
            rows={3}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Additional notes about this item"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all text-sm resize-y"
          />
        </div>

        {/* Form Actions */}
        <hr className="border-gray-200" />
        <div className="flex justify-end gap-3 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold border border-gray-200"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="px-4 py-2.5 text-sm bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all font-semibold shadow-md"
          >
            {isEdit ? 'Update Item' : 'Add Item'}
          </button>
        </div>
      </div>
    </form>
  );
}
