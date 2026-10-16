import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import InventoryItem from '@/models/Inventory';
import { recordMovement } from '@/lib/inventory-movements';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, escapeRegex } from '@/lib/api/validate';
import { distribute, dispensedPerMedication, type DispenseItem } from '@/lib/prescription-dispense';

const dispenseSchema = z.object({
  pharmacyId: z.string().trim().max(100).optional(),
  pharmacyName: z.string().trim().max(200).optional(),
  dispensedBy: z.string().trim().max(200).optional(),
  // Legacy: one total, applied to the medications in order.
  quantityDispensed: z.coerce.number().int().min(0).max(100000).optional(),
  // Preferred: explicit per-medication quantities.
  items: z.array(z.object({
    medicationIndex: z.number().int().min(0).max(200),
    quantity: z.number().int().min(1).max(100000),
  })).max(200).optional(),
  notes: z.string().max(2000).optional(),
  trackingNumber: z.string().trim().max(200).optional(),
});

type Item = DispenseItem;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'prescriptions', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Prescription');

    const parsed = await parseBody(request, dispenseSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const prescription = await Prescription.findOne(tenantFilter(tenantId, { _id: id }));
    if (!prescription) return notFound('Prescription');

    if (prescription.status === 'cancelled') {
      return NextResponse.json({ success: false, error: 'Cancelled prescriptions cannot be dispensed' }, { status: 409 });
    }
    if (prescription.status === 'dispensed' || prescription.status === 'completed') {
      return NextResponse.json({ success: false, error: 'This prescription has already been fully dispensed' }, { status: 409 });
    }

    const medications: any[] = prescription.medications || [];
    const prescribed = medications.map((m) => Math.max(0, Number(m.quantity) || 0));
    const already = dispensedPerMedication(prescribed, prescription.pharmacyDispenses || []);

    let items: Item[];
    if (body.items && body.items.length) {
      items = [];
      for (const it of body.items) {
        if (it.medicationIndex >= medications.length) {
          return NextResponse.json({ success: false, error: 'Invalid medication index' }, { status: 400 });
        }
        const remaining = prescribed[it.medicationIndex] - already[it.medicationIndex];
        if (prescribed[it.medicationIndex] > 0 && it.quantity > remaining) {
          return NextResponse.json(
            { success: false, error: `Quantity for ${medications[it.medicationIndex].name} exceeds the remaining ${Math.max(0, remaining)}` },
            { status: 400 }
          );
        }
        items.push(it);
      }
    } else {
      const total = body.quantityDispensed || 0;
      const remainingTotal = prescribed.reduce((s, q, i) => s + Math.max(0, q - already[i]), 0);
      if (total > remainingTotal && remainingTotal > 0) {
        return NextResponse.json(
          { success: false, error: `Quantity exceeds the remaining ${remainingTotal}` },
          { status: 400 }
        );
      }
      items = distribute(total, prescribed, already);
      // Medications without a prescribed quantity: a single-medication prescription takes the whole amount.
      if (items.length === 0 && total > 0 && medications.length === 1) {
        items = [{ medicationIndex: 0, quantity: total }];
      }
    }

    const quantityDispensed = items.reduce((s, it) => s + it.quantity, 0);
    if (quantityDispensed <= 0) {
      return NextResponse.json({ success: false, error: 'Enter a quantity to dispense' }, { status: 400 });
    }

    // Deduct stock first; a shortage of a stocked item blocks the dispense.
    const warnings: string[] = [];
    const deducted: Array<{ itemId: Types.ObjectId; quantity: number; after: number }> = [];
    for (const it of items) {
      const med = medications[it.medicationIndex];
      // A stock item linked to the medicine, or else one not linked to any medicine with the same name.
      const byName = { name: new RegExp(`^${escapeRegex(String(med.name || '').trim())}$`, 'i') };
      const match: Record<string, unknown> = med.medicineId
        ? { $or: [{ medicineId: med.medicineId }, { medicineId: null, ...byName }] }
        : byName;
      const stockItem = await InventoryItem.findOne(tenantFilter(tenantObjectId, { category: 'medicine', ...match }))
        .sort({ medicineId: -1 }) // the linked item first
        .select('_id quantity')
        .lean() as any;
      if (!stockItem) {
        warnings.push(`No inventory item matches ${med.name}; stock was not deducted.`);
        continue;
      }
      const updated = await InventoryItem.findOneAndUpdate(
        { _id: stockItem._id, tenantId: tenantObjectId, quantity: { $gte: it.quantity } },
        { $inc: { quantity: -it.quantity } },
        { new: true }
      );
      if (!updated) {
        for (const d of deducted) {
          await InventoryItem.updateOne({ _id: d.itemId, tenantId: tenantObjectId }, { $inc: { quantity: d.quantity } });
        }
        return NextResponse.json(
          { success: false, error: `Insufficient stock for ${med.name} (available: ${stockItem.quantity ?? 0})` },
          { status: 409 }
        );
      }
      deducted.push({ itemId: stockItem._id, quantity: it.quantity, after: updated.quantity });
    }

    // Every deduction held, so the stock ledger can record them against this prescription.
    for (const d of deducted) {
      await recordMovement({
        tenantId: tenantObjectId,
        item: d.itemId,
        type: 'dispense',
        change: -d.quantity,
        quantityAfter: d.after,
        prescription: prescription._id,
        prescriptionCode: prescription.prescriptionCode,
        performedBy: session.userId,
      });
    }

    prescription.pharmacyDispenses = prescription.pharmacyDispenses || [];
    prescription.pharmacyDispenses.push({
      pharmacyId: body.pharmacyId,
      pharmacyName: body.pharmacyName,
      dispensedAt: new Date(),
      dispensedBy: body.dispensedBy || session.name || session.email || 'Pharmacy Staff',
      quantityDispensed,
      items,
      notes: body.notes,
      trackingNumber: body.trackingNumber,
    });

    const after = already.slice();
    for (const it of items) after[it.medicationIndex] += it.quantity;
    const tracked = prescribed.map((q, i) => ({ q, d: after[i] })).filter((x) => x.q > 0);
    const fullyDispensed = tracked.length > 0
      ? tracked.every((x) => x.d >= x.q)
      : after.every((d) => d > 0);
    prescription.status = fullyDispensed ? 'dispensed' : 'partially-dispensed';

    await prescription.save();

    await prescription.populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } });
    await prescription.populate({ path: 'prescribedBy', select: 'name email', match: { tenantId: tenantObjectId } });

    return NextResponse.json({ success: true, data: prescription, warnings });
  } catch (error: any) {
    console.error('Error recording dispense:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record dispense' },
      { status: 500 }
    );
  }
}
