'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import VisitForm, { type VisitFormData } from './VisitForm';
import { formatApiError } from './utils/apiError';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';
import type { PatientOption } from './patients/PatientSearch';

interface QueueEntry {
  _id: string;
  queueNumber: string;
  patient: PatientOption | null;
  vitals?: VisitFormData['vitals'] | null;
}

interface DraftVisit extends Partial<VisitFormData> {
  _id: string;
  updatedAt?: string;
  patient: string;
  patientInfo: PatientOption | null;
}

interface Loaded {
  patient: PatientOption | null;
  queue: QueueEntry | null;
  queueFailed: boolean;
  providerName: string;
  draft: DraftVisit | null;
}

const shortQueue = (n: string) => n.replace(/^([A-Z]+)\d{8}-(\d+)$/, '$1-$2');

async function getJson(url: string) {
  const res = await fetch(url);
  if (res.status === 401) throw Object.assign(new Error('signed out'), { status: 401 });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw Object.assign(new Error(json?.error || `Request failed (${res.status})`), { status: res.status });
  return json;
}

const hasReadings = (v?: VisitFormData['vitals'] | null) => Boolean(v && Object.values(v).some((x) => x !== null && x !== undefined && x !== ''));

export default function VisitFormClient({ patientId, queueId, visitType }: { patientId?: string; queueId?: string; visitType?: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<{ status: number; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [useDraft, setUseDraft] = useState<'ask' | 'continue' | 'new'>('ask');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draftParams = new URLSearchParams({ status: 'draft', limit: '1', mine: 'true', ...(patientId ? { patientId } : {}) });
        const [patientRes, queueRes, meRes, draftRes] = await Promise.allSettled([
          patientId ? getJson(`/api/patients/${patientId}`) : Promise.resolve(null),
          queueId ? getJson(`/api/queue/${queueId}`) : Promise.resolve(null),
          getJson('/api/user/me'),
          getJson(`/api/visits?${draftParams}`),
        ]);
        if (cancelled) return;
        const signedOut = [patientRes, queueRes, meRes, draftRes].some((r) => r.status === 'rejected' && (r.reason as { status?: number })?.status === 401);
        if (signedOut) return router.push('/login');
        if (patientId && patientRes.status === 'rejected') {
          const reason = patientRes.reason as { status?: number; message?: string };
          setFailure({ status: reason.status ?? 0, message: reason.message ?? 'Request failed' });
          return;
        }

        const queue = queueRes.status === 'fulfilled' && queueRes.value ? (queueRes.value.data as QueueEntry) : null;
        const p = patientRes.status === 'fulfilled' && patientRes.value ? (patientRes.value.data as PatientOption) : queue?.patient ?? null;
        const rawDraft = draftRes.status === 'fulfilled' ? draftRes.value.data?.[0] : null;
        const draft: DraftVisit | null = rawDraft
          ? {
              ...rawDraft,
              patient: rawDraft.patient?._id ?? rawDraft.patient,
              patientInfo: rawDraft.patient?._id ? rawDraft.patient : null,
              followUpDate: rawDraft.followUpDate ? String(rawDraft.followUpDate).slice(0, 10) : '',
            }
          : null;
        // A draft for someone else is not offered when this visit is already for a known patient.
        const usableDraft = draft && (!p || draft.patient === p._id) ? draft : null;

        setLoaded({
          patient: p ? { _id: p._id, firstName: p.firstName, lastName: p.lastName, patientCode: p.patientCode, phone: p.phone, email: p.email } : null,
          queue,
          queueFailed: Boolean(queueId) && queueRes.status === 'rejected',
          providerName: meRes.status === 'fulfilled' ? meRes.value.data?.name || 'Attending doctor' : 'Attending doctor',
          draft: usableDraft,
        });
        setFailure(null);
      } catch (err) {
        if (!cancelled) setFailure({ status: 0, message: err instanceof Error ? err.message : 'Request failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, queueId, attempt, router]);

  const handleSubmit = async (data: VisitFormData): Promise<boolean> => {
    setError(null);
    const { _id: draftId, ...fields } = data;
    try {
      const body = JSON.stringify({ ...fields, status: 'open', date: new Date() });
      const res = draftId
        ? await fetch(`/api/visits/${draftId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
        : await fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (res.status === 401) {
        router.push('/login');
        return false;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(formatApiError(json, 'The visit could not be saved'));
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return false;
      }
      const params = new URLSearchParams({ saved: '1', ...(json.prescriptionId ? { rx: String(json.prescriptionId) } : {}) });
      router.push(`/visits/${json.data._id}?${params}`);
      return true;
    } catch {
      setError('The visit could not be saved. Check your connection and try again; your note is still here.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }
  };

  // --- States -------------------------------------------------------------------

  if (failure) {
    const missing = failure.status === 404 || failure.status === 400;
    return (
      <Shell back={queueId ? { href: '/queue', label: 'Queue' } : { href: '/visits', label: 'All visits' }}>
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
          <div className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md ${missing ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            <Svg d={ICON.alert} className="h-5 w-5" />
          </div>
          <p className="font-semibold text-gray-900">{missing ? 'Patient not found' : 'The new visit didn’t open'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {missing ? 'The patient may have been removed, or belongs to another clinic. Start the visit from Patients or the queue.' : `${failure.message}. Check your connection and try again.`}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/visits/new" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              Choose another patient
            </Link>
            {!missing && (
              <button type="button" onClick={() => setAttempt((a) => a + 1)} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Try again
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (!loaded) {
    return (
      <Shell back={queueId ? { href: '/queue', label: 'Queue' } : { href: '/visits', label: 'All visits' }}>
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="space-y-2">
            <div className="h-8 w-48 rounded bg-gray-200" />
            <div className="h-4 w-80 max-w-full rounded bg-gray-100" />
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="space-y-6">
              <div className="h-44 rounded-lg border border-gray-200 bg-white" />
              <div className="h-56 rounded-lg border border-gray-200 bg-white" />
            </div>
            <div className="h-72 rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
        <span className="sr-only" role="status">
          Opening a new visit…
        </span>
      </Shell>
    );
  }

  const { patient, queue, draft } = loaded;
  const continuing = draft && useDraft === 'continue';
  const queueVitals = queue && hasReadings(queue.vitals) ? queue.vitals : null;
  const formPatient = continuing ? draft.patientInfo ?? patient : patient;

  return (
    <Shell back={queue ? { href: '/queue', label: 'Queue' } : { href: '/visits', label: 'All visits' }}>
      <header className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{continuing ? 'Finish the draft' : 'New visit'}</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-600">
          {formPatient ? (
            <>
              For <span className="font-semibold text-gray-900">{formPatient.firstName} {formPatient.lastName}</span>
              {queue && (
                <>
                  , called in from the queue as <span className="font-mono">{shortQueue(queue.queueNumber)}</span>
                </>
              )}
              .
            </>
          ) : (
            'Choose the patient, then write the note. Save it as a draft if you need to come back to it.'
          )}
        </p>
      </header>

      {error && (
        <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <p>{error}</p>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICON.x} />
          </button>
        </div>
      )}

      {loaded.queueFailed && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The triage vital signs couldn’t be loaded from the queue. Enter them below, or check the queue entry.
        </p>
      )}

      {draft && useDraft === 'ask' && (
        <div role="status" className="motion-chip-in flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-amber-800">
            <span className="font-semibold">You have a draft</span>
            {draft.patientInfo && !patient && (
              <>
                {' '}
                for {draft.patientInfo.firstName} {draft.patientInfo.lastName}
              </>
            )}
            {draft.updatedAt && (
              <>
                , last saved <span className="font-mono">{new Date(draft.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              </>
            )}
            .
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setUseDraft('continue')} className={`rounded-md bg-brand-teal-dark px-3 py-1.5 font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
              Continue the draft
            </button>
            <button type="button" onClick={() => setUseDraft('new')} className={`rounded-md border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 hover:border-amber-500 ${FOCUS_RING}`}>
              Start a new visit
            </button>
          </div>
        </div>
      )}

      <VisitForm
        // Continuing the draft remounts the form so every field comes from it.
        key={continuing ? draft._id : 'new'}
        initialData={
          continuing
            ? { ...draft, status: 'draft', vitals: hasReadings(draft.vitals) ? draft.vitals : queueVitals ?? undefined }
            : {
                ...(formPatient ? { patient: formPatient._id } : {}),
                ...(queueVitals ? { vitals: queueVitals } : {}),
                ...(visitType === 'teleconsult' ? { visitType: 'teleconsult' as const } : {}),
              }
        }
        patients={formPatient ? [formPatient] : []}
        lockPatientSelection={Boolean(patient)}
        vitalsSource={queueVitals && !(continuing && hasReadings(draft.vitals)) ? `Filled in from triage (queue ${shortQueue(queue!.queueNumber)}). Correct anything that has changed.` : undefined}
        onSubmit={handleSubmit}
        onCancel={() => router.push(queue ? '/queue' : '/visits')}
        providerName={loaded.providerName}
      />
    </Shell>
  );
}

function Shell({ back, children }: { back: { href: string; label: string }; children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <Link href={back.href} className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
          <Svg d={ICON.chevL} />
          {back.label}
        </Link>
        {children}
      </div>
    </section>
  );
}
