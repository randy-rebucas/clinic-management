import { describe, it, expect } from 'vitest';
import {
  STARTER_TEMPLATES,
  durationToDays,
  expandMacro,
  fillBlank,
  mergeDiagnoses,
  mergeMedications,
} from '@/lib/clinical-templates';

const phrases = new Map([
  ['nad', 'Awake, alert, not in distress.'],
  ['urti', 'upper respiratory tract infection'],
]);

describe('expandMacro', () => {
  it('expands a shortcut followed by a space', () => {
    const value = 'Gen: .nad ';
    const r = expandMacro(value, value.length, phrases);
    expect(r?.value).toBe('Gen: Awake, alert, not in distress. ');
    expect(r?.caret).toBe(r!.value.length);
    expect(r?.shortcut).toBe('nad');
  });

  it('expands at the start of the text and before a newline, keeping the text after the caret', () => {
    expect(expandMacro('.urti\n', 6, phrases)?.value).toBe('upper respiratory tract infection\n');
    const r = expandMacro('Dx .urti  then more', 9, phrases);
    expect(r?.value).toBe('Dx upper respiratory tract infection  then more');
  });

  it('is case-insensitive on the shortcut', () => {
    expect(expandMacro('.NAD ', 5, phrases)?.value).toBe('Awake, alert, not in distress. ');
  });

  it('leaves unknown shortcuts, decimals and mid-word dots alone', () => {
    expect(expandMacro('.foo ', 5, phrases)).toBeNull();
    expect(expandMacro('Temp 37.5 ', 10, phrases)).toBeNull();
    expect(expandMacro('e.nad ', 6, phrases)).toBeNull();
    expect(expandMacro('.nad', 4, phrases)).toBeNull(); // no trailing space yet
  });
});

describe('fillBlank', () => {
  it('fills an empty field and keeps a written one', () => {
    expect(fillBlank('', 'Cough')).toEqual({ value: 'Cough', skipped: false });
    expect(fillBlank('Fever', 'Cough')).toEqual({ value: 'Fever', skipped: true });
    expect(fillBlank('Cough', 'Cough')).toEqual({ value: 'Cough', skipped: false });
    expect(fillBlank('Fever', undefined)).toEqual({ value: 'Fever', skipped: false });
  });
});

describe('mergeDiagnoses', () => {
  const make = (d: { code: string; description: string; primary: boolean }) => d;

  it('appends new diagnoses, skips duplicates and keeps one primary', () => {
    const current = [{ code: 'J06.9', description: 'URTI', primary: true }];
    const out = mergeDiagnoses(current, [{ code: 'j06.9' }, { code: 'R50.9', description: 'Fever' }], make);
    expect(out.map((d) => d.code)).toEqual(['J06.9', 'R50.9']);
    expect(out.filter((d) => d.primary)).toHaveLength(1);
  });

  it('makes the first diagnosis primary when the note had none', () => {
    const out = mergeDiagnoses([{ code: '', description: '', primary: false }], [{ code: 'I10', description: 'HTN' }], make);
    expect(out).toEqual([{ code: 'I10', description: 'HTN', primary: true }]);
  });
});

describe('mergeMedications', () => {
  it('drops blank rows and skips medicines already listed', () => {
    const current = [{ name: 'Paracetamol' }, { name: '' }];
    const out = mergeMedications(current, [{ name: 'paracetamol' }, { name: 'Cetirizine' }], (m) => ({ name: m.name }));
    expect(out.map((m) => m.name)).toEqual(['Paracetamol', 'Cetirizine']);
  });
});

describe('durationToDays', () => {
  it('parses common durations', () => {
    expect(durationToDays('7 days')).toBe(7);
    expect(durationToDays('2 weeks')).toBe(14);
    expect(durationToDays('1 month')).toBe(30);
    expect(durationToDays('5')).toBe(5);
    expect(durationToDays('as needed')).toBeNull();
    expect(durationToDays(undefined)).toBeNull();
  });
});

describe('STARTER_TEMPLATES', () => {
  it('carry no medicines and have unique ids with a primary ICD-10 code', () => {
    const ids = new Set(STARTER_TEMPLATES.map((t) => t._id));
    expect(ids.size).toBe(STARTER_TEMPLATES.length);
    for (const t of STARTER_TEMPLATES) {
      expect(t.medications ?? []).toHaveLength(0);
      expect(t.visit?.diagnoses?.[0]?.code).toMatch(/^[A-Z]\d{2}(\.\d)?$/);
    }
  });
});
