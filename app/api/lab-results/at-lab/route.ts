import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import connectDB from '@/lib/mongodb';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { loadPatientsAtLab, openLabRequestsVersion } from '@/lib/lab-at-lab';

// Vercel can't host a Socket.IO server, so this is Server-Sent Events: one connection per open
// dashboard, checked against the database every few seconds, pushing only when something changed.
// The connection ends before the function's time limit and EventSource reconnects on its own
// (which also re-checks the session).
export const maxDuration = 300;

const TICK_MS = 3_000;
const HEARTBEAT_MS = 20_000;
const LIFETIME_MS = 270_000;

/**
 * GET /api/lab-results/at-lab (text/event-stream)
 * Events:
 *   `patients` — the full list of patients at the lab (see lib/lab-at-lab.ts), sent on connect and on change
 *   `requests` — an opaque version of the open lab requests; when it changes, refetch those panels
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'lab-results', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
  } catch (error) {
    console.error('At-lab stream: database unavailable', error);
    return NextResponse.json({ success: false, error: 'Failed to connect' }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const signal = request.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const startedAt = Date.now();
      let lastPatients = '';
      let lastRequests = '';
      let lastSentAt = 0;
      let closed = false;

      const send = (chunk: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(chunk));
        lastSentAt = Date.now();
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      signal.addEventListener('abort', close);

      // Reconnect quickly after the planned close.
      send('retry: 1000\n\n');

      const tick = async () => {
        if (closed) return;
        try {
          const [patients, requests] = await Promise.all([loadPatientsAtLab(tenantObjectId), openLabRequestsVersion(tenantObjectId)]);
          const patientsJson = JSON.stringify(patients);
          if (patientsJson !== lastPatients) {
            lastPatients = patientsJson;
            send(`event: patients\ndata: ${patientsJson}\n\n`);
          }
          const version = createHash('sha1').update(requests).digest('hex').slice(0, 16);
          if (version !== lastRequests) {
            lastRequests = version;
            send(`event: requests\ndata: ${JSON.stringify(version)}\n\n`);
          }
        } catch (error) {
          console.error('At-lab stream tick failed:', error);
        }
        if (closed) return;
        if (Date.now() - startedAt >= LIFETIME_MS) return close();
        if (Date.now() - lastSentAt >= HEARTBEAT_MS) send(': ping\n\n');
        timer = setTimeout(tick, TICK_MS);
      };
      void tick();
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform keeps compression from buffering the stream
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
