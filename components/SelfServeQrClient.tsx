"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { printInviteSlip } from "./patients/printInviteSlip";

const QRCode = dynamic(() => import("react-qr-code"), { ssr: false });

/** How long the sign-in QR stays on screen, and the one-time extension (server keeps it 90 s). */
const QR_SECONDS = 45;
const EXTEND_SECONDS = 30;
/** Kiosk: back to the start after this long without a touch. */
const KIOSK_IDLE_MS = 60_000;
/** Invite slips stay up for printing, then the kiosk resets. */
const INVITE_IDLE_MS = 120_000;

type Step = "phone" | "code" | "person" | "questions" | "result";
type Kind = "login" | "invite";
type Person = {
  id: string;
  name: string;
  relation: "self" | "child";
  clinicName: string;
  hasPatientCode: boolean;
};
type Doctor = { id: string; name: string };
type Result =
  | { kind: "login"; qrData: string; expiresAt: string }
  | { kind: "invite"; code: string; link: string; expiresAt: string };

const EMPTY_ANSWERS = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  patientCode: "",
  lastVisitDate: "",
  doctorId: "",
};

const RELATIONSHIPS = [
  { value: "child", label: "My child" },
  { value: "grandchild", label: "My grandchild" },
  { value: "sibling", label: "My brother or sister" },
  { value: "other", label: "Someone I look after" },
] as const;

// Touch-first sizing: 48 px+ targets, 16 px text (no iOS zoom), no double-tap delay.
const INPUT =
  "block w-full min-h-12 rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30 touch-manipulation";
const LABEL = "mb-1.5 block text-base font-medium text-gray-900";
const PRIMARY =
  "flex w-full min-h-14 items-center justify-center rounded-lg bg-brand-teal-dark px-5 py-3 text-lg font-semibold text-white active:bg-brand-teal-deep disabled:opacity-60 touch-manipulation select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2";
const SECONDARY =
  "flex w-full min-h-12 items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-base font-semibold text-gray-900 active:bg-gray-100 disabled:opacity-60 touch-manipulation select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2";
const CHOICE =
  "flex w-full min-h-14 items-center gap-3 rounded-lg border-2 px-4 py-3 text-left text-base touch-manipulation select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2";

/** Keep the focused field above the on-screen keyboard. */
function keepInView(e: React.FocusEvent<HTMLElement>) {
  const el = e.currentTarget;
  setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && json.success !== false, status: res.status, json };
}

/**
 * Self-serve sign-in QR: phone → SMS code → choose person → verification questions → QR shown
 * for QR_SECONDS (+EXTEND_SECONDS once), then revoked and back to the start. `kiosk` adds an idle
 * reset and keeps nothing between people. The flow never stores anything in the browser.
 */
export default function SelfServeQrClient({
  tenantId,
  clinicName,
  kiosk = false,
}: {
  tenantId?: string | null;
  clinicName?: string | null;
  kiosk?: boolean;
}) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [person, setPerson] = useState<Person | null>(null);
  const [kind, setKind] = useState<Kind>("login");
  const [relationship, setRelationship] = useState<string>("child");
  const [answers, setAnswers] = useState(EMPTY_ANSWERS);
  const [doctors, setDoctors] = useState<Doctor[] | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(QR_SECONDS);
  const [extended, setExtended] = useState(false);
  const slipRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const reset = useCallback((message?: string) => {
    setStep("phone");
    setPhone("");
    setOtp("");
    setTicket(null);
    setPeople([]);
    setPerson(null);
    setKind("login");
    setRelationship("child");
    setAnswers(EMPTY_ANSWERS);
    setDoctors(null);
    setResult(null);
    setError(null);
    setNotice(message ?? null);
    setBusy(false);
    setExtended(false);
    setSecondsLeft(QR_SECONDS);
  }, []);

  // Each step change moves focus to its heading, for screen readers and switch users.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  /** Leave the QR screen: the QR stops working, even if someone photographed it. */
  const finish = useCallback(
    (message?: string) => {
      if (result?.kind === "login" && ticket && person) {
        void post("/api/patients/self-qr/revoke", { ticket, patientId: person.id }).catch(() => {});
      }
      reset(message);
    },
    [result, ticket, person, reset]
  );

  // Sign-in QR countdown.
  useEffect(() => {
    if (step !== "result" || result?.kind !== "login") return;
    const t = setTimeout(() => {
      if (secondsLeft <= 1) finish("The QR code was closed for your privacy. Start again if you still need one.");
      else setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [step, result, secondsLeft, finish]);

  // Kiosk idle reset (any step but the counting-down QR). Invite slips get longer to print.
  useEffect(() => {
    if (!kiosk || step === "phone" || (step === "result" && result?.kind === "login")) return;
    const wait = step === "result" ? INVITE_IDLE_MS : KIOSK_IDLE_MS;
    let timer = setTimeout(() => finish(), wait);
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(), wait);
    };
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [kiosk, step, result, finish]);

  const ticketExpired = (json: any) => {
    if (json?.code === "TICKET_EXPIRED") {
      reset("That took a little too long, so we started over. Please enter your number again.");
      return true;
    }
    return false;
  };

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!phone.trim()) return setError("Enter the mobile number the clinic has on file.");
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await post("/api/patients/auth/otp/request", { phone, tenantId: tenantId || undefined });
      if (!r.ok) return setError(r.json.error || "We couldn’t send a code. Please try again.");
      setOtp("");
      setStep("code");
    } catch {
      setError("No connection. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) return setError("Enter the 6-digit code from the text message.");
    setBusy(true);
    setError(null);
    try {
      const r = await post("/api/patients/self-qr/verify", { phone, otp, tenantId: tenantId || undefined });
      if (!r.ok) return setError(r.json.error || "That code didn’t work. Please try again.");
      setTicket(r.json.data.ticket);
      setPeople(r.json.data.people);
      setStep("person");
    } catch {
      setError("No connection. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const choosePerson = async (p: Person) => {
    setPerson(p);
    setAnswers(EMPTY_ANSWERS);
    setDoctors(null);
    setError(null);
    setStep("questions");
    try {
      const r = await post("/api/patients/self-qr/doctors", { ticket, patientId: p.id });
      if (ticketExpired(r.json)) return;
      if (!r.ok) return setError(r.json.error || "Something went wrong. Please try again.");
      setDoctors(r.json.data.doctors);
    } catch {
      setError("No connection. Please try again.");
    }
  };

  const submitAnswers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person || !ticket) return;
    const a = answers;
    if (!a.firstName.trim() || !a.lastName.trim() || !a.dateOfBirth || !a.lastVisitDate || !a.doctorId || (person.hasPatientCode && !a.patientCode.trim())) {
      return setError("Please answer every question.");
    }
    setBusy(true);
    setError(null);
    try {
      const r = await post("/api/patients/self-qr/issue", {
        ticket,
        patientId: person.id,
        kind,
        ...(person.relation === "child" && kind === "invite" ? { relationship } : {}),
        answers: {
          firstName: a.firstName,
          lastName: a.lastName,
          dateOfBirth: a.dateOfBirth,
          ...(person.hasPatientCode ? { patientCode: a.patientCode } : {}),
          lastVisitDate: a.lastVisitDate,
          doctorId: a.doctorId,
        },
      });
      if (ticketExpired(r.json)) return;
      if (!r.ok) return setError(r.json.error || "Something went wrong. Please try again.");
      setResult(r.json.data);
      setSecondsLeft(QR_SECONDS);
      setExtended(false);
      setStep("result");
    } catch {
      setError("No connection. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const set = (field: keyof typeof EMPTY_ANSWERS) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAnswers((prev) => ({ ...prev, [field]: e.target.value }));

  const today = new Date().toISOString().slice(0, 10);
  const whose = person?.relation === "child" ? `${person.name}’s` : "your";

  return (
    <div className={`mx-auto w-full max-w-lg touch-manipulation ${kiosk ? "py-6" : "py-10"}`}>
      {clinicName && <p className="mb-1 text-center text-sm font-medium text-brand-teal-dark">{clinicName}</p>}

      {notice && (
        <p role="status" className="mb-4 rounded-lg bg-brand-teal-light/70 px-4 py-3 text-base text-brand-teal-deep">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-base font-medium text-red-800">
          {error}
        </p>
      )}

      {step === "phone" && (
        <form onSubmit={sendCode} className="space-y-5" autoComplete={kiosk ? "off" : "on"}>
          <Heading refEl={headingRef} title="Get your app sign-in QR" sub="For you or a child you look after. No need to see the front desk." />
          <div>
            <label htmlFor="sq-phone" className={LABEL}>Mobile number on file at the clinic</label>
            <input
              id="sq-phone"
              type="tel"
              inputMode="tel"
              autoComplete={kiosk ? "off" : "tel"}
              placeholder="0917 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onFocus={keepInView}
              className={INPUT}
            />
            <p className="mt-2 text-sm text-gray-600">Parents: use the number the clinic has for your child.</p>
          </div>
          <button type="submit" disabled={busy} className={PRIMARY}>{busy ? "Sending…" : "Text me a code"}</button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verifyCode} className="space-y-5" autoComplete="off">
          <Heading refEl={headingRef} title="Enter the code" sub={`We texted a 6-digit code to ${phone} if it’s on file. It expires in 5 minutes.`} />
          <div>
            <label htmlFor="sq-otp" className={LABEL}>6-digit code</label>
            <input
              id="sq-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              onFocus={keepInView}
              className={`${INPUT} text-center font-mono text-2xl tracking-[0.4em]`}
            />
          </div>
          <button type="submit" disabled={busy} className={PRIMARY}>{busy ? "Checking…" : "Continue"}</button>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => sendCode()} disabled={busy} className={SECONDARY}>Send again</button>
            <button type="button" onClick={() => reset()} className={SECONDARY}>Change number</button>
          </div>
        </form>
      )}

      {step === "person" && (
        <div className="space-y-5">
          <Heading refEl={headingRef} title="Who is this for?" sub="Choose the person, then what you need." />
          <fieldset>
            <legend className={LABEL}>I need</legend>
            <div role="radiogroup" aria-label="I need" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ChoiceButton selected={kind === "login"} onSelect={() => setKind("login")} title="Sign-in QR" sub="Scan now with the eMCR app" />
              <ChoiceButton selected={kind === "invite"} onSelect={() => setKind("invite")} title="Invite slip" sub="Set up the app later" />
            </div>
          </fieldset>
          <div className="space-y-3">
            {people.map((p) => (
              <button key={p.id} type="button" onClick={() => choosePerson(p)} className={`${CHOICE} border-gray-200 bg-white active:border-brand-teal`}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-teal-light text-lg font-bold text-brand-teal-deep" aria-hidden>
                  {p.name[0]}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-gray-900">{p.name}{p.relation === "child" ? " (child)" : ""}</span>
                  <span className="block truncate text-sm text-gray-600">{p.clinicName}</span>
                </span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => reset()} className={SECONDARY}>Start over</button>
        </div>
      )}

      {step === "questions" && person && (
        <form onSubmit={submitAnswers} className="space-y-5" autoComplete="off">
          <Heading refEl={headingRef} title="Confirm it’s you" sub={`Answer these about ${person.relation === "child" ? person.name : "yourself"} so we know the record is ${whose === "your" ? "yours" : "in the right hands"}.`} />
          <div className="rounded-lg border border-brand-teal/30 bg-brand-teal-light/50 px-4 py-3 text-base text-brand-teal-deep">
            <strong className="font-semibold">Tip:</strong> {whose === "your" ? "Your" : `${person.name}’s`} <strong>Patient code</strong> and
            the <strong>date and doctor of the last visit</strong> are printed on the latest prescription from the clinic.
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sq-first" className={LABEL}>First name</label>
              <input id="sq-first" type="text" autoComplete="off" autoCapitalize="words" value={answers.firstName} onChange={set("firstName")} onFocus={keepInView} className={INPUT} />
            </div>
            <div>
              <label htmlFor="sq-last" className={LABEL}>Last name</label>
              <input id="sq-last" type="text" autoComplete="off" autoCapitalize="words" value={answers.lastName} onChange={set("lastName")} onFocus={keepInView} className={INPUT} />
            </div>
          </div>
          <div>
            <label htmlFor="sq-dob" className={LABEL}>Date of birth</label>
            <input id="sq-dob" type="date" max={today} value={answers.dateOfBirth} onChange={set("dateOfBirth")} onFocus={keepInView} className={INPUT} />
          </div>
          {person.hasPatientCode && (
            <div>
              <label htmlFor="sq-code" className={LABEL}>Patient code</label>
              <input id="sq-code" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="As printed on the prescription" value={answers.patientCode} onChange={set("patientCode")} onFocus={keepInView} className={`${INPUT} font-mono uppercase`} />
            </div>
          )}
          <div>
            <label htmlFor="sq-visit" className={LABEL}>Date of the last visit</label>
            <input id="sq-visit" type="date" max={today} value={answers.lastVisitDate} onChange={set("lastVisitDate")} onFocus={keepInView} className={INPUT} />
            <p className="mt-2 text-sm text-gray-600">The “Date Issued” on the prescription works too.</p>
          </div>
          <fieldset>
            <legend className={LABEL}>Doctor seen at that visit</legend>
            {doctors === null ? (
              <p className="text-base text-gray-600">Loading doctors…</p>
            ) : doctors.length === 0 ? (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-base text-amber-900">
                We don’t have a visit on file for {person.relation === "child" ? person.name : "you"} yet. Please ask the front desk for a QR code.
              </p>
            ) : (
              <div role="radiogroup" aria-label="Doctor seen at that visit" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {doctors.map((d) => (
                  <ChoiceButton
                    key={d.id}
                    selected={answers.doctorId === d.id}
                    onSelect={() => setAnswers((prev) => ({ ...prev, doctorId: d.id }))}
                    title={d.name}
                  />
                ))}
              </div>
            )}
          </fieldset>
          {person.relation === "child" && kind === "invite" && (
            <div>
              <label htmlFor="sq-rel" className={LABEL}>{person.name} is</label>
              <select id="sq-rel" value={relationship} onChange={(e) => setRelationship(e.target.value)} className={INPUT}>
                {RELATIONSHIPS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          )}
          <div className="sticky bottom-0 -mx-4 space-y-3 bg-white/95 px-4 pb-4 pt-2 backdrop-blur">
            <button type="submit" disabled={busy || !doctors?.length} className={PRIMARY}>
              {busy ? "Checking…" : kind === "login" ? "Show my sign-in QR" : "Make my invite slip"}
            </button>
            <button type="button" onClick={() => { setError(null); setStep("person"); }} className={SECONDARY}>Back</button>
          </div>
        </form>
      )}

      {step === "result" && result?.kind === "login" && (
        <div className="space-y-5 text-center">
          <Heading refEl={headingRef} title="Scan with the eMCR app" sub="Open eMCR, tap “Scan QR”, and point the camera at this code. It works once." />
          <div className="relative mx-auto w-fit rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
            <QRCode value={result.qrData} size={260} />
          </div>
          <Countdown seconds={secondsLeft} total={extended ? QR_SECONDS + EXTEND_SECONDS : QR_SECONDS} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!extended && (
              <button type="button" onClick={() => { setExtended(true); setSecondsLeft((s) => s + EXTEND_SECONDS); }} className={SECONDARY}>
                I need more time (+{EXTEND_SECONDS}s)
              </button>
            )}
            <button type="button" onClick={() => finish("All done. You can close this page.")} className={`${PRIMARY} ${extended ? "sm:col-span-2" : ""}`}>
              Done
            </button>
          </div>
        </div>
      )}

      {step === "result" && result?.kind === "invite" && person && (
        <div className="space-y-5 text-center">
          <Heading refEl={headingRef} title="Your invite slip" sub={`Install eMCR, tap “I have an invite from my clinic” and scan this. We’ll text a code to ${phone}.`} />
          <div ref={slipRef} className="mx-auto max-w-xs rounded-xl bg-white p-5 ring-1 ring-gray-200">
            <div className="slip">
              <h1 className="text-base font-bold text-gray-900">{person.clinicName} invites you to eMCR</h1>
              <p className="text-sm text-gray-600">Health records for {person.relation === "child" ? `${person.name}’s parent or carer` : person.name}</p>
              <div className="qr mx-auto my-3 w-fit">
                <QRCode value={result.link} size={200} />
              </div>
              <p className="code font-mono text-2xl font-bold tracking-widest text-gray-900">{result.code}</p>
              <p className="muted text-sm text-gray-500">
                Valid until {new Date(result.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · works once
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => { if (!printInviteSlip(slipRef.current)) setError("Allow pop-ups for this site to print the slip."); }} className={SECONDARY}>
              Print slip
            </button>
            <button type="button" onClick={() => finish("All done. You can close this page.")} className={PRIMARY}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Heading({ title, sub, refEl }: { title: string; sub: string; refEl: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="text-center">
      <h1 ref={refEl} tabIndex={-1} className="text-2xl font-bold tracking-tight text-gray-900 focus:outline-none sm:text-3xl">
        {title}
      </h1>
      <p className="mt-2 text-base text-gray-600">{sub}</p>
    </div>
  );
}

function ChoiceButton({ selected, onSelect, title, sub }: { selected: boolean; onSelect: () => void; title: string; sub?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`${CHOICE} ${selected ? "border-brand-teal bg-brand-teal-light/60" : "border-gray-200 bg-white active:border-brand-teal"}`}
    >
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-brand-teal-dark bg-brand-teal-dark" : "border-gray-300"}`}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-gray-900">{title}</span>
        {sub && <span className="block text-sm text-gray-600">{sub}</span>}
      </span>
    </button>
  );
}

/** Ring that empties as the QR's time on screen runs out; announced every 15 s and in the last 10. */
function Countdown({ seconds, total }: { seconds: number; total: number }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const announce = seconds <= 10 || seconds % 15 === 0;
  return (
    <div className="flex items-center justify-center gap-3">
      <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden className="-rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-gray-200" />
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, seconds) / total)}
          className={`transition-[stroke-dashoffset] duration-1000 ease-linear ${seconds <= 10 ? "text-amber-500" : "text-brand-teal"}`}
        />
      </svg>
      <p className="text-left text-base text-gray-700">
        <span className="block font-mono text-2xl font-bold text-gray-900">{seconds}s</span>
        until this code closes
      </p>
      <span className="sr-only" aria-live="polite">{announce ? `${seconds} seconds left` : ""}</span>
    </div>
  );
}
