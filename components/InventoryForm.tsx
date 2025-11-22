'use client';

import { useState, FormEvent } from 'react';
// Radix UI components not used - using native HTML form elements

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
}

export default function InventoryForm({
  initialData,
  onSubmit,
  onCancel,
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Item Name */}
        <div>
          <label htmlFor="name" className="block text-xs font-medium text-gray-700 mb-1">
            Item Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter item name"
          />
        </div>

        {/* Category */}
        <div>
          <label htmlFor="category" className="block text-xs font-medium text-gray-700 mb-1">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            id="category"
            required
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
            className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="medicine">Medicine</option>
            <option value="supply">Supply</option>
            <option value="equipment">Equipment</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* SKU */}
        <div>
          <label htmlFor="sku" className="block text-xs font-medium text-gray-700 mb-1">
            SKU (Stock Keeping Unit)
          </label>
          <input
            type="text"
            id="sku"
            value={formData.sku}
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter SKU"
          />
        </div>

        {/* Quantity */}
        <div>
          <label htmlFor="quantity" className="block text-xs font-medium text-gray-700 mb-1">
            Quantity <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            id="quantity"
            required
            min="0"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
            className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0"
          />
        </div>

        {/* Unit */}
        <div>
          <label htmlFor="unit" className="block text-xs font-medium text-gray-700 mb-1">
            Unit <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="unit"
            required
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="pieces, boxes, bottles, etc."
          />
        </div>

        {/* Unit Cost */}
        <div>
          <label htmlFor="unitCost" className="block text-xs font-medium text-gray-700 mb-1">
            Unit Cost
          </label>
          <input
            type="number"
            id="unitCost"
            min="0"
            step="0.01"
            value={formData.unitCost}
            onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })}
            className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0.00"
          />
        </div>

        {/* Reorder Level */}
        <div>
          <label htmlFor="reorderLevel" className="block text-xs font-medium text-gray-700 mb-1">
            Reorder Level <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            id="reorderLevel"
            required
            min="0"
            value={formData.reorderLevel}
            onChange={(e) => setFormData({ ...formData, reorderLevel: parseInt(e.target.value) || 0 })}
            className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="10"
          />
          <p className="mt-1 text-xs text-gray-500">Minimum quantity before reordering</p>
        </div>

        {/* Reorder Quantity */}
        <div>
          <label htmlFor="reorderQuantity" className="block text-xs font-medium text-gray-700 mb-1">
            Reorder Quantity
          </label>
          <input
            type="number"
            id="reorderQuantity"
            min="0"
            value={formData.reorderQuantity}
            onChange={(e) => setFormData({ ...formData, reorderQuantity: parseInt(e.target.value) || 0 })}
            className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="50"
          />
          <p className="mt-1 text-xs text-gray-500">Quantity to order when reordering</p>
        </div>

        {/* Supplier */}
        <div>
          <label htmlFor="supplier" className="block text-xs font-medium text-gray-700 mb-1">
            Supplier
          </label>
          <input
            type="text"
            id="supplier"
            value={formData.supplier}
            onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
            className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter supplier name"
          />
        </div>

        {/* Expiry Date */}
        <div>
          <label htmlFor="expiryDate" className="block text-xs font-medium text-gray-700 mb-1">
            Expiry Date
          </label>
          <input
            type="date"
            id="expiryDate"
            value={formData.expiryDate}
            onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
            className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">For medicines with expiry dates</p>
        </div>

        {/* Location */}
        <div>
          <label htmlFor="location" className="block text-xs font-medium text-gray-700 mb-1">
            Storage Location
          </label>
          <input
            type="text"
            id="location"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Room A, Shelf 3"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-xs font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="block w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Additional notes about this item"
        />
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Add Item
        </button>
      </div>
    </form>
  );
}

