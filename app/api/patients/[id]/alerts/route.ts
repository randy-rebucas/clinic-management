import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import { getOutstandingBalanceForPatient } from '@/lib/data/invoice';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || null;

    const { id } = await params;

    // Patient is junction-scoped; look it up cross-tenant then verify
    // membership, same pattern as other Batch 3/4/5 routes.
    const patient = await runAsSystem(() => getPatientById(id));
    if (!patient || (tenantId && !patient.tenantIds?.some((tid: string) => tid === tenantId))) {
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

    // Check for unpaid balances — Invoice migration (this batch), via the
    // shared getOutstandingBalanceForPatient() helper in lib/data/invoice.ts.
    const { totalOutstanding, invoices: unpaidInvoices } = await run(tenantId, () =>
      getOutstandingBalanceForPatient(id)
    );

    if (unpaidInvoices.length > 0 && totalOutstanding > 0) {
      const settings = await getSettings(tenantId);
      const currency = settings.billingSettings?.currency || 'PHP';
      const formattedAmount = new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(totalOutstanding);

      alerts.push({
        type: 'unpaid_balance',
        severity: totalOutstanding > 10000 ? 'high' : 'medium',
        message: `Patient has unpaid balance: ${formattedAmount}`,
        details: {
          totalUnpaid: totalOutstanding,
          invoiceCount: unpaidInvoices.length,
          invoices: unpaidInvoices.map((inv: any) => ({
            invoiceNumber: inv.invoiceNumber,
            total: inv.total,
            status: inv.status,
          })),
        },
      });
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
