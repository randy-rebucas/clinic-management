'use client';

import { useState, FormEvent } from 'react';
import { Flex, Box, Text, TextField, Select, Button, Separator } from '@radix-ui/themes';

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
    <form onSubmit={handleSubmit}>
      <Flex direction="column" gap="4" p="4">
        <Flex direction={{ initial: 'column', md: 'row' }} gap="3" wrap="wrap">
          {/* Item Name */}
          <Box flexGrow="1" minWidth="200px">
            <Text size="2" weight="medium" mb="2" as="div">
              Item Name <Text color="red">*</Text>
            </Text>
            <TextField.Root size="2">
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter item name"
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>

          {/* Category */}
          <Box flexGrow="1" minWidth="200px">
            <Text size="2" weight="medium" mb="2" as="div">
              Category <Text color="red">*</Text>
            </Text>
            <Select.Root
              size="2"
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value as any })}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="medicine">Medicine</Select.Item>
                <Select.Item value="supply">Supply</Select.Item>
                <Select.Item value="equipment">Equipment</Select.Item>
                <Select.Item value="other">Other</Select.Item>
              </Select.Content>
            </Select.Root>
          </Box>

          {/* SKU */}
          <Box flexGrow="1" minWidth="200px">
            <Text size="2" weight="medium" mb="2" as="div">SKU (Stock Keeping Unit)</Text>
            <TextField.Root size="2">
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="Enter SKU"
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>

          {/* Quantity */}
          <Box flexGrow="1" minWidth="200px">
            <Text size="2" weight="medium" mb="2" as="div">
              Quantity <Text color="red">*</Text>
            </Text>
            <TextField.Root size="2" type="number">
              <input
                type="number"
                required
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                placeholder="0"
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>

          {/* Unit */}
          <Box flexGrow="1" minWidth="200px">
            <Text size="2" weight="medium" mb="2" as="div">
              Unit <Text color="red">*</Text>
            </Text>
            <TextField.Root size="2">
              <input
                type="text"
                required
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                placeholder="pieces, boxes, bottles, etc."
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>

          {/* Unit Cost */}
          <Box flexGrow="1" minWidth="200px">
            <Text size="2" weight="medium" mb="2" as="div">Unit Cost</Text>
            <TextField.Root size="2" type="number">
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.unitCost}
                onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>

          {/* Reorder Level */}
          <Box flexGrow="1" minWidth="200px">
            <Text size="2" weight="medium" mb="2" as="div">
              Reorder Level <Text color="red">*</Text>
            </Text>
            <TextField.Root size="2" type="number">
              <input
                type="number"
                required
                min="0"
                value={formData.reorderLevel}
                onChange={(e) => setFormData({ ...formData, reorderLevel: parseInt(e.target.value) || 0 })}
                placeholder="10"
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
            <Text size="1" color="gray" mt="1" as="div">Minimum quantity before reordering</Text>
          </Box>

          {/* Reorder Quantity */}
          <Box flexGrow="1" minWidth="200px">
            <Text size="2" weight="medium" mb="2" as="div">Reorder Quantity</Text>
            <TextField.Root size="2" type="number">
              <input
                type="number"
                min="0"
                value={formData.reorderQuantity}
                onChange={(e) => setFormData({ ...formData, reorderQuantity: parseInt(e.target.value) || 0 })}
                placeholder="50"
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
            <Text size="1" color="gray" mt="1" as="div">Quantity to order when reordering</Text>
          </Box>

          {/* Supplier */}
          <Box flexGrow="1" minWidth="200px">
            <Text size="2" weight="medium" mb="2" as="div">Supplier</Text>
            <TextField.Root size="2">
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                placeholder="Enter supplier name"
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>

          {/* Expiry Date */}
          <Box flexGrow="1" minWidth="200px">
            <Text size="2" weight="medium" mb="2" as="div">Expiry Date</Text>
            <TextField.Root size="2" type="date">
              <input
                type="date"
                value={formData.expiryDate}
                onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
            <Text size="1" color="gray" mt="1" as="div">For medicines with expiry dates</Text>
          </Box>

          {/* Location */}
          <Box flexGrow="1" minWidth="200px">
            <Text size="2" weight="medium" mb="2" as="div">Storage Location</Text>
            <TextField.Root size="2">
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g., Room A, Shelf 3"
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>
        </Flex>

        {/* Notes */}
        <Box>
          <Text size="2" weight="medium" mb="2" as="div">Notes</Text>
          <TextField.Root size="2">
            <textarea
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this item"
              style={{
                all: 'unset',
                flex: 1,
                width: '100%',
                minHeight: '60px',
                resize: 'vertical',
              }}
            />
          </TextField.Root>
        </Box>

        {/* Form Actions */}
        <Separator />
        <Flex justify="end" gap="2">
          {onCancel && (
            <Button type="button" variant="soft" onClick={onCancel} size="2">
              Cancel
            </Button>
          )}
          <Button type="submit" size="2">
            Add Item
          </Button>
        </Flex>
      </Flex>
    </form>
  );
}

