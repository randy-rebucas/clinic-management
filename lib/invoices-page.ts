import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { getPermissionChecker } from '@/app/lib/auth-helpers';

export interface InvoicesPagePermissions {
  /** Create invoices and record payments (invoices:write). */
  canWrite: boolean;
}

export interface InvoiceDetailPermissions {
  /** Record a payment (invoices:write, the payment route's check). */
  canPay: boolean;
  /** Mark refunded (invoices:update, the PUT route's check). */
  canRefund: boolean;
  canSeePatient: boolean;
  canSeeVisit: boolean;
}

async function checker() {
  const session = await verifySession();
  if (!session) redirect('/login');
  const can = await getPermissionChecker(session);
  if (!can('invoices', 'read')) redirect('/dashboard?error=access_denied');
  return can;
}

export async function loadInvoicesPagePermissions(): Promise<InvoicesPagePermissions> {
  const can = await checker();
  return { canWrite: can('invoices', 'write') };
}

export async function loadInvoiceDetailPermissions(): Promise<InvoiceDetailPermissions> {
  const can = await checker();
  return {
    canPay: can('invoices', 'write'),
    canRefund: can('invoices', 'update'),
    canSeePatient: can('patients', 'read'),
    canSeeVisit: can('visits', 'read'),
  };
}

/** The new-invoice page: invoices:write (no role is granted a separate "create"). */
export async function requireInvoiceWriter(): Promise<{ canSeePatient: boolean }> {
  const can = await checker();
  if (!can('invoices', 'write')) redirect('/dashboard?error=access_denied');
  return { canSeePatient: can('patients', 'read') };
}
