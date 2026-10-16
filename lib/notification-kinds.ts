// How notifications are grouped and named on the notifications page. Client-safe.

export const NOTIFICATION_TYPES = [
  'appointment',
  'visit',
  'prescription',
  'lab_result',
  'invoice',
  'reminder',
  'system',
  'broadcast',
  'visit_followup_reminder',
  'membership_expiry_reminder',
  'referral_followup_reminder',
  'referral_escalation',
  'patient_reengagement',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const TYPE_LABEL: Record<NotificationType, string> = {
  appointment: 'Appointment',
  visit: 'Visit',
  prescription: 'Prescription',
  lab_result: 'Lab result',
  invoice: 'Billing',
  reminder: 'Reminder',
  system: 'Clinic',
  broadcast: 'Announcement',
  visit_followup_reminder: 'Follow-up',
  membership_expiry_reminder: 'Membership',
  referral_followup_reminder: 'Referral',
  referral_escalation: 'Referral',
  patient_reengagement: 'Patient follow-up',
};

/** Filter groups: a handful of plain kinds instead of thirteen internal types. */
export const NOTIFICATION_GROUPS = {
  appointments: { label: 'Appointments', types: ['appointment'] },
  clinical: { label: 'Clinical', types: ['visit', 'prescription', 'lab_result', 'visit_followup_reminder'] },
  referrals: { label: 'Referrals', types: ['referral_followup_reminder', 'referral_escalation'] },
  billing: { label: 'Billing', types: ['invoice', 'membership_expiry_reminder'] },
  clinic: { label: 'Stock, documents & account', types: ['system'] },
  messages: { label: 'Reminders & announcements', types: ['reminder', 'broadcast', 'patient_reengagement'] },
} as const satisfies Record<string, { label: string; types: readonly NotificationType[] }>;
export type NotificationGroup = keyof typeof NOTIFICATION_GROUPS;
export const GROUP_KEYS = Object.keys(NOTIFICATION_GROUPS) as NotificationGroup[];

export function groupOf(type: string): NotificationGroup | null {
  for (const g of GROUP_KEYS) if ((NOTIFICATION_GROUPS[g].types as readonly string[]).includes(type)) return g;
  return null;
}

const ENTITY_PATH: Record<string, string> = {
  appointment: '/appointments',
  visit: '/visits',
  prescription: '/prescriptions',
  lab_result: '/lab-results',
  invoice: '/invoices',
  patient: '/patients',
};

/**
 * Where a notification leads: its own in-app link, else the record it is about. Only paths on
 * this site are followed (never an absolute or protocol-relative URL).
 */
export function notificationHref(n: { actionUrl?: string | null; relatedEntity?: { type?: string; id?: string } | null }): string | null {
  if (n.actionUrl && /^\/(?![/\\])/.test(n.actionUrl)) return n.actionUrl;
  const e = n.relatedEntity;
  if (e?.type && e.id && ENTITY_PATH[e.type]) return `${ENTITY_PATH[e.type]}/${e.id}`;
  return null;
}

/** Window event the page fires so the header's unread count follows without waiting for its poll. */
export const UNREAD_EVENT = 'notifications:unread';
