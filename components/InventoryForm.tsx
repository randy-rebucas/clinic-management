'use client';

import { useState, FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

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
            <Label htmlFor="itemName">Item Name <span className="text-red-500">*</span></Label>
            <Input
              id="itemName"
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter item name"
              style={{ all: 'unset', width: '100%' }}
            />
          </div>

          {/* Category */}
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="category">Category <span className="text-red-500">*</span></Label>
            <Select value={formData.category} onValueChange={value => setFormData({ ...formData, category: value as any })}>
              <SelectItem value="medicine">Medicine</SelectItem>
              <SelectItem value="supply">Supply</SelectItem>
              <SelectItem value="equipment">Equipment</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </Select>
          </div>

          {/* SKU */}
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="sku">SKU (Stock Keeping Unit)</Label>
            <Input
              id="sku"
              type="text"
              value={formData.sku}
              onChange={e => setFormData({ ...formData, sku: e.target.value })}
              placeholder="Enter SKU"
              style={{ all: 'unset', width: '100%' }}
            />
          </div>

          {/* Quantity */}
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="quantity">Quantity <span className="text-red-500">*</span></Label>
            <Input
              id="quantity"
              type="number"
              required
              min={0}
              value={formData.quantity}
              onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
              placeholder="0"
              style={{ all: 'unset', width: '100%' }}
            />
          </div>

          {/* Unit */}
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="unit">Unit <span className="text-red-500">*</span></Label>
            <Input
              id="unit"
              type="text"
              required
              value={formData.unit}
              onChange={e => setFormData({ ...formData, unit: e.target.value })}
              placeholder="pieces, boxes, bottles, etc."
              style={{ all: 'unset', width: '100%' }}
            />
          </div>

          {/* Unit Cost */}
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="unitCost">Unit Cost</Label>
            <Input
              id="unitCost"
              type="number"
              min={0}
              step={0.01}
              value={formData.unitCost}
              onChange={e => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              style={{ all: 'unset', width: '100%' }}
            />
          </div>

          {/* Reorder Level */}
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="reorderLevel">Reorder Level <span className="text-red-500">*</span></Label>
            <Input
              id="reorderLevel"
              type="number"
              required
              min={0}
              value={formData.reorderLevel}
              onChange={e => setFormData({ ...formData, reorderLevel: parseInt(e.target.value) || 0 })}
              placeholder="10"
              style={{ all: 'unset', width: '100%' }}
            />
            <p className="text-xs text-gray-500 mt-1">Minimum quantity before reordering</p>
          </div>

          {/* Reorder Quantity */}
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="reorderQuantity">Reorder Quantity</Label>
            <Input
              id="reorderQuantity"
              type="number"
              min={0}
              value={formData.reorderQuantity}
              onChange={e => setFormData({ ...formData, reorderQuantity: parseInt(e.target.value) || 0 })}
              placeholder="50"
              style={{ all: 'unset', width: '100%' }}
            />
            <p className="text-xs text-gray-500 mt-1">Quantity to order when reordering</p>
          </div>

          {/* Supplier */}
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="supplier">Supplier</Label>
            <Input
              id="supplier"
              type="text"
              value={formData.supplier}
              onChange={e => setFormData({ ...formData, supplier: e.target.value })}
              placeholder="Enter supplier name"
              style={{ all: 'unset', width: '100%' }}
            />
          </div>

          {/* Expiry Date */}
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="expiryDate">Expiry Date</Label>
            <Input
              id="expiryDate"
              type="date"
              value={formData.expiryDate}
              onChange={e => setFormData({ ...formData, expiryDate: e.target.value })}
              style={{ all: 'unset', width: '100%' }}
            />
            <p className="text-xs text-gray-500 mt-1">For medicines with expiry dates</p>
          </div>

          {/* Location */}
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="location">Storage Location</Label>
            <Input
              id="location"
              type="text"
              value={formData.location}
              onChange={e => setFormData({ ...formData, location: e.target.value })}
              placeholder="e.g., Room A, Shelf 3"
              style={{ all: 'unset', width: '100%' }}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            as="textarea"
            rows={3}
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Additional notes about this item"
            style={{ all: 'unset', width: '100%' }}
          />
        </div>

        {/* Form Actions */}
        <hr className="border-gray-300" />
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant="default">
            {isEdit ? 'Update Item' : 'Add Item'}
          </Button>
        </div>
      </div>
    </form>
  );
}
