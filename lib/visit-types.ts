/** The kinds of visit a note can be, as the visit form offers them. Client-safe. */
export const VISIT_TYPES: { value: string; label: string }[] = [
  { value: 'consultation', label: 'Consultation' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'checkup', label: 'Check-up' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'teleconsult', label: 'Teleconsult' },
  { value: 'vaccination', label: 'Vaccination' },
];

export const visitTypeLabel = (v: string) => VISIT_TYPES.find((t) => t.value === v)?.label ?? v;
