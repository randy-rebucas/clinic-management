import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { normalize, allergyHits } = await import('@/lib/ai-scribe');
const { ScribeDraftSchema } = await import('@/lib/ai-scribe-schema');

const base = {
  chiefComplaint: 'Cough',
  historyOfPresentIllness: '',
  soap: { subjective: 'Cough 3 days', objective: '', assessment: 'URTI', plan: '' },
  physicalExam: [{ system: 'lungs' as const, finding: 'Clear' }, { system: 'skin' as const, finding: '  ' }],
  diagnoses: [
    { code: 'j06.9 ', description: 'Acute URTI', primary: false, rationale: '' },
    { code: 'R50.9', description: 'Fever', primary: true, rationale: '' },
    { code: '', description: '', primary: false, rationale: '' },
  ],
  medications: [
    { name: 'Amoxicillin', dosage: '500 mg', frequency: 'TID', duration: '7 days', quantity: 21, instructions: '' },
    { name: ' ', dosage: '', frequency: '', duration: '', quantity: null, instructions: '' },
  ],
  followUp: { inDays: 3, instructions: 'Return if worse' },
  warnings: ['  ', 'Check dose'],
};

describe('ScribeDraftSchema', () => {
  it('accepts a well-formed draft', () => {
    expect(ScribeDraftSchema.safeParse(base).success).toBe(true);
  });
});

describe('normalize', () => {
  it('upper-cases codes, keeps the model’s primary, and drops blank rows', () => {
    const out = normalize(base);
    expect(out.diagnoses.map((d) => d.code)).toEqual(['J06.9', 'R50.9']);
    expect(out.diagnoses.map((d) => d.primary)).toEqual([false, true]);
    expect(out.medications).toHaveLength(1);
    expect(out.physicalExam).toHaveLength(1);
    expect(out.warnings).toEqual(['Check dose']);
  });

  it('marks the first diagnosis primary when none was', () => {
    const out = normalize({ ...base, diagnoses: base.diagnoses.map((d) => ({ ...d, primary: false })) });
    expect(out.diagnoses[0].primary).toBe(true);
    expect(out.diagnoses.filter((d) => d.primary)).toHaveLength(1);
  });
});

describe('allergyHits', () => {
  it('flags medicines matching a recorded allergy', () => {
    expect(allergyHits(base, ['Amoxicillin'])).toEqual(['Amoxicillin']);
    expect(allergyHits(base, ['amoxicillin rash'])).toEqual(['Amoxicillin']);
    expect(allergyHits(base, ['Sulfa'])).toEqual([]);
    expect(allergyHits(base, [])).toEqual([]);
  });
});
