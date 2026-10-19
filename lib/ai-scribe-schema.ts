import { z } from 'zod';

/**
 * The AI scribe's draft, as Claude returns it (structured output) and the visit form reviews it.
 * Client-safe. Empty strings mean "not mentioned in the consult".
 */

export const EXAM_SYSTEMS = [
  'general', 'heent', 'chest', 'lungs', 'cardiovascular', 'abdomen', 'extremities', 'skin',
  'lymphNotes', 'breast', 'rectum', 'genitalia', 'musculoskeletal', 'neurological', 'other',
] as const;

export const ScribeDraftSchema = z.object({
  chiefComplaint: z.string().describe("Short chief complaint in the patient's words, translated to English if needed."),
  historyOfPresentIllness: z.string(),
  soap: z.object({
    subjective: z.string(),
    objective: z.string(),
    assessment: z.string(),
    plan: z.string(),
  }),
  physicalExam: z
    .array(z.object({ system: z.enum(EXAM_SYSTEMS), finding: z.string() }))
    .describe('Only systems the doctor actually examined or stated findings for.'),
  diagnoses: z.array(
    z.object({
      code: z.string().describe('WHO ICD-10 code, e.g. J06.9'),
      description: z.string(),
      primary: z.boolean(),
      rationale: z.string().describe('One short sentence tying the code to what was said.'),
    })
  ),
  medications: z
    .array(
      z.object({
        name: z.string().describe('Generic name, with brand in parentheses if the doctor said one.'),
        dosage: z.string(),
        frequency: z.string(),
        duration: z.string(),
        quantity: z.number().nullable(),
        instructions: z.string(),
      })
    )
    .describe('Only medicines the doctor prescribed or said to continue in the consult.'),
  followUp: z.object({
    inDays: z.number().nullable(),
    instructions: z.string(),
  }),
  warnings: z
    .array(z.string())
    .describe('Things the doctor must check: missing doses, allergy conflicts, red flags, unclear dictation.'),
});

export type ScribeDraft = z.infer<typeof ScribeDraftSchema>;

/** What the API returns to the form: the draft plus server-side checks. */
export interface ScribeResult {
  draft: ScribeDraft;
  /** Codes confirmed to exist in the ICD-10 lookup (upper-cased). */
  verifiedCodes: string[];
  /** Medicines whose name matches a recorded allergy (server check, independent of the model). */
  allergyHits: string[];
}

/** Basic patient context sent with the transcript; no names or identifiers. */
export interface ScribeContext {
  ageYears?: number | null;
  sex?: string | null;
  allergies?: string[];
  currentMedications?: string[];
  visitType?: string;
}

export const MAX_TRANSCRIPT_CHARS = 60_000;
