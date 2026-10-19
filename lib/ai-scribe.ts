import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { searchICD10 } from '@/lib/icd10';
import { ScribeDraftSchema, type ScribeContext, type ScribeDraft, type ScribeResult } from '@/lib/ai-scribe-schema';

/**
 * AI clinical scribe: turns a consult transcript (dictated or typed) into a draft visit note.
 * The doctor reviews and edits every field before anything is saved; nothing here writes
 * to the record. Only age, sex, allergies and current medicines go with the transcript,
 * never the patient's name or identifiers.
 */

export const SCRIBE_MODEL = 'claude-opus-5-5';

export class ScribeError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export function scribeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Frozen so it caches: keep anything per-request out of here.
const SYSTEM_PROMPT = `You are a clinical documentation assistant for outpatient clinics in the Philippines. A doctor gives you the transcript or dictated notes of a consultation, plus basic patient context. Draft the visit note for the doctor to review and sign.

The draft goes into the medical record only after the doctor checks it, but they will rely on it, so accuracy matters more than completeness:
- Document only what is in the transcript. Never invent history, vital signs, examination findings, test results, doses or diagnoses. If something was not said, leave that field as an empty string (or an empty list), even when a typical note would contain it.
- Transcripts may be in English, Filipino, Taglish or another Philippine language, and dictation may contain recognition errors. Write the note in clear clinical English. When a word is unclear and the meaning matters (a drug name, a dose, a laterality), keep your best reading and add a warning naming the uncertainty.
- Subjective: symptoms, onset, course, relevant history and what the patient reports. Objective: vital signs and findings the doctor stated. Assessment: the doctor's impression as stated or clearly implied. Plan: tests, treatment, advice and follow-up that were said.
- Diagnoses: suggest WHO ICD-10 codes (the classification used for PhilHealth) for the conditions the doctor named or clearly concluded. Use the most specific code the transcript supports, mark exactly one as primary when there is any, and do not code symptoms separately when they are explained by a coded diagnosis.
- Medicines: list only medicines the doctor prescribed or told the patient to continue. Use generic names, keeping a brand in parentheses if one was said. Fill dosage, frequency, duration and quantity only from what was said; leave the rest empty and add a warning that the dose or duration is missing. Do not suggest medicines the doctor did not mention.
- Warnings: flag anything the doctor should check before signing - a medicine that conflicts with a listed allergy, missing dosing details, red-flag symptoms mentioned without a documented plan, or unclear dictation. Keep each warning to one sentence. Leave the list empty if there is nothing to flag.
- Follow-up: the number of days until review if the doctor gave one, and the return precautions they gave.`;

function contextBlock(ctx: ScribeContext): string {
  const lines = [
    ctx.visitType ? `Visit type: ${ctx.visitType}` : null,
    ctx.ageYears != null ? `Age: ${ctx.ageYears} years` : null,
    ctx.sex ? `Sex: ${ctx.sex}` : null,
    `Recorded allergies: ${ctx.allergies?.length ? ctx.allergies.join('; ') : 'none recorded'}`,
    `Current medicines: ${ctx.currentMedications?.length ? ctx.currentMedications.join('; ') : 'none recorded'}`,
  ].filter(Boolean);
  return lines.join('\n');
}

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export async function draftVisitNote(transcript: string, ctx: ScribeContext): Promise<ScribeResult> {
  if (!scribeConfigured()) throw new ScribeError('The AI scribe is not set up on this server.', 503);

  let response;
  try {
    response = await anthropic().beta.messages.parse({
      model: SCRIBE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      // A safety classifier can decline a benign clinical request; re-run it on Anthropic's
      // recommended fallback model instead of failing the doctor's draft.
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(ScribeDraftSchema) },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `<patient_context>\n${contextBlock(ctx)}\n</patient_context>\n\n<transcript>\n${transcript}\n</transcript>`,
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new ScribeError('The AI scribe is busy. Try again in a minute.', 429);
    if (error instanceof Anthropic.AuthenticationError) throw new ScribeError('The AI scribe is not set up correctly on this server.', 503);
    if (error instanceof Anthropic.BadRequestError) throw new ScribeError('The AI scribe could not read this transcript.', 422);
    if (error instanceof Anthropic.APIError) throw new ScribeError('The AI scribe is unavailable right now. Try again.', 502);
    throw new ScribeError('Could not reach the AI scribe. Check the connection and try again.', 502);
  }

  if (response.stop_reason === 'refusal') {
    throw new ScribeError('The AI scribe declined to draft this note. Write it by hand, or rephrase the transcript.', 422);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ScribeError('The transcript is too long to draft in one go. Shorten it and try again.', 422);
  }
  const draft = response.parsed_output;
  if (!draft) throw new ScribeError('The AI scribe returned an incomplete draft. Try again.', 502);

  const clean = normalize(draft);
  return { draft: clean, verifiedCodes: await verifyCodes(clean), allergyHits: allergyHits(clean, ctx.allergies ?? []) };
}

/** Tidy the model output: upper-case codes, one primary diagnosis, no blank rows. */
export function normalize(draft: ScribeDraft): ScribeDraft {
  const diagnoses = draft.diagnoses
    .map((d) => ({ ...d, code: d.code.trim().toUpperCase(), description: d.description.trim() }))
    .filter((d) => d.code || d.description);
  const firstPrimary = diagnoses.findIndex((d) => d.primary);
  diagnoses.forEach((d, i) => (d.primary = firstPrimary === -1 ? i === 0 : i === firstPrimary));
  return {
    ...draft,
    diagnoses,
    medications: draft.medications.filter((m) => m.name.trim()),
    physicalExam: draft.physicalExam.filter((p) => p.finding.trim()),
    warnings: draft.warnings.map((w) => w.trim()).filter(Boolean),
  };
}

/** Confirm suggested codes exist, so the review can mark unverified ones. */
async function verifyCodes(draft: ScribeDraft): Promise<string[]> {
  const codes = [...new Set(draft.diagnoses.map((d) => d.code.trim().toUpperCase()).filter(Boolean))];
  const checks = await Promise.all(
    codes.map(async (code) => {
      try {
        const hits = await searchICD10(code, 5);
        return hits.some((h) => h.code.toUpperCase() === code) ? code : null;
      } catch {
        return null;
      }
    })
  );
  return checks.filter((c): c is string => Boolean(c));
}

/** Medicines whose name contains a recorded allergen (or vice versa), checked without the model. */
export function allergyHits(draft: ScribeDraft, allergies: string[]): string[] {
  const allergens = allergies.map((a) => a.trim().toLowerCase()).filter((a) => a.length >= 3);
  if (!allergens.length) return [];
  return draft.medications
    .filter((m) => {
      const name = m.name.trim().toLowerCase();
      const first = name.split(/[\s(]/)[0];
      if (first.length < 3) return false;
      return allergens.some((a) => name.includes(a) || a.includes(first));
    })
    .map((m) => m.name);
}
