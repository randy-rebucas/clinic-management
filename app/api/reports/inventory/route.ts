import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import InventoryItem from '@/models/Inventory';
import Medicine from '@/models/Medicine';
import User from '@/models/User';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can view inventory reports
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const status = searchParams.get('status');

    let query: any = {};
    if (category) {
      query.category = category;
    }
    if (status) {
      query.status = status;
    }

    const items = await InventoryItem.find(query)
      .populate('medicineId', 'name genericName')
      .populate('lastRestockedBy', 'name')
      .sort({ name: 1 });

    // Calculate statistics
    const totalItems = items.length;
    const totalValue = items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
    
    const byStatus = items.reduce((acc: any, item) => {
      const status = item.status || 'in-stock';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const byCategory = items.reduce((acc: any, item) => {
      const category = item.category || 'other';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    // Low stock items
    const lowStockItems = items.filter(item => item.status === 'low-stock' || item.status === 'out-of-stock');
    
    // Expired items
    const expiredItems = items.filter(item => item.status === 'expired');
    
    // Items expiring soon (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringSoon = items.filter(item => 
      item.expiryDate && 
      item.expiryDate > new Date() && 
      item.expiryDate <= thirtyDaysFromNow
    );

    // Category value breakdown
    const categoryValue: Record<string, number> = {};
    items.forEach((item) => {
      const category = item.category || 'other';
      categoryValue[category] = (categoryValue[category] || 0) + (item.quantity * item.unitCost);
    });

    // Top items by value
    const topItemsByValue = items
      .map(item => ({
        _id: item._id,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalValue: item.quantity * item.unitCost,
        status: item.status,
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalItems,
          totalValue: parseFloat(totalValue.toFixed(2)),
          byStatus,
          byCategory,
          lowStockCount: lowStockItems.length,
          expiredCount: expiredItems.length,
          expiringSoonCount: expiringSoon.length,
        },
        items: items.map(item => ({
          _id: item._id,
          name: item.name,
          category: item.category,
          sku: item.sku,
          quantity: item.quantity,
          unit: item.unit,
          reorderLevel: item.reorderLevel,
          unitCost: item.unitCost,
          totalValue: item.quantity * item.unitCost,
          status: item.status,
          expiryDate: item.expiryDate,
          location: item.location,
          supplier: item.supplier,
        })),
        lowStockItems: lowStockItems.map(item => ({
          _id: item._id,
          name: item.name,
          quantity: item.quantity,
          reorderLevel: item.reorderLevel,
          reorderQuantity: item.reorderQuantity,
          unit: item.unit,
        })),
        expiredItems: expiredItems.map(item => ({
          _id: item._id,
          name: item.name,
          expiryDate: item.expiryDate,
          quantity: item.quantity,
        })),
        expiringSoon: expiringSoon.map(item => ({
          _id: item._id,
          name: item.name,
          expiryDate: item.expiryDate,
          daysUntilExpiry: Math.ceil(
            (new Date(item.expiryDate!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          ),
          quantity: item.quantity,
        })),
        categoryValue,
        topItemsByValue,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating inventory report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate inventory report' },
      { status: 500 }
    );
  }
}

