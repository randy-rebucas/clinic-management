import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
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
    const patient = await Patient.findById(id);

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
      const hasSevereAllergy = patient.allergies.some((allergy) => {
        if (typeof allergy === 'object' && allergy.severity) {
          return allergy.severity.toLowerCase() === 'severe' || allergy.severity.toLowerCase() === 'high';
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

    // Check for unpaid balances
    const unpaidInvoices = await Invoice.find({
      patient: id,
      status: { $in: ['unpaid', 'partial'] },
    });

    if (unpaidInvoices.length > 0) {
      const totalUnpaid = unpaidInvoices.reduce((sum, invoice) => {
        const paid = invoice.payments?.reduce((pSum, payment) => pSum + (payment.amount || 0), 0) || 0;
        const total = invoice.total || 0;
        return sum + (total - paid);
      }, 0);

      if (totalUnpaid > 0) {
        alerts.push({
          type: 'unpaid_balance',
          severity: totalUnpaid > 10000 ? 'high' : 'medium',
          message: `Patient has unpaid balance: ₱${totalUnpaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
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
        (condition) => condition.status === 'active' || condition.status === 'chronic'
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

