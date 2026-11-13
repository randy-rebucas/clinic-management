import { z } from 'zod';

/**
 * The rep AI assistant's structured outputs, as Claude returns them (lib/rep-ai.ts). Empty strings
 * and lists mean "not said" / "nothing to show". Client-safe.
 */

export const VisitNoteDraftSchema = z.object({
  summary: z.string().describe('Two to four plain sentences: what happened at the visit, in English.'),
  doctorInterest: z.enum(['high', 'medium', 'low', 'unclear']).describe("How interested the doctor or clinic seemed overall, from what the rep said."),
  products: z
    .array(
      z.object({
        catalogNumber: z.number().nullable().describe('The number of the matching product in <products>, or null when it is not in that list.'),
        name: z.string().describe('The product as the rep said it.'),
        reaction: z.string().describe("The doctor's reaction, question or request about it, in a few words. Empty if none was said."),
      })
    )
    .describe('Only products the rep said were discussed, shown or left.'),
  objections: z.array(z.string()).describe('Concerns the doctor raised (price, side effects, a competitor...), one short line each.'),
  commitments: z
    .array(z.object({ by: z.enum(['rep', 'clinic']), what: z.string() }))
    .describe('Things someone promised to do: the rep (bring samples, send a study) or the clinic (try it, order).'),
  followUp: z.object({
    inDays: z.number().nullable().describe('Days until the next visit or call if the rep said when; otherwise null.'),
    action: z.string().describe('What to do next, one line. Empty if nothing was said.'),
  }),
  warnings: z.array(z.string()).describe('Unclear words that matter (a product name, a quantity) for the rep to check. One sentence each.'),
});
export type VisitNoteDraft = z.infer<typeof VisitNoteDraftSchema>;

export const VisitBriefSchema = z.object({
  headline: z.string().describe('One sentence: the single most useful thing to know walking in.'),
  lastTime: z.string().describe('What happened at the most recent past visit, one or two sentences. Empty if there was none.'),
  openItems: z.array(z.string()).describe('Promises from earlier visits not yet shown as done, by the rep or the clinic. Up to 4.'),
  focus: z.array(z.string()).describe('Up to 3 concrete things to do or bring at this visit, drawn from the history.'),
  cautions: z.array(z.string()).describe('Patterns worth knowing: declines, no-shows, rejected deliveries, raised concerns. Up to 3.'),
});
export type VisitBrief = z.infer<typeof VisitBriefSchema>;

export const MAX_VISIT_NOTE_INPUT = 6000;

/** What the visit-note route returns to the app. */
export interface VisitNoteResult {
  /** Ready-to-edit notes text for the visit. */
  notes: string;
  /** Rep products the draft matched, to add to the visit. */
  productIds: string[];
  interest: VisitNoteDraft['doctorInterest'];
  followUp: VisitNoteDraft['followUp'];
  warnings: string[];
}
