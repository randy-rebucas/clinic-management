import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Invoice from '@/models/Invoice';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';

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
    
    // Get tenant context from session or headers
    const { getTenantContext } = await import('@/lib/tenant');
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    const { Types } = await import('mongoose');
    
    const { id } = await params;
    
    // Build query with tenant filter
    const patientQuery: any = { _id: id };
    if (tenantId) {
      patientQuery.tenantIds = new Types.ObjectId(tenantId);
    } else {
      patientQuery.$or = [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }];
    }
    
    const patient = await Patient.findOne(patientQuery);

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    const alerts: Array<{
      type: 'allergy' | 'unpaid_balance' | 'critical_condition' | 'missing_info';
      severity: 'high' | 'medium' | 'low';
      message: string;
      details?: any;
    }> = [];

    // Check for allergies
    if (patient.allergies && patient.allergies.length > 0) {
      const hasSevereAllergy = patient.allergies.some((allergy: any) => {
        if (typeof allergy === 'object' && allergy.severity) {
          return String(allergy.severity).toLowerCase() === 'severe' || String(allergy.severity).toLowerCase() === 'high';
        }
        return false;
      });

      if (hasSevereAllergy) {
        alerts.push({
          type: 'allergy',
          severity: 'high',
          message: 'Patient has severe allergies - review before prescribing medications',
          details: {
            allergies: patient.allergies,
          },
        });
      } else {
        alerts.push({
          type: 'allergy',
          severity: 'medium',
          message: `Patient has ${patient.allergies.length} known allergy/allergies`,
          details: {
            allergies: patient.allergies,
          },
        });
      }
    }

    // Check for unpaid balances (tenant-scoped)
    const invoiceQuery: any = {
      patient: id,
      status: { $in: ['unpaid', 'partial'] },
    };
    if (tenantId) {
      invoiceQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      invoiceQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const unpaidInvoices = await Invoice.find(invoiceQuery);

    if (unpaidInvoices.length > 0) {
      const totalUnpaid = unpaidInvoices.reduce((sum: number, invoice: any) => {
        const paid = invoice.payments?.reduce((pSum: number, payment: any) => pSum + (payment.amount || 0), 0) || 0;
        const total = invoice.total || 0;
        return sum + (total - paid);
      }, 0);

      if (totalUnpaid > 0) {
        const settings = await getSettings();
        const currency = settings.billingSettings?.currency || 'PHP';
        const formattedAmount = new Intl.NumberFormat('en-PH', {
          style: 'currency',
          currency: currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(totalUnpaid);

        alerts.push({
          type: 'unpaid_balance',
          severity: totalUnpaid > 10000 ? 'high' : 'medium',
          message: `Patient has unpaid balance: ${formattedAmount}`,
          details: {
            totalUnpaid,
            invoiceCount: unpaidInvoices.length,
            invoices: unpaidInvoices.map((inv) => ({
              invoiceNumber: inv.invoiceNumber,
              total: inv.total,
              status: inv.status,
            })),
          },
        });
      }
    }

    // Check for critical pre-existing conditions
    if (patient.preExistingConditions && patient.preExistingConditions.length > 0) {
      const criticalConditions = patient.preExistingConditions.filter(
        (condition: any) => condition.status === 'active' || condition.status === 'chronic'
      );

      if (criticalConditions.length > 0) {
        alerts.push({
          type: 'critical_condition',
          severity: 'high',
          message: `Patient has ${criticalConditions.length} active/chronic condition(s)`,
          details: {
            conditions: criticalConditions,
          },
        });
      }
    }

    // Check for missing critical information
    const missingInfo: string[] = [];
    if (!patient.emergencyContact?.name || !patient.emergencyContact?.phone) {
      missingInfo.push('Emergency contact information');
    }
    if (!patient.allergies || patient.allergies.length === 0) {
      missingInfo.push('Allergy information');
    }
    if (!patient.medicalHistory || patient.medicalHistory.trim().length === 0) {
      missingInfo.push('Medical history');
    }

    if (missingInfo.length > 0) {
      alerts.push({
        type: 'missing_info',
        severity: 'low',
        message: `Missing information: ${missingInfo.join(', ')}`,
        details: {
          missingFields: missingInfo,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        alerts,
        count: alerts.length,
        hasHighSeverity: alerts.some((a) => a.severity === 'high'),
      },
    });
  } catch (error: any) {
    console.error('Error fetching patient alerts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch patient alerts' },
      { status: 500 }
    );
  }
}

