import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { requireAdmin } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { isAuditKind, isAuditResource, isAuditShow } from '@/lib/audit-log';
import AuditLogClient, { type AuditStart } from '@/components/admin/AuditLogClient';

const isId = (v: unknown): v is string => typeof v === 'string' && Types.ObjectId.isValid(v);
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * /admin/audit-logs — the clinic's audit log, for administrators and owners (owners were
 * redirected away before, though the API let them read it). Accepts ?kind=, ?show=, ?user=,
 * ?patient=, ?resource=, ?from=, ?to= so other pages can link straight to a view.
 */
export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const session = await verifySession();
  if (!session) redirect('/login');
  const q = await searchParams;

  await connectDB();
  const tenantId = session.tenantId && Types.ObjectId.isValid(session.tenantId) ? new Types.ObjectId(session.tenantId) : null;
  const [settings, patient] = await Promise.all([
    getSettings(session.tenantId),
    isId(q.patient) && tenantId
      ? Patient.findOne({ _id: q.patient, tenantIds: tenantId })
          .select('firstName lastName patientCode')
          .lean<{ _id: Types.ObjectId; firstName: string; lastName: string; patientCode?: string } | null>()
      : Promise.resolve(null),
  ]);

  const start: AuditStart = {
    kind: isAuditKind(q.kind) ? q.kind : '',
    show: isAuditShow(q.show) ? q.show : '',
    resource: isAuditResource(q.resource) ? q.resource : '',
    user: isId(q.user) ? q.user : '',
    patient: patient
      ? { _id: patient._id.toString(), firstName: patient.firstName, lastName: patient.lastName, patientCode: patient.patientCode }
      : null,
    from: isDay(q.from) ? q.from : '',
    to: isDay(q.to) ? q.to : '',
  };

  return (
    <AuditLogClient
      meId={session.userId}
      start={start}
      retentionOn={settings?.automationSettings?.autoDataRetention !== false}
    />
  );
}
