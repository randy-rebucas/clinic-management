/**
 * The automations /admin/settings can switch, in words that match what the code does (traced
 * through lib/automations/* and vercel.json). Times in `when` are written `{HH:MM}` in UTC, the
 * cron's own clock, and shown in the clinic's zone. Client-safe.
 *
 * Left out on purpose:
 *   - autoAppointmentConfirmation: nothing calls the code that reads it.
 *   - autoBroadcastMessaging: a gate on POST /api/broadcast, which no screen uses.
 */

export type AutomationGroupKey = 'appointments' | 'patients' | 'billing' | 'stock' | 'reports' | 'records';
export interface AutomationGroup {
  key: AutomationGroupKey;
  title: string;
}

export const AUTOMATION_GROUPS: AutomationGroup[] = [
  { key: 'appointments', title: 'Bookings and the queue' },
  { key: 'patients', title: 'Messages to patients' },
  { key: 'billing', title: 'Billing' },
  { key: 'stock', title: 'Stock' },
  { key: 'reports', title: 'Reports to staff' },
  { key: 'records', title: 'Records' },
];

export interface Automation {
  key: string;
  group: AutomationGroupKey;
  label: string;
  /** What it does when on. */
  does: string;
  /** When it runs; `{HH:MM}` is a UTC time shown in the clinic's zone. */
  when: string;
  /** What the code does with no stored value. */
  defaultOn: boolean;
  /** A risk worth reading before leaving it on (shown while on). */
  caution?: string;
}

export const AUTOMATIONS: Automation[] = [
  // Bookings and the queue
  {
    key: 'autoFollowupScheduling',
    group: 'appointments',
    label: 'Book follow-ups',
    does: 'When a visit is closed with a follow-up date, books that day at 9:00 AM for 30 minutes with the same doctor, and texts and emails the patient. Skipped if they already have a booking that day.',
    when: 'When a visit is closed, and a daily check at {03:00}.',
    defaultOn: true,
  },
  {
    key: 'autoWaitlistManagement',
    group: 'appointments',
    label: 'Give cancelled slots to the waitlist',
    does: 'When a booking more than an hour away is cancelled, books the slot for the first matching patient on the waitlist and texts and emails them a link to confirm.',
    when: 'When a booking is cancelled, and every 15 minutes.',
    defaultOn: true,
    caution: 'The slot is booked before the patient says yes.',
  },
  {
    key: 'autoNoShowHandling',
    group: 'appointments',
    label: 'Mark no-shows and offer to rebook',
    does: 'An hour after a booking started (or its length, if longer) with no sign of the patient, marks it a no-show and texts and emails them a link to rebook. Bookings nobody attended are still marked no-show at the end of the day when this is off; only the message stops.',
    when: 'Every 30 minutes from {00:10} to {14:40}.',
    defaultOn: true,
  },
  {
    key: 'autoSmartAssignment',
    group: 'appointments',
    label: 'Choose a doctor for unassigned bookings',
    does: 'Gives a booking made without a doctor to the active doctor with the lightest load, preferring one who has seen the patient before.',
    when: 'When a booking is made, and hourly.',
    defaultOn: true,
    caution: 'Doctors’ hours and time off aren’t checked, so a booking can go to someone who isn’t working that day.',
  },
  {
    key: 'autoRecurringAppointments',
    group: 'appointments',
    label: 'Repeat recurring bookings',
    does: 'When a finished booking’s notes say it is recurring, books the next one at the same time (weekly, every two weeks, monthly, quarterly or yearly as the notes say; monthly otherwise) and tells the patient.',
    when: 'Daily at {05:00}.',
    defaultOn: true,
    caution: 'Any note containing “recur”, such as “recurrent cough”, starts a monthly series, and a series never ends on its own.',
  },
  {
    key: 'autoQueueOptimization',
    group: 'appointments',
    label: 'Reorder the queue',
    does: 'Moves waiting patients who didn’t ask for a particular doctor to a free doctor of the same specialty with a shorter line, and gives rooms out when that setting is on.',
    when: 'When someone joins the queue, and every 15 minutes from {00:00} to {12:45}.',
    defaultOn: false,
  },
  {
    key: 'autoInsuranceVerification',
    group: 'appointments',
    label: 'Mark insurance checked',
    does: 'Marks a patient’s insurance checked for bookings in the next two days. No insurer is contacted: a policy number of 8 or more characters counts as valid, and patients with a shorter one are emailed that it couldn’t be verified.',
    when: 'When a booking is made, and daily at {00:10}.',
    defaultOn: true,
    caution: 'This isn’t a check with the insurer, and patients can get an email saying their insurance failed when it didn’t.',
  },

  // Messages to patients
  {
    key: 'autoWelcomeMessages',
    group: 'patients',
    label: 'Welcome new patients',
    does: 'Texts and emails a welcome with the clinic’s details to each newly registered patient, including those who register through online booking.',
    when: 'When a patient is registered.',
    defaultOn: true,
  },
  {
    key: 'autoVisitSummaries',
    group: 'patients',
    label: 'Send visit summaries',
    does: 'When a visit is closed, emails the patient its complaint, diagnoses, assessment, plan, prescriptions and lab requests, and texts them that it’s ready.',
    when: 'When a visit is closed.',
    defaultOn: true,
    caution: 'Clinical details are sent by email.',
  },
  {
    key: 'autoLabNotifications',
    group: 'patients',
    label: 'Tell patients their results are in',
    does: 'Texts, emails and app-notifies the patient that results are ready (no values), and notifies the ordering doctor in the app. While off, results wait and are sent once it’s back on.',
    when: 'When a result is completed; unsent ones are retried every 30 minutes.',
    defaultOn: true,
  },
  {
    key: 'autoMedicationAdherence',
    group: 'patients',
    label: 'Remind patients to take their medicines',
    does: 'Texts and emails dose reminders for prescriptions from the last 90 days until the first medicine’s course ends: 8 AM for once a day, 8 AM and 8 PM for twice, up to four times a day.',
    when: 'Up to four times a day, between 8 AM and 8 PM.',
    defaultOn: true,
    caution: 'A patient can get up to 4 texts and 4 emails a day.',
  },
  {
    key: 'autoPrescriptionRefills',
    group: 'patients',
    label: 'Refill reminders',
    does: 'Texts and emails patients 3 days and 1 day before, and on the day, an active prescription runs out.',
    when: 'Daily at {01:05}.',
    defaultOn: true,
  },
  {
    key: 'autoPrescriptionExpiryWarnings',
    group: 'patients',
    label: 'Prescription running-out warnings',
    does: 'Texts and emails 7, 3 and 1 days before a prescription from the last year runs out (its date plus its longest course).',
    when: 'Daily at {00:05}.',
    defaultOn: true,
    caution: 'Falls on the same days as refill reminders, so patients with both on get two messages.',
  },
  {
    key: 'autoDocumentExpiryTracking',
    group: 'patients',
    label: 'Document expiry reminders',
    does: 'Texts and emails patients before a filed document expires (IDs and insurance 60, 30, 7 and 1 days ahead; certificates 14, 7 and 1; others 30, 14 and 1), and alerts admins and receptionists about IDs and insurance inside 30 days.',
    when: 'Daily at {01:30}.',
    defaultOn: true,
  },
  {
    key: 'autoHealthReminders',
    group: 'patients',
    label: 'Yearly check-up reminders',
    does: 'Texts and emails active patients with no check-up visit in a year, and no reminder in six months, to book one. At most 500 a day.',
    when: 'Daily at {04:00}.',
    defaultOn: true,
    caution: 'Right after it’s turned on, many patients are messaged at once.',
  },
  {
    key: 'autoBirthdayGreetings',
    group: 'patients',
    label: 'Birthday greetings',
    does: 'Texts and emails patients on their birthday, with a link to book.',
    when: 'Daily at {01:10}.',
    defaultOn: true,
  },
  {
    key: 'autoFeedbackCollection',
    group: 'patients',
    label: 'Ask for feedback',
    does: 'Texts and emails a feedback link for each visit closed in the last week, once per visit.',
    when: 'Daily at {02:15}.',
    defaultOn: true,
  },
  {
    key: 'autoCancellationPolicies',
    group: 'patients',
    label: 'No-show restrictions',
    does: 'Counts each patient’s no-shows over a year and records a restriction (2: deposit required, 3: walk-in only, 4 or more: not to be booked), tells the patient, and alerts admins and receptionists from 3.',
    when: 'Daily at {02:30}.',
    defaultOn: true,
    caution: 'Nothing enforces the restriction yet (online booking ignores it), but patients are told about it.',
  },

  // Billing
  {
    key: 'autoInvoiceGeneration',
    group: 'billing',
    label: 'Bill closed visits',
    does: 'Makes an unpaid invoice for the consultation when a visit is closed, with the patient’s discounts and the tax rate above, and emails it to the patient. The fee comes from Services and prices.',
    when: 'When a visit is closed.',
    defaultOn: true,
  },
  {
    key: 'autoPaymentReminders',
    group: 'billing',
    label: 'Payment reminders',
    does: 'Texts and emails patients with a balance 7, 14 and 30 days after the invoice, then every week until 180 days.',
    when: 'Daily at {02:00}.',
    defaultOn: true,
    caution: 'An unpaid invoice can bring up to 24 reminders.',
  },
  {
    key: 'autoFrontDeskCatchUp',
    group: 'billing',
    label: 'End-of-day front desk check',
    does: 'Makes any invoice that wasn’t made when a visit closed, then sends receptionists (admins if there are none) one list of the visits since yesterday that still need an invoice, a payment recorded or medicines handed over, and the patients whose first payment reminder goes out tomorrow (so a payment nobody recorded can be put in first). Nothing is sent when the list is empty.',
    when: 'Daily at {10:00}.',
    defaultOn: true,
  },

  // Stock
  {
    key: 'autoLowStockAlerts',
    group: 'stock',
    label: 'Low-stock alerts',
    does: 'Alerts admins and accountants in the app and by email when an item runs low, runs out or expires, once each time.',
    when: 'When stock changes, and daily at {00:00}.',
    defaultOn: true,
  },
  {
    key: 'autoExpiryMonitoring',
    group: 'stock',
    label: 'Stock expiry alerts',
    does: 'Alerts admins and accountants 30, 7 and 1 days before stock expires.',
    when: 'Daily at {23:00}.',
    defaultOn: true,
  },
  {
    key: 'autoInventoryReordering',
    group: 'stock',
    label: 'Daily reorder list',
    does: 'Sends admins and accountants the items that are low, out or expiring within 90 days, with a suggested quantity. Places no orders, and repeats every day while items qualify.',
    when: 'Daily at {01:15}.',
    defaultOn: true,
  },

  // Reports
  {
    key: 'autoDailyReports',
    group: 'reports',
    label: 'Daily summary',
    does: 'Emails admins and accountants yesterday’s figures: new patients, bookings, visits, invoices, money in and still owed.',
    when: 'Daily at {23:00}.',
    defaultOn: true,
  },
  {
    key: 'autoPeriodicReports',
    group: 'reports',
    label: 'Weekly and monthly reports',
    does: 'Emails admins and accountants the last week’s figures on Mondays and the last month’s on the 1st.',
    when: 'Mondays and the 1st at {00:00}.',
    defaultOn: true,
  },
  {
    key: 'autoStaffPerformanceReports',
    group: 'reports',
    label: 'Doctor performance reports',
    does: 'Emails administrators each doctor’s figures for the last week on Mondays and the last month on the 1st.',
    when: 'Mondays and the 1st at {01:00}.',
    defaultOn: true,
  },

  // Records
  {
    key: 'autoDataRetention',
    group: 'records',
    label: 'Archive old records',
    does: 'Archives bookings, visits, lab results and prescriptions after a year, paid invoices and documents after two years, and audit entries after 90 days. Patients are never archived.',
    when: 'Once a week, overnight.',
    defaultOn: true,
    caution: 'Permanently deletes archived audit entries after three years, and archived documents drop out of the documents list.',
  },
];

/** "Daily at 9:10 AM" from "Daily at {01:10}", in the clinic's zone. */
export function whenText(when: string, timezone: string) {
  return when.replace(/\{(\d{2}):(\d{2})\}/g, (_m, h, mm) => {
    const d = new Date(Date.UTC(2026, 0, 5, Number(h), Number(mm)));
    try {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone });
    } catch {
      return `${h}:${mm} UTC`;
    }
  });
}
