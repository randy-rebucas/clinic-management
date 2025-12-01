import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import Invoice from '@/models/Invoice';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const { id } = await params;
    
    if (!id || id === 'undefined') {
      return NextResponse.json(
        { success: false, error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }

    let invoice = await Invoice.findById(id)
      .populate('patient', 'firstName lastName patientCode email phone dateOfBirth address')
      .populate('visit', 'visitCode date visitType')
      .populate('createdBy', 'name email');

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Manually populate items.serviceId if needed (convert to plain object first)
    const invoiceData = invoice.toObject ? invoice.toObject() : invoice;
    
    // Populate serviceId for each item if it exists
    if (invoiceData.items && Array.isArray(invoiceData.items)) {
      const Service = mongoose.models.Service;
      if (Service) {
        const populatedItems = await Promise.all(
          invoiceData.items.map(async (item: any) => {
            if (item.serviceId && typeof item.serviceId === 'object' && item.serviceId._id) {
              // Already populated
              return item;
            }
            if (item.serviceId && typeof item.serviceId === 'string') {
              try {
                const service = await Service.findById(item.serviceId)
                  .select('name code category unitPrice')
                  .lean();
                if (service) {
                  item.serviceId = service;
                }
              } catch (err) {
                // Silently skip if service not found
              }
            }
            return item;
          })
        );
        invoiceData.items = populatedItems;
      }
    }

    return NextResponse.json({ success: true, data: invoiceData });
  } catch (error: any) {
    console.error('Error fetching invoice:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch invoice',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    // Recalculate totals if items or discounts changed
    if (body.items || body.discounts) {
      const currentInvoice = await Invoice.findById(id);
      const items = body.items || currentInvoice?.items || [];
      const discounts = body.discounts || currentInvoice?.discounts || [];

      const subtotal = items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
      const discountTotal = discounts.reduce((sum: number, disc: any) => sum + (disc.amount || 0), 0);
      const afterDiscount = subtotal - discountTotal;
      const tax = body.tax || currentInvoice?.tax || 0;
      const total = afterDiscount + tax;

      body.subtotal = subtotal;
      body.total = total;

      // Recalculate outstanding balance
      const totalPaid = currentInvoice?.payments?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0;
      body.outstandingBalance = total - totalPaid;
      body.totalPaid = totalPaid;

      // Update status based on payments
      if (body.outstandingBalance <= 0) {
        body.status = 'paid';
      } else if (totalPaid > 0) {
        body.status = 'partial';
      } else {
        body.status = 'unpaid';
      }
    }

    const invoice = await Invoice.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    })
      .populate('patient', 'firstName lastName patientCode email phone')
      .populate('visit', 'visitCode date')
      .populate('createdBy', 'name email');

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    console.error('Error updating invoice:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update invoice' },
      { status: 500 }
    );
  }
}

