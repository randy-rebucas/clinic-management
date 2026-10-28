import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('server-only', () => ({}));

import { PATIENT_RECORDS, PATIENT_MENTIONS, PATIENT_REFS_KEPT } from '@/lib/patient-erasure';

// Register every model (models/index.ts loads them with require(), which vitest can't resolve).
import.meta.glob(['../../models/*.ts', '!../../models/index.ts'], { eager: true });

/** Every top-level path, in every model, that points at a Patient. */
function patientRefs(): string[] {
  const refs: string[] = [];
  for (const name of mongoose.modelNames()) {
    for (const [path, type] of Object.entries(mongoose.model(name).schema.paths) as [string, any][]) {
      if (path.includes('.')) continue;
      if (type?.options?.ref === 'Patient' || type?.caster?.options?.ref === 'Patient') refs.push(`${name}.${path}`);
    }
  }
  return refs.sort();
}

describe('patient erasure coverage', () => {
  it('handles every reference to a patient in the schemas', () => {
    const handled = [
      ...PATIENT_RECORDS.map((l) => `${l.model.modelName}.${l.field}`),
      ...PATIENT_MENTIONS.map((l) => `${l.model.modelName}.${l.field}`),
      ...PATIENT_REFS_KEPT,
    ].sort();
    // A new model that links to a patient must be added to lib/patient-erasure.ts.
    expect(handled).toEqual(patientRefs());
  });

  it('only erases records the clinic owns', () => {
    for (const { model } of [...PATIENT_RECORDS, ...PATIENT_MENTIONS]) {
      expect(model.schema.path('tenantId'), model.modelName).toBeTruthy();
    }
  });
});
