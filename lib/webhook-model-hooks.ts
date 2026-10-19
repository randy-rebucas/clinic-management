import type { Schema, Query } from 'mongoose';
import { after } from 'next/server';

/**
 * Mongoose hooks that turn record changes into webhook events, so every path that creates a
 * patient or appointment, or changes an appointment's status (staff UI, patient app, public
 * booking, automations, the REST API), is covered without each call site remembering to.
 *
 * The hooks only collect ids; lib/webhook-events.ts (loaded lazily, server-side) does the
 * rest after the response. They never throw into the write that triggered them.
 */

const MAX_BULK_STATUS_EVENTS = 500;

function events() {
  return import('@/lib/webhook-events');
}

/**
 * Run after the response when inside a request (so serverless platforms keep the function
 * alive for it), otherwise straight away (cron jobs, scripts).
 */
function swallow(work: () => Promise<unknown>) {
  const run = () => work().catch((error) => console.error('[webhooks] model hook error:', error));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** The status an update sets, if it sets one. */
function statusSetBy(update: unknown): string | undefined {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return undefined;
  const u = update as Record<string, any>;
  const v = u.$set?.status ?? u.status;
  return typeof v === 'string' ? v : undefined;
}

export function attachPatientWebhookHooks(schema: Schema) {
  schema.pre('save', function (next) {
    this.$locals.wasNew = this.isNew;
    next();
  });
  schema.post('save', function (doc: any) {
    if (doc.$locals?.wasNew) swallow(() => events().then((m) => m.onPatientCreated(doc.toObject())));
  });
}

export function attachAppointmentWebhookHooks(schema: Schema) {
  schema.pre('save', async function () {
    this.$locals.wasNew = this.isNew;
    this.$locals.statusChanged = !this.isNew && this.isModified('status');
    if (this.$locals.statusChanged) {
      try {
        const before = await (this.constructor as any).findById(this._id).select('status').lean();
        this.$locals.previousStatus = before?.status;
      } catch {
        // previous_status is then reported as null
      }
    }
  });
  schema.post('save', function (doc: any) {
    if (doc.$locals?.wasNew) swallow(() => events().then((m) => m.onAppointmentCreated(doc.toObject())));
    else if (doc.$locals?.statusChanged) {
      swallow(() => events().then((m) => m.onAppointmentStatusChanged([{ id: String(doc._id), previous: doc.$locals.previousStatus }])));
    }
  });

  // Updates through queries: note which matching records will actually change status.
  for (const op of ['findOneAndUpdate', 'updateOne', 'updateMany'] as const) {
    schema.pre(op, async function (this: Query<unknown, unknown> & { _webhookChanges?: Array<{ id: string; previous?: string }> }) {
      const next = statusSetBy(this.getUpdate());
      if (!next) return;
      try {
        const filter = { ...this.getFilter(), status: { $ne: next } };
        const rows = await this.model
          .find(filter)
          .select('_id status')
          .limit(op === 'updateMany' ? MAX_BULK_STATUS_EVENTS : 1)
          .lean<{ _id: unknown; status?: string }[]>();
        this._webhookChanges = rows.map((r) => ({ id: String(r._id), previous: r.status }));
      } catch {
        this._webhookChanges = undefined;
      }
    });
    schema.post(op, function (this: Query<unknown, unknown> & { _webhookChanges?: Array<{ id: string; previous?: string }> }) {
      const changes = this._webhookChanges;
      if (changes?.length) swallow(() => events().then((m) => m.onAppointmentStatusChanged(changes)));
    });
  }
}
