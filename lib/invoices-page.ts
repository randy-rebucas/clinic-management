import { redirect } from 'next/navigation';
import { isPayMongoConfigured } from '@/lib/paymongo';
import { isSMSConfigured } from '@/lib/sms';
import { verifySession } from '@/app/lib/dal';
import { denyPage, getPermissionChecker } from '@/app/lib/auth-helpers';

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
  /** Make a PayMongo payment link (invoices:write, and PayMongo set up on this server). */
  canSendPayLink: boolean;
  /** Texts can go out, so the link can be sent to the patient's phone. */
  canText: boolean;
}

async function checker() {
  const session = await verifySession();
  if (!session) redirect('/login');
  const can = await getPermissionChecker(session);
  if (!can('invoices', 'read')) await denyPage(session, 'invoices', 'read', '/dashboard?error=access_denied');
  return { session, can };
}

export async function loadInvoicesPagePermissions(): Promise<InvoicesPagePermissions> {
  const { can } = await checker();
  return { canWrite: can('invoices', 'write') };
}

export async function loadInvoiceDetailPermissions(): Promise<InvoiceDetailPermissions> {
  const { can } = await checker();
  return {
    canPay: can('invoices', 'write'),
    canRefund: can('invoices', 'update'),
    canSeePatient: can('patients', 'read'),
    canSeeVisit: can('visits', 'read'),
    canSendPayLink: can('invoices', 'write') && isPayMongoConfigured(),
    canText: isSMSConfigured(),
  };
}

/** The new-invoice page: invoices:write (no role is granted a separate "create"). */
export async function requireInvoiceWriter(): Promise<{ canSeePatient: boolean }> {
  const { session, can } = await checker();
  if (!can('invoices', 'write')) await denyPage(session, 'invoices', 'write', '/dashboard?error=access_denied');
  return { canSeePatient: can('patients', 'read') };
}
