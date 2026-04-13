/**
 * FHIR R4 resource builders.
 * Maps internal clinic models to standard FHIR R4 resources.
 * Spec: https://hl7.org/fhir/R4/
 */

const FHIR_SERVER = process.env.NEXT_PUBLIC_APP_URL ?? 'https://myclinicsoftware.com';

// ─── Utilities ──────────────────────────────────────────────────────────────

function fhirDate(d?: Date | string | null): string | undefined {
  if (!d) return undefined;
  return new Date(d).toISOString().split('T')[0];
}

function fhirDateTime(d?: Date | string | null): string | undefined {
  if (!d) return undefined;
  return new Date(d).toISOString();
}

function ref(resourceType: string, id: string) {
  return { reference: `${resourceType}/${id}` };
}

// ─── Patient ─────────────────────────────────────────────────────────────────

export function buildFHIRPatient(p: any) {
  return {
    resourceType: 'Patient',
    id: p._id.toString(),
    meta: { profile: ['http://hl7.org/fhir/StructureDefinition/Patient'] },
    identifier: [
      ...(p.patientCode ? [{ system: `${FHIR_SERVER}/patient-code`, value: p.patientCode }] : []),
    ],
    active: p.active !== false,
    name: [
      {
        use: 'official',
        family: p.lastName ?? '',
        given: [p.firstName ?? ''].filter(Boolean),
        ...(p.middleName ? { text: `${p.firstName} ${p.middleName} ${p.lastName}` } : {}),
      },
    ],
    telecom: [
      ...(p.phone ? [{ system: 'phone', value: p.phone, use: 'mobile' }] : []),
      ...(p.email ? [{ system: 'email', value: p.email }] : []),
    ],
    gender: p.sex === 'male' ? 'male' : p.sex === 'female' ? 'female' : 'unknown',
    birthDate: fhirDate(p.dateOfBirth),
    address: p.address
      ? [
          {
            use: 'home',
            text: [p.address.street, p.address.city, p.address.state, p.address.country]
              .filter(Boolean)
              .join(', '),
          },
        ]
      : [],
  };
}

// ─── Encounter (Visit) ───────────────────────────────────────────────────────

const VISIT_TYPE_MAP: Record<string, string> = {
  consultation: 'AMB',
  'follow-up': 'AMB',
  checkup: 'AMB',
  emergency: 'EMER',
  teleconsult: 'VR',
  vaccination: 'AMB',
};

export function buildFHIREncounter(visit: any) {
  const enc: any = {
    resourceType: 'Encounter',
    id: visit._id.toString(),
    status: visit.status === 'closed' ? 'finished' : visit.status === 'cancelled' ? 'cancelled' : 'in-progress',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: VISIT_TYPE_MAP[visit.visitType] ?? 'AMB',
    },
    type: [
      {
        text: visit.visitType ?? 'consultation',
      },
    ],
    subject: ref('Patient', visit.patient.toString()),
    period: {
      start: fhirDateTime(visit.date),
      ...(visit.status === 'closed' ? { end: fhirDateTime(visit.updatedAt) } : {}),
    },
    reasonCode: visit.chiefComplaint
      ? [{ text: visit.chiefComplaint }]
      : undefined,
  };

  if (visit.diagnoses?.length) {
    enc.diagnosis = visit.diagnoses.map((d: any, idx: number) => ({
      condition: { display: d.description ?? d.code ?? 'Unknown' },
      rank: idx + 1,
      ...(d.code ? {
        condition: {
          display: d.description ?? d.code,
          identifier: { system: 'http://hl7.org/fhir/sid/icd-10', value: d.code },
        },
      } : {}),
    }));
  }

  if (visit.provider) {
    enc.participant = [{ individual: ref('Practitioner', visit.provider.toString()) }];
  }

  return enc;
}

// ─── Observation (Vitals) ────────────────────────────────────────────────────

interface VitalDef {
  code: string;
  display: string;
  unit: string;
  system: string;
}

const VITAL_DEFS: Record<string, VitalDef> = {
  hr: { code: '8867-4', display: 'Heart rate', unit: '/min', system: 'http://loinc.org' },
  rr: { code: '9279-1', display: 'Respiratory rate', unit: '/min', system: 'http://loinc.org' },
  tempC: { code: '8310-5', display: 'Body temperature', unit: 'Cel', system: 'http://loinc.org' },
  spo2: { code: '2708-6', display: 'Oxygen saturation', unit: '%', system: 'http://loinc.org' },
  weightKg: { code: '29463-7', display: 'Body weight', unit: 'kg', system: 'http://loinc.org' },
  heightCm: { code: '8302-2', display: 'Body height', unit: 'cm', system: 'http://loinc.org' },
  bmi: { code: '39156-5', display: 'BMI', unit: 'kg/m2', system: 'http://loinc.org' },
};

export function buildFHIRObservations(visit: any): any[] {
  const vitals = visit.vitals;
  if (!vitals) return [];

  const observations: any[] = [];
  const patientRef = ref('Patient', visit.patient.toString());
  const encounterRef = ref('Encounter', visit._id.toString());
  const effectiveDateTime = fhirDateTime(visit.date);

  // Blood pressure (special composite)
  if (vitals.bp) {
    const match = vitals.bp.match(/^(\d+)\/(\d+)$/);
    if (match) {
      observations.push({
        resourceType: 'Observation',
        id: `obs-bp-${visit._id}`,
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: '55284-4', display: 'Blood pressure systolic and diastolic' }] },
        subject: patientRef,
        encounter: encounterRef,
        effectiveDateTime,
        component: [
          {
            code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] },
            valueQuantity: { value: parseInt(match[1], 10), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
          },
          {
            code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] },
            valueQuantity: { value: parseInt(match[2], 10), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
          },
        ],
      });
    }
  }

  // Scalar vitals
  for (const [field, def] of Object.entries(VITAL_DEFS)) {
    const val = vitals[field];
    if (val == null) continue;
    observations.push({
      resourceType: 'Observation',
      id: `obs-${field}-${visit._id}`,
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
      code: { coding: [{ system: def.system, code: def.code, display: def.display }], text: def.display },
      subject: patientRef,
      encounter: encounterRef,
      effectiveDateTime,
      valueQuantity: { value: val, unit: def.unit, system: 'http://unitsofmeasure.org' },
    });
  }

  return observations;
}

// ─── MedicationRequest (Prescription) ────────────────────────────────────────

export function buildFHIRMedicationRequests(prescription: any): any[] {
  if (!prescription.medications?.length) return [];

  return prescription.medications.map((med: any, idx: number) => ({
    resourceType: 'MedicationRequest',
    id: `medrx-${prescription._id}-${idx}`,
    status: prescription.status === 'dispensed' ? 'completed' : prescription.status === 'cancelled' ? 'cancelled' : 'active',
    intent: 'order',
    medicationCodeableConcept: {
      text: med.name,
      ...(med.genericName ? { coding: [{ display: med.genericName }] } : {}),
    },
    subject: ref('Patient', prescription.patient.toString()),
    authoredOn: fhirDateTime(prescription.issuedAt),
    dosageInstruction: [
      {
        text: [med.dose, med.frequency, med.route, med.instructions].filter(Boolean).join(', '),
        route: med.route ? { text: med.route } : undefined,
        doseAndRate: med.dose
          ? [{ doseQuantity: { value: med.dose, unit: med.form ?? 'tablet' } }]
          : undefined,
      },
    ],
    dispenseRequest: {
      quantity: med.quantity ? { value: med.quantity, unit: med.form ?? 'tablet' } : undefined,
      expectedSupplyDuration: med.durationDays
        ? { value: med.durationDays, unit: 'days', system: 'http://unitsofmeasure.org', code: 'd' }
        : undefined,
    },
  }));
}

// ─── FHIR Bundle ─────────────────────────────────────────────────────────────

export function buildFHIRBundle(entries: any[]): object {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    total: entries.length,
    entry: entries.map((resource) => ({
      fullUrl: `${FHIR_SERVER}/fhir/${resource.resourceType}/${resource.id}`,
      resource,
    })),
  };
}
