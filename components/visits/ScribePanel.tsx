'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { MAX_TRANSCRIPT_CHARS, type ScribeDraft, type ScribeResult } from '@/lib/ai-scribe-schema';

/**
 * AI scribe: dictate (browser speech recognition) or paste the consult, get a draft note,
 * review it item by item, then apply the chosen parts to the visit form. Nothing is saved
 * until the doctor saves the visit.
 */

export interface ScribeSelection {
  draft: ScribeDraft;
  include: {
    chiefComplaint: boolean;
    historyOfPresentIllness: boolean;
    soap: Record<keyof ScribeDraft['soap'], boolean>;
    exam: boolean;
    diagnoses: boolean[];
    medications: boolean[];
    followUp: boolean;
  };
  /** Replace text already on the note instead of only filling blank fields. */
  replace: boolean;
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function speechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} bg-brand-teal-dark text-white hover:bg-brand-teal-deep`;
const SECONDARY = `${BUTTON} border border-gray-300 bg-white text-gray-900 hover:border-gray-900`;

const SOAP_LABEL: Record<keyof ScribeDraft['soap'], string> = {
  subjective: 'Subjective',
  objective: 'Objective',
  assessment: 'Assessment',
  plan: 'Plan',
};

export default function ScribePanel({
  open,
  onClose,
  patientId,
  visitType,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  patientId?: string;
  visitType: string;
  onApply: (selection: ScribeSelection) => void;
}) {
  const ids = useId();
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [lang, setLang] = useState('en-PH');
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScribeResult | null>(null);
  const [include, setInclude] = useState<ScribeSelection['include'] | null>(null);
  const [replace, setReplace] = useState(false);
  const [consent, setConsent] = useState(false);
  const recognizer = useRef<SpeechRecognitionLike | null>(null);
  const wantListening = useRef(false);
  const canDictate = Boolean(speechRecognition());

  useEffect(() => () => {
    wantListening.current = false;
    recognizer.current?.stop();
  }, []);

  const stopDictation = () => {
    wantListening.current = false;
    recognizer.current?.stop();
    setListening(false);
    setInterim('');
  };

  const startDictation = () => {
    const Recognition = speechRecognition();
    if (!Recognition) return;
    setMicError(null);
    const r = new Recognition();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finalText = '';
      let pending = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else pending += res[0].transcript;
      }
      if (finalText) setTranscript((t) => `${t}${t && !/\s$/.test(t) ? ' ' : ''}${finalText.trim()}`.slice(0, MAX_TRANSCRIPT_CHARS));
      setInterim(pending);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantListening.current = false;
        setMicError('The microphone is blocked. Allow it in the browser’s address bar, or type the notes instead.');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setMicError('Dictation stopped unexpectedly. Press Dictate to continue.');
      }
    };
    // Browsers end recognition after a pause; keep going until the doctor stops it.
    r.onend = () => {
      if (wantListening.current) {
        try {
          r.start();
          return;
        } catch {
          /* fall through */
        }
      }
      setListening(false);
      setInterim('');
    };
    recognizer.current = r;
    wantListening.current = true;
    r.start();
    setListening(true);
  };

  const draft = async () => {
    if (listening) stopDictation();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-scribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, patientId: patientId || undefined, visitType, consent }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.issues?.[0]?.message || json?.error || 'The draft could not be made. Try again.');
        return;
      }
      const r = json.data as ScribeResult;
      setResult(r);
      setInclude({
        chiefComplaint: Boolean(r.draft.chiefComplaint),
        historyOfPresentIllness: Boolean(r.draft.historyOfPresentIllness),
        soap: {
          subjective: Boolean(r.draft.soap.subjective),
          objective: Boolean(r.draft.soap.objective),
          assessment: Boolean(r.draft.soap.assessment),
          plan: Boolean(r.draft.soap.plan),
        },
        exam: r.draft.physicalExam.length > 0,
        diagnoses: r.draft.diagnoses.map(() => true),
        // Medicines that hit a recorded allergy start unticked.
        medications: r.draft.medications.map((m) => !r.allergyHits.includes(m.name)),
        followUp: Boolean(r.draft.followUp.instructions || r.draft.followUp.inDays),
      });
    } catch {
      setError('Could not reach the server. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (listening) stopDictation();
    onClose();
  };

  const apply = () => {
    if (!result || !include) return;
    onApply({ draft: result.draft, include, replace });
    setResult(null);
    setInclude(null);
    setTranscript('');
    onClose();
  };

  const d = result?.draft;

  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} labelledBy={`${ids}-h`} className="max-w-3xl" closeOnBackdrop={false}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 id={`${ids}-h`} className="text-lg font-bold tracking-tight text-gray-900">
            AI scribe
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {d
              ? 'Review the draft. Untick anything that’s wrong, then apply it to the note and edit as usual.'
              : 'Dictate or paste the consult. The scribe drafts the SOAP note, ICD-10 codes and prescription for you to check.'}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!d || !include ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-2">
                {canDictate ? (
                  <>
                    <div>
                      <label htmlFor={`${ids}-lang`} className="mb-1 block text-xs font-medium text-gray-600">
                        Dictation language
                      </label>
                      <select id={`${ids}-lang`} value={lang} onChange={(e) => setLang(e.target.value)} disabled={listening} className={`${FIELD} w-auto`}>
                        <option value="en-PH">English (Philippines)</option>
                        <option value="fil-PH">Filipino</option>
                        <option value="en-US">English (US)</option>
                      </select>
                    </div>
                    <button type="button" onClick={listening ? stopDictation : startDictation} className={listening ? `${BUTTON} bg-red-600 text-white hover:bg-red-700` : SECONDARY} aria-pressed={listening}>
                      <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${listening ? 'animate-pulse bg-white' : 'bg-red-600'}`} />
                      {listening ? 'Stop dictation' : 'Dictate'}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-gray-600">Live dictation needs Chrome or Edge. You can paste or type the notes below.</p>
                )}
              </div>
              {micError && <p role="alert" className="text-sm font-medium text-red-700">{micError}</p>}
              <div>
                <label htmlFor={`${ids}-t`} className="mb-1.5 block text-sm font-medium text-gray-700">
                  Consult transcript or notes
                </label>
                <textarea
                  id={`${ids}-t`}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={12}
                  maxLength={MAX_TRANSCRIPT_CHARS}
                  placeholder="e.g. 32F, 3 days ubo at sipon, may lagnat kagabi 38.2. Lungs clear. Throat erythematous, no exudates. Impression URTI. Paracetamol 500 mg every 4 hours as needed for fever, increase fluids, balik if may hirap huminga…"
                  className={`${FIELD} resize-y leading-relaxed`}
                />
                {interim && <p className="mt-1 text-sm italic text-gray-500" aria-live="polite">{interim}…</p>}
                <p className="mt-1 text-xs text-gray-500">
                  Only age, sex, allergies and current medicines are sent with the transcript, not the patient’s name. The transcript isn’t stored.
                </p>
              </div>
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal"
                />
                <span>
                  The patient agreed to this consult being processed by the AI scribe, an outside service (Anthropic) that may process it outside the Philippines.
                </span>
              </label>
              {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}
            </div>
          ) : (
            <ScribeReview result={result!} include={include} setInclude={setInclude} />
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          {d ? (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
              Replace text I already wrote
            </label>
          ) : (
            <span className="text-xs text-gray-500 tabular-nums">{transcript.length.toLocaleString()} characters</span>
          )}
          <div className="flex justify-end gap-2">
            {d ? (
              <>
                <button type="button" onClick={() => { setResult(null); setInclude(null); }} className={SECONDARY}>
                  Back to transcript
                </button>
                <button type="button" onClick={apply} className={PRIMARY}>
                  <Svg d={ICON.check} />
                  Apply to note
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={close} className={SECONDARY}>
                  Cancel
                </button>
                <button type="button" onClick={draft} disabled={busy || !consent || transcript.trim().length < 20} className={PRIMARY} aria-busy={busy}>
                  {busy ? 'Drafting… (up to a minute)' : 'Draft the note'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-gray-100 py-3 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <div className="flex flex-col gap-2 text-sm text-gray-900">{children}</div>
    </section>
  );
}

function ScribeReview({
  result,
  include,
  setInclude,
}: {
  result: ScribeResult;
  include: ScribeSelection['include'];
  setInclude: (next: ScribeSelection['include']) => void;
}) {
  const d = result.draft;
  const set = (patch: Partial<ScribeSelection['include']>) => setInclude({ ...include, ...patch });
  const flip = (key: 'diagnoses' | 'medications', i: number, v: boolean) => set({ [key]: include[key].map((x, j) => (j === i ? v : x)) });

  return (
    <div>
      {(d.warnings.length > 0 || result.allergyHits.length > 0) && (
        <div role="alert" className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <Svg d={ICON.alert} className="h-4 w-4" />
            Check before signing
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {result.allergyHits.map((m) => (
              <li key={`allergy-${m}`}>
                <strong>{m}</strong> matches an allergy on the patient’s record. It is unticked.
              </li>
            ))}
            {d.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {(d.chiefComplaint || d.historyOfPresentIllness) && (
        <Block title="History">
          {d.chiefComplaint && (
            <Check checked={include.chiefComplaint} onChange={(v) => set({ chiefComplaint: v })}>
              <span className="font-medium">Chief complaint:</span> {d.chiefComplaint}
            </Check>
          )}
          {d.historyOfPresentIllness && (
            <Check checked={include.historyOfPresentIllness} onChange={(v) => set({ historyOfPresentIllness: v })}>
              <span className="font-medium">HPI:</span> <span className="whitespace-pre-line">{d.historyOfPresentIllness}</span>
            </Check>
          )}
        </Block>
      )}

      <Block title="SOAP">
        {(Object.keys(SOAP_LABEL) as Array<keyof ScribeDraft['soap']>).map((k) =>
          d.soap[k] ? (
            <Check key={k} checked={include.soap[k]} onChange={(v) => set({ soap: { ...include.soap, [k]: v } })}>
              <span className="font-medium">{SOAP_LABEL[k]}:</span> <span className="whitespace-pre-line">{d.soap[k]}</span>
            </Check>
          ) : (
            <p key={k} className="pl-6 text-gray-500">
              {SOAP_LABEL[k]}: not mentioned
            </p>
          )
        )}
      </Block>

      {d.physicalExam.length > 0 && (
        <Block title="Examination">
          <Check checked={include.exam} onChange={(v) => set({ exam: v })}>
            <ul className="space-y-0.5">
              {d.physicalExam.map((p) => (
                <li key={p.system}>
                  <span className="font-medium capitalize">{p.system === 'heent' ? 'HEENT' : p.system === 'lymphNotes' ? 'Lymph nodes' : p.system}:</span> {p.finding}
                </li>
              ))}
            </ul>
          </Check>
        </Block>
      )}

      {d.diagnoses.length > 0 && (
        <Block title="Diagnoses (ICD-10)">
          {d.diagnoses.map((dx, i) => {
            const verified = result.verifiedCodes.includes(dx.code);
            return (
              <Check key={`${dx.code}-${i}`} checked={include.diagnoses[i]} onChange={(v) => flip('diagnoses', i, v)}>
                <span className="font-mono font-semibold">{dx.code}</span> {dx.description}
                {dx.primary && <span className="ml-1.5 rounded bg-brand-teal-light px-1.5 py-0.5 text-xs font-semibold text-brand-teal-deep">Primary</span>}
                {!verified && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">Code not found — check it</span>}
                {dx.rationale && <span className="block text-xs text-gray-500">{dx.rationale}</span>}
              </Check>
            );
          })}
        </Block>
      )}

      {d.medications.length > 0 && (
        <Block title="Prescription">
          {d.medications.map((m, i) => (
            <Check key={`${m.name}-${i}`} checked={include.medications[i]} onChange={(v) => flip('medications', i, v)}>
              <span className="font-semibold">{m.name}</span>{' '}
              {[m.dosage, m.frequency, m.duration, m.quantity != null ? `#${m.quantity}` : ''].filter(Boolean).join(' · ') || (
                <span className="text-amber-800">dose not stated</span>
              )}
              {m.instructions && <span className="block text-xs text-gray-500">{m.instructions}</span>}
              {result.allergyHits.includes(m.name) && <span className="mt-0.5 block text-xs font-semibold text-red-700">Matches a recorded allergy</span>}
            </Check>
          ))}
        </Block>
      )}

      {(d.followUp.instructions || d.followUp.inDays) && (
        <Block title="Follow-up">
          <Check checked={include.followUp} onChange={(v) => set({ followUp: v })}>
            {d.followUp.inDays ? <span className="font-medium">In {d.followUp.inDays} days. </span> : null}
            {d.followUp.instructions}
          </Check>
        </Block>
      )}
    </div>
  );
}
