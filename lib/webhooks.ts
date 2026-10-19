import 'server-only';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import https from 'https';
import net from 'net';
import { lookup as dnsLookup } from 'dns/promises';
import { after } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import WebhookEndpoint, { type WebhookEvent } from '@/models/WebhookEndpoint';
import WebhookDelivery from '@/models/WebhookDelivery';
import { createPinnedLookup, isPrivateAddress } from '@/lib/lab-integration';
import { encryptData, decryptData } from '@/lib/encryption';
import { tenantHasApiAccess } from '@/lib/api-keys';

/**
 * Outgoing webhooks. An event is written as one WebhookDelivery per subscribed endpoint, sent
 * right after the response (next/server `after`), and retried by /api/cron/webhook-deliveries
 * on a backoff. Each request is signed:
 *
 *   MCS-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 *
 * Bodies: { id, type, created_at, data: { object } }.
 */

/** Minutes to wait after attempt n (1-based) fails. Attempt 7 failing marks the delivery failed. */
export const RETRY_BACKOFF_MIN = [1, 5, 30, 120, 360, 720];
export const MAX_ATTEMPTS = RETRY_BACKOFF_MIN.length + 1;
export const DISABLE_AFTER_FAILURES = 25;
const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export function encryptSecret(secret: string): string {
  return encryptData(secret);
}

export function decryptSecret(enc: string): string {
  return decryptData(enc);
}

export function signPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/**
 * Check a webhook URL before saving it: https, no credentials, and a host that resolves only
 * to public addresses. Sending re-checks at connect time (DNS rebinding). Returns an error or null.
 */
export async function checkWebhookUrl(raw: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'Enter a full URL, starting with https://';
  }
  if (url.protocol !== 'https:') return 'Webhook URLs must use https.';
  if (url.username || url.password) return 'Webhook URLs must not contain a username or password.';
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  try {
    const addresses = net.isIP(host) ? [{ address: host }] : await dnsLookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) return 'Webhook URLs must point to a public address.';
  } catch {
    return 'That host could not be found.';
  }
  return null;
}

type SendResult = { status: number } | { error: string };

/** POST over https with connect-time address pinning, no redirects, a timeout and a size cap. */
function postSigned(url: string, body: string, headers: Record<string, string>): Promise<SendResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: SendResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    let req: ReturnType<typeof https.request>;
    try {
      req = https.request(
        url,
        {
          method: 'POST',
          lookup: createPinnedLookup() as any,
          headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body).toString() },
          timeout: TIMEOUT_MS,
        },
        (res) => {
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_RESPONSE_BYTES) res.destroy();
          });
          res.on('end', () => done({ status: res.statusCode || 0 }));
          res.on('close', () => done({ status: res.statusCode || 0 }));
          res.on('error', () => done({ status: res.statusCode || 0 }));
        }
      );
    } catch (error) {
      return done({ error: (error as Error).message || 'Request failed' });
    }
    const deadline = setTimeout(() => req.destroy(new Error('Timed out')), TIMEOUT_MS);
    req.on('timeout', () => req.destroy(new Error('Timed out')));
    req.on('error', (error: NodeJS.ErrnoException) =>
      done({ error: error.code === 'EBLOCKEDADDRESS' ? 'Refused: the host resolves to a non-public address' : error.message || 'Request failed' })
    );
    req.on('close', () => clearTimeout(deadline));
    req.end(body);
  });
}

/** How long a sender holds a delivery before another may take it over. */
const LEASE_MS = 5 * 60_000;
/** New deliveries are left to the in-request send this long before the cron may pick them up. */
const FIRST_SEND_GRACE_MS = 2 * 60_000;

/**
 * Send one delivery and record the outcome (and the next retry, if any). The delivery is first
 * claimed by pushing nextAttemptAt out by a lease, so the in-request send and the cron, or two
 * cron runs, never send it twice. `dueBy` is the latest nextAttemptAt this caller may claim.
 */
export async function attemptDelivery(
  deliveryId: string | Types.ObjectId,
  dueBy: Date = new Date()
): Promise<'succeeded' | 'pending' | 'failed' | 'skipped'> {
  await connectDB();
  const delivery = await WebhookDelivery.findOneAndUpdate(
    { _id: deliveryId, status: 'pending', nextAttemptAt: { $lte: dueBy } },
    { $set: { nextAttemptAt: new Date(Date.now() + LEASE_MS) } },
    { new: true }
  ).lean<any>();
  if (!delivery) return 'skipped';
  const endpoint = await WebhookEndpoint.findById(delivery.endpointId).select('+secretEnc url enabled consecutiveFailures').lean<any>();
  if (!endpoint || !endpoint.enabled) {
    await WebhookDelivery.updateOne({ _id: delivery._id }, { $set: { status: 'failed', error: 'Endpoint removed or disabled', nextAttemptAt: null } });
    return 'failed';
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const result = await postSigned(endpoint.url, delivery.body, {
    'User-Agent': 'MyClinicSoft-Webhooks/1.0',
    'MCS-Event': delivery.event,
    'MCS-Delivery': String(delivery._id),
    'MCS-Signature': signPayload(decryptSecret(endpoint.secretEnc), delivery.body, timestamp),
  });

  const attempts = (delivery.attempts ?? 0) + 1;
  const ok = 'status' in result && result.status >= 200 && result.status < 300;
  const now = new Date();
  const status: 'succeeded' | 'pending' | 'failed' = ok ? 'succeeded' : attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
  const nextAttemptAt = status === 'pending' ? new Date(now.getTime() + RETRY_BACKOFF_MIN[attempts - 1] * 60_000) : null;

  await WebhookDelivery.updateOne(
    { _id: delivery._id },
    {
      $set: {
        status,
        attempts,
        lastAttemptAt: now,
        nextAttemptAt,
        responseStatus: 'status' in result ? result.status : undefined,
        error: ok ? undefined : 'error' in result ? result.error.slice(0, 500) : `HTTP ${result.status}`,
      },
    }
  );

  if (ok) {
    if (endpoint.consecutiveFailures) await WebhookEndpoint.updateOne({ _id: endpoint._id }, { $set: { consecutiveFailures: 0 } });
  } else {
    const updated = await WebhookEndpoint.findOneAndUpdate(
      { _id: endpoint._id },
      { $inc: { consecutiveFailures: 1 } },
      { new: true, projection: { consecutiveFailures: 1 } }
    ).lean<any>();
    if (updated && updated.consecutiveFailures >= DISABLE_AFTER_FAILURES) {
      await WebhookEndpoint.updateOne(
        { _id: endpoint._id },
        { $set: { enabled: false, disabledReason: `Turned off after ${DISABLE_AFTER_FAILURES} failed deliveries in a row` } }
      );
    }
  }
  return status;
}

function runSoon(task: () => Promise<unknown>) {
  const run = () => task().catch((error) => console.error('[webhooks] delivery error:', error));
  try {
    after(run);
  } catch {
    // Outside a request (cron, scripts): run now without blocking the caller.
    void run();
  }
}

/**
 * Queue a delivery to every endpoint of the clinic subscribed to this event and make the
 * first attempt. Never throws. Inside a request, call it through emitWebhookEventSoon.
 */
export async function emitWebhookEvent(tenantId: string | Types.ObjectId, type: WebhookEvent, object: Record<string, unknown>): Promise<void> {
  try {
    await connectDB();
    const tid = new Types.ObjectId(String(tenantId));
    const endpoints = await WebhookEndpoint.find({ tenantId: tid, enabled: true, events: type }).select('_id').lean<any[]>();
    if (!endpoints.length) return;
    if (!(await tenantHasApiAccess(tid, 'webhooks'))) return;

    const eventId = `evt_${randomUUID().replace(/-/g, '')}`;
    const body = JSON.stringify({ id: eventId, type, created_at: new Date().toISOString(), data: { object } });
    const firstSendBy = new Date(Date.now() + FIRST_SEND_GRACE_MS);
    const deliveries = await WebhookDelivery.insertMany(
      endpoints.map((e) => ({ tenantId: tid, endpointId: e._id, eventId, event: type, body, status: 'pending', attempts: 0, nextAttemptAt: firstSendBy }))
    );
    // Callers run this after the response (see emitWebhookEventSoon and the model hooks),
    // so the first attempt is awaited here; anything it misses the cron sends.
    await Promise.all(deliveries.map((d) => attemptDelivery(d._id, firstSendBy)));
  } catch (error) {
    console.error(`[webhooks] Failed to queue ${type}:`, error);
  }
}

/** Fire-and-forget form for call sites that must not wait on the event being queued. */
export function emitWebhookEventSoon(tenantId: string | Types.ObjectId, type: WebhookEvent, object: Record<string, unknown>): void {
  runSoon(() => emitWebhookEvent(tenantId, type, object));
}

/** Send a `ping` event to one endpoint now and report how it went. */
export async function sendTestEvent(tenantId: string, endpointId: string) {
  await connectDB();
  const eventId = `evt_${randomUUID().replace(/-/g, '')}`;
  const body = JSON.stringify({ id: eventId, type: 'ping', created_at: new Date().toISOString(), data: { object: { message: 'Test event from MyClinicSoft' } } });
  const now = new Date();
  const delivery = await WebhookDelivery.create({
    tenantId: new Types.ObjectId(tenantId),
    endpointId: new Types.ObjectId(endpointId),
    eventId,
    event: 'ping',
    body,
    status: 'pending',
    attempts: MAX_ATTEMPTS - 1, // one try, no retries
    nextAttemptAt: now,
  });
  await attemptDelivery(delivery._id, now);
  return WebhookDelivery.findById(delivery._id).select('status responseStatus error').lean<any>();
}

/** Send a past delivery once more, now. */
export async function redeliver(tenantId: string, deliveryId: string) {
  await connectDB();
  const now = new Date();
  const updated = await WebhookDelivery.findOneAndUpdate(
    { _id: deliveryId, tenantId: new Types.ObjectId(tenantId), status: { $in: ['failed', 'succeeded'] } },
    { $set: { status: 'pending', attempts: MAX_ATTEMPTS - 1, nextAttemptAt: now } },
    { new: true, projection: { _id: 1 } }
  ).lean<any>();
  if (!updated) return null;
  await attemptDelivery(updated._id, now);
  return WebhookDelivery.findById(updated._id).select('status responseStatus error').lean<any>();
}

/** Cron: send every delivery that is due. Bounded so one run stays inside its time limit. */
export async function processDueDeliveries(limit = 200): Promise<{ attempted: number; succeeded: number; failed: number }> {
  await connectDB();
  const due = await WebhookDelivery.find({ status: 'pending', nextAttemptAt: { $lte: new Date() } })
    .sort({ nextAttemptAt: 1 })
    .limit(limit)
    .select('_id')
    .lean<any[]>();
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < due.length; i += 10) {
    const results = await Promise.all(due.slice(i, i + 10).map((d) => attemptDelivery(d._id)));
    succeeded += results.filter((r) => r === 'succeeded').length;
    failed += results.filter((r) => r === 'failed').length;
  }
  return { attempted: due.length, succeeded, failed };
}
