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
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col md:flex-row gap-3 flex-wrap">
          {/* Item Name */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-2">
              Item Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter item name"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Category */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-2">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="medicine">Medicine</option>
              <option value="supply">Supply</option>
              <option value="equipment">Equipment</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* SKU */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-2">SKU (Stock Keeping Unit)</label>
            <input
              type="text"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              placeholder="Enter SKU"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Quantity */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-2">
              Quantity <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              required
              min="0"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
              placeholder="0"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Unit */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-2">
              Unit <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              placeholder="pieces, boxes, bottles, etc."
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Unit Cost */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-2">Unit Cost</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.unitCost}
              onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Reorder Level */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-2">
              Reorder Level <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              required
              min="0"
              value={formData.reorderLevel}
              onChange={(e) => setFormData({ ...formData, reorderLevel: parseInt(e.target.value) || 0 })}
              placeholder="10"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">Minimum quantity before reordering</p>
          </div>

          {/* Reorder Quantity */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-2">Reorder Quantity</label>
            <input
              type="number"
              min="0"
              value={formData.reorderQuantity}
              onChange={(e) => setFormData({ ...formData, reorderQuantity: parseInt(e.target.value) || 0 })}
              placeholder="50"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">Quantity to order when reordering</p>
          </div>

          {/* Supplier */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-2">Supplier</label>
            <input
              type="text"
              value={formData.supplier}
              onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
              placeholder="Enter supplier name"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Expiry Date */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-2">Expiry Date</label>
            <input
              type="date"
              value={formData.expiryDate}
              onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">For medicines with expiry dates</p>
          </div>

          {/* Location */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-2">Storage Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="e.g., Room A, Shelf 3"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium mb-2">Notes</label>
          <textarea
            rows={3}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Additional notes about this item"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
          />
        </div>

        {/* Form Actions */}
        <hr className="border-gray-300" />
        <div className="flex justify-end gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-medium transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
          >
            {isEdit ? 'Update Item' : 'Add Item'}
          </button>
        </div>
      </div>
    </form>
  );
}
