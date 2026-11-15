/**
 * What a patient sees of a prescription (eMCR `Prescription`, lib/prescriptions.ts and
 * lib/medicineReminders.ts): the medicines and how to take them, status, dates, the prescriber
 * and visit (populated, see prescription-visit.ts), the notes printed on the patient's Rx
 * (lib/prescription-document.ts) and where it was dispensed. A whitelist, so a field added to
 * the model later stays staff-only until it is listed here. Never the signature image, drug
 * interaction checks, print/archive bookkeeping, the content author, dispenser details or
 * reminder markers.
 */
export const PATIENT_PRESCRIPTION_SELECT = [
  'tenantId',
  'patient',
  'prescriptionCode',
  'visit',
  'prescribedBy',
  'issuedAt',
  'status',
  'notes',
  ...['name', 'genericName', 'form', 'strength', 'dose', 'route', 'frequency', 'durationDays', 'quantity', 'instructions'].map(
    (f) => `medications.${f}`
  ),
  'pharmacyDispenses.pharmacyName',
  'pharmacyDispenses.dispensedAt',
  'createdAt',
  'updatedAt',
].join(' ');
