/**
 * The public shape of records in the REST API (/api/v1) and webhook payloads: snake_case,
 * ids as strings, dates as ISO strings, and only fields that are safe to hand to an
 * integration. Clinical history, identifiers, notes, credentials and video links stay out.
 */

type Doc = Record<string, any>;

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
const id = (v: unknown) => (v && typeof v === 'object' && '_id' in (v as Doc) ? String((v as Doc)._id) : v ? String(v) : null);
const ymd = (d: unknown) => (d ? new Date(d as string).toISOString().slice(0, 10) : null);

export function serializePatient(p: Doc) {
  return {
    id: String(p._id),
    object: 'patient' as const,
    patient_code: p.patientCode ?? null,
    first_name: p.firstName,
    middle_name: p.middleName ?? null,
    last_name: p.lastName,
    suffix: p.suffix ?? null,
    date_of_birth: ymd(p.dateOfBirth),
    sex: p.sex ?? null,
    email: p.email || null,
    phone: p.phone ?? null,
    address: {
      street: p.address?.street ?? null,
      city: p.address?.city ?? null,
      state: p.address?.state ?? null,
      zip_code: p.address?.zipCode ?? null,
    },
    active: p.active !== false,
    created_at: iso(p.createdAt),
    updated_at: iso(p.updatedAt),
  };
}

/** The clinic-local calendar day of an instant, YYYY-MM-DD. */
function localDay(d: unknown, tz: string): string | null {
  if (!d) return null;
  const date = new Date(d as string);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** `tz` is the clinic's timezone: appointment days are clinic-local. */
export function serializeAppointment(a: Doc, tz: string) {
  return {
    id: String(a._id),
    object: 'appointment' as const,
    appointment_code: a.appointmentCode ?? null,
    patient_id: id(a.patient),
    doctor_id: id(a.doctor),
    // appointmentDate holds the clinic day as UTC midnight (the UI sends YYYY-MM-DD);
    // scheduledAt is a real instant, so it is read in the clinic's timezone.
    date: a.appointmentDate ? ymd(a.appointmentDate) : localDay(a.scheduledAt, tz),
    time: a.appointmentTime ?? null,
    duration_minutes: a.duration ?? null,
    status: a.status,
    modality: a.modality ?? 'in-person',
    is_walk_in: !!a.isWalkIn,
    queue_number: a.queueNumber ?? null,
    reason: a.reason ?? null,
    created_at: iso(a.createdAt),
    updated_at: iso(a.updatedAt),
  };
}

export function serializeDoctor(d: Doc) {
  return {
    id: String(d._id),
    object: 'doctor' as const,
    title: d.title ?? null,
    first_name: d.firstName,
    last_name: d.lastName,
    specialization: d.specializationId && typeof d.specializationId === 'object' ? d.specializationId.name ?? null : null,
    department: d.department ?? null,
    status: d.status ?? 'active',
  };
}

export function serializeInvoice(i: Doc) {
  return {
    id: String(i._id),
    object: 'invoice' as const,
    invoice_number: i.invoiceNumber,
    patient_id: id(i.patient),
    visit_id: id(i.visit),
    status: i.status,
    subtotal: i.subtotal ?? null,
    total: i.total ?? 0,
    total_paid: i.totalPaid ?? 0,
    outstanding_balance: i.outstandingBalance ?? Math.max(0, (i.total ?? 0) - (i.totalPaid ?? 0)),
    items: (i.items ?? []).map((it: Doc) => ({
      description: it.description ?? it.name ?? null,
      quantity: it.quantity ?? 1,
      unit_price: it.unitPrice ?? it.price ?? null,
      amount: it.total ?? it.amount ?? null,
    })),
    created_at: iso(i.createdAt),
    updated_at: iso(i.updatedAt),
  };
}
