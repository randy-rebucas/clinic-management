import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  VisitBriefSchema,
  VisitNoteDraftSchema,
  type VisitBrief,
  type VisitNoteDraft,
  type VisitNoteResult,
} from '@/lib/rep-ai-schema';

/**
 * The medical rep's AI assistant (eMedRoute): drafts visit notes from what the rep dictates or
 * types, and briefs the rep before a visit from their own history with that clinic. The rep
 * reviews every draft before saving; nothing here writes a record.
 *
 * Only the rep's own data goes to the model: their notes, visits, deliveries and product names.
 * Never patient data. Models are chosen per job for cost (see the pricing decision, Nov 2026):
 * the note draft reads messy Taglish and maps products, so it gets Sonnet; the brief summarises
 * structured history, so Haiku does it.
 */

export const VISIT_NOTE_MODEL = 'claude-sonnet-5-5';
export const VISIT_BRIEF_MODEL = 'claude-haiku-5-5';

export class RepAiError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export function repAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export interface AiUsage {
  input: number;
  output: number;
}

function usageOf(response: { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } }): AiUsage {
  const u = response.usage ?? {};
  return {
    input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    output: u.output_tokens ?? 0,
  };
}

function apiError(error: unknown): RepAiError {
  if (error instanceof Anthropic.RateLimitError) return new RepAiError('The AI assistant is busy. Try again in a minute.', 429);
  if (error instanceof Anthropic.AuthenticationError) return new RepAiError('The AI assistant is not set up correctly on the server.', 503);
  if (error instanceof Anthropic.BadRequestError) return new RepAiError('The AI assistant could not read this. Try rewording it.', 422);
  if (error instanceof Anthropic.APIError) return new RepAiError('The AI assistant is unavailable right now. Try again.', 502);
  return new RepAiError('Could not reach the AI assistant. Check the connection and try again.', 502);
}

// ── Visit note ───────────────────────────────────────────────────────────────

// Frozen so it caches: anything per-request goes in the user message.
const NOTE_SYSTEM = `You help pharmaceutical medical representatives in the Philippines write up their visits to doctors and clinics. Right after a visit the rep dictates or types a quick account, often in Taglish or another Philippine language, sometimes with speech-recognition mistakes. Turn it into a structured visit record the rep will check and save as their private notes.

- Record only what the rep said. Never invent reactions, promises, quantities, dates or product details. When something was not said, leave the field empty (or null, or an empty list).
- Write in short, plain English, even when the rep spoke Filipino. Keep names of doctors, clinics and products as the rep said them.
- Products: list only products the rep said were discussed, shown or left. Match each to the numbered list in <products> when it is clearly the same product (brand or generic name, allowing for misspelling); otherwise give a null number. Do not match on a guess.
- Doctor interest: judge from the rep's words only; use "unclear" when they did not say.
- Commitments: separate what the rep promised (bring samples, send literature, come back) from what the clinic promised (try it, order, refer).
- Follow-up: give days only if the rep said a time ("next week" is 7, "in two weeks" is 14, "next month" is 30).
- Warnings: flag unclear words that matter, such as a product name or quantity you are not sure of. Keep each to one sentence. Leave the list empty when nothing is unclear.
- The account is about the rep's work with doctors. If it includes details about a patient, leave them out of every field.`;

function productBlock(products: { name: string; strength?: string }[]): string {
  if (!products.length) return '(The rep has no products listed.)';
  return products.map((p, i) => `${i + 1}. ${p.name}${p.strength ? ` ${p.strength}` : ''}`).join('\n');
}

const INTEREST_LABEL: Record<VisitNoteDraft['doctorInterest'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unclear: '',
};

/** The draft as notes text the rep can edit: summary first, then labelled lines. */
export function composeNotes(draft: VisitNoteDraft, maxChars = 2000): string {
  const lines: string[] = [draft.summary.trim()];
  const facts: string[] = [];
  if (INTEREST_LABEL[draft.doctorInterest]) facts.push(`Interest: ${INTEREST_LABEL[draft.doctorInterest]}`);
  const products = draft.products.filter((p) => p.name.trim());
  if (products.length) facts.push(`Products: ${products.map((p) => (p.reaction.trim() ? `${p.name.trim()} (${p.reaction.trim()})` : p.name.trim())).join('; ')}`);
  const objections = draft.objections.map((o) => o.trim()).filter(Boolean);
  if (objections.length) facts.push(`Concerns: ${objections.join('; ')}`);
  const mine = draft.commitments.filter((c) => c.by === 'rep' && c.what.trim()).map((c) => c.what.trim());
  const theirs = draft.commitments.filter((c) => c.by === 'clinic' && c.what.trim()).map((c) => c.what.trim());
  if (mine.length) facts.push(`I promised: ${mine.join('; ')}`);
  if (theirs.length) facts.push(`Clinic promised: ${theirs.join('; ')}`);
  const when = draft.followUp.inDays != null && draft.followUp.inDays > 0 ? `in ${Math.round(draft.followUp.inDays)} days` : '';
  const action = draft.followUp.action.trim();
  if (when || action) facts.push(`Follow-up: ${[when, action].filter(Boolean).join(', ')}`);
  if (facts.length) lines.push('', ...facts);
  const text = lines.join('\n').trim();
  return text.length > maxChars ? `${text.slice(0, maxChars - 1).trimEnd()}…` : text;
}

export async function draftRepVisitNote(
  account: string,
  ctx: { clinicName?: string; products: { _id: string; name: string; strength?: string }[] }
): Promise<{ result: VisitNoteResult; usage: AiUsage }> {
  if (!repAiConfigured()) throw new RepAiError('The AI assistant is not set up on this server.', 503);

  let response;
  try {
    response = await anthropic().beta.messages.parse({
      model: VISIT_NOTE_MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      // A classifier can decline a benign request (drug names, doses); retry it on the
      // recommended fallback instead of failing the rep's draft.
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(VisitNoteDraftSchema) },
      system: [{ type: 'text', text: NOTE_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: [
            ctx.clinicName ? `<clinic>${ctx.clinicName}</clinic>` : null,
            `<products>\n${productBlock(ctx.products)}\n</products>`,
            `<account>\n${account}\n</account>`,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
    });
  } catch (error) {
    throw apiError(error);
  }

  if (response.stop_reason === 'refusal') throw new RepAiError('The AI assistant declined to draft this. Write the notes by hand, or reword it.', 422);
  if (response.stop_reason === 'max_tokens') throw new RepAiError('That is too long to draft in one go. Shorten it and try again.', 422);
  const draft = response.parsed_output;
  if (!draft) throw new RepAiError('The AI assistant returned an incomplete draft. Try again.', 502);

  const productIds = [
    ...new Set(
      draft.products
        .map((p) => (p.catalogNumber != null && Number.isInteger(p.catalogNumber) ? ctx.products[p.catalogNumber - 1]?._id : undefined))
        .filter((id): id is string => Boolean(id))
    ),
  ];
  return {
    result: {
      notes: composeNotes(draft),
      productIds,
      interest: draft.doctorInterest,
      followUp: { inDays: draft.followUp.inDays, action: draft.followUp.action.trim() },
      warnings: draft.warnings.map((w) => w.trim()).filter(Boolean),
    },
    usage: usageOf(response),
  };
}

// ── Pre-visit brief ──────────────────────────────────────────────────────────

const BRIEF_SYSTEM = `You brief a pharmaceutical medical representative in the Philippines just before they visit a doctor or clinic. You get the rep's own history with that clinic: past visits with their private notes and outcomes, products delivered or left as samples, and the rep's product list. Write a short brief they can read in the car in under a minute.

- Use only the history given. Never invent what a doctor said, promised or prefers. If the history is thin, say less; empty fields are fine.
- Be concrete: name products, dates and promises from the notes. Prefer "You promised samples of X on Oct 3" over general advice.
- Open items are promises from earlier visits that nothing later shows as done.
- Focus: up to three things to do or bring this time, each grounded in the history. Do not make medical or promotional claims about products.
- Cautions: patterns such as declined or missed visits, rejected deliveries, or concerns the doctor raised.
- Plain, short English. No greetings, no filler.`;

export interface BriefHistory {
  today: string;
  visit: { clinicName: string; date: string; time: string; purpose: string };
  pastVisits: { date: string; status: string; purpose: string; notes?: string; clinicNote?: string; products: string[] }[];
  deliveries: { date: string; kind: string; status: string; items: string; clinicNote?: string }[];
  products: string[];
}

function historyBlock(h: BriefHistory): string {
  const visits = h.pastVisits.length
    ? h.pastVisits
        .map((v) =>
          [
            `- ${v.date} · ${v.status} · ${v.purpose}`,
            v.products.length ? `  Products: ${v.products.join(', ')}` : null,
            v.notes ? `  My notes: ${v.notes}` : null,
            v.clinicNote ? `  Clinic wrote: ${v.clinicNote}` : null,
          ]
            .filter(Boolean)
            .join('\n')
        )
        .join('\n')
    : '(none)';
  const deliveries = h.deliveries.length
    ? h.deliveries.map((d) => `- ${d.date} · ${d.kind} · ${d.status} · ${d.items}${d.clinicNote ? ` · Clinic wrote: ${d.clinicNote}` : ''}`).join('\n')
    : '(none)';
  return [
    `Today: ${h.today}`,
    `<upcoming_visit>\n${h.visit.clinicName}, ${h.visit.date} ${h.visit.time}. Purpose: ${h.visit.purpose}\n</upcoming_visit>`,
    `<past_visits newest_first="true">\n${visits}\n</past_visits>`,
    `<deliveries newest_first="true">\n${deliveries}\n</deliveries>`,
    `<my_products>\n${h.products.length ? h.products.join('\n') : '(none)'}\n</my_products>`,
  ].join('\n\n');
}

export async function briefRepVisit(history: BriefHistory): Promise<{ brief: VisitBrief; usage: AiUsage }> {
  if (!repAiConfigured()) throw new RepAiError('The AI assistant is not set up on this server.', 503);

  let response;
  try {
    response = await anthropic().beta.messages.parse({
      model: VISIT_BRIEF_MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: betaZodOutputFormat(VisitBriefSchema) },
      system: [{ type: 'text', text: BRIEF_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: historyBlock(history) }],
    });
  } catch (error) {
    throw apiError(error);
  }

  if (response.stop_reason === 'refusal') throw new RepAiError('The AI assistant declined to brief this visit.', 422);
  if (response.stop_reason === 'max_tokens') throw new RepAiError('The brief came out too long. Try again.', 502);
  const brief = response.parsed_output;
  if (!brief) throw new RepAiError('The AI assistant returned an incomplete brief. Try again.', 502);
  const clean = (xs: string[], n: number) => xs.map((x) => x.trim()).filter(Boolean).slice(0, n);
  return {
    brief: {
      headline: brief.headline.trim(),
      lastTime: brief.lastTime.trim(),
      openItems: clean(brief.openItems, 4),
      focus: clean(brief.focus, 3),
      cautions: clean(brief.cautions, 3),
    },
    usage: usageOf(response),
  };
}
