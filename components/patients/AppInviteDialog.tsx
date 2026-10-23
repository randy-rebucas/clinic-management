"use client";

import { useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Modal } from "../ui/Modal";
import { useKeyedFetch } from "../hooks/useKeyedFetch";
import { FIELD, FOCUS_RING } from "../appointments/shared";
import { formatApiError } from "../utils/apiError";

const QRCode = dynamic(() => import("react-qr-code"), { ssr: false });

type InviteStatus = {
  hasOwnAccount: boolean;
  /** Their eMCR login ID, once they have one (signs in like the mobile number). */
  loginId: string | null;
  managedInApp: boolean;
  minor: boolean;
  phone: string | null;
  siblings: { id: string; name: string; dateOfBirth: string | null }[];
  openInvite: {
    mode: "self" | "guardian";
    channel: string;
    phone: string;
    expiresAt: string;
  } | null;
};

type Issued = {
  code: string;
  link: string;
  phone: string;
  expiresAt: string;
  smsSent: boolean;
  channel: Channel;
  /** Set when staff chose a temporary password: the slip shows the number + password instead of the QR. */
  tempPassword: string | null;
  loginPhone?: string;
  loginId?: string | null;
};
type Channel = "print" | "sms" | "both";

const RELATIONSHIPS = [
  { value: "child", label: "Child" },
  { value: "grandchild", label: "Grandchild" },
  { value: "sibling", label: "Sibling" },
  { value: "parent", label: "Parent" },
  { value: "spouse", label: "Spouse" },
  { value: "other", label: "Other" },
] as const;

const CHANNELS: { value: Channel; label: string }[] = [
  { value: "both", label: "Print a slip and text the link" },
  { value: "print", label: "Print a slip only" },
  { value: "sms", label: "Text the link only" },
];

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * "Send app invite": a one-time code (printed slip with QR, and/or a texted link) that signs the
 * patient, or the parent or carer who looks after them, in to eMCR without the name and
 * birth-date questions. The code is shown once; only the server's hash remains.
 */
export default function AppInviteDialog({
  open,
  onOpenChange,
  patientId,
  firstName,
  clinicName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  firstName: string;
  clinicName?: string;
}) {
  const ids = useId();
  const status = useKeyedFetch<InviteStatus>(
    open ? `/api/patients/${patientId}/app-invite` : null,
  );
  const s = status.value;

  // Defaults follow the record until staff change them: a minor's invite is usually for the
  // parent at the desk.
  const [modeChoice, setMode] = useState<"self" | "guardian" | null>(null);
  const [phoneEdit, setPhone] = useState<string | null>(null);
  const mode = modeChoice ?? (s?.minor ? "guardian" : "self");
  const phone = phoneEdit ?? s?.phone ?? "";
  const [relationship, setRelationship] = useState<string>("child");
  const [extra, setExtra] = useState<string[]>([]);
  const [channel, setChannel] = useState<Channel>("both");
  const [noTexts, setNoTexts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const slipRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setIssued(null);
    setError(null);
    setExtra([]);
    setNoTexts(false);
    setMode(null);
    setPhone(null);
    onOpenChange(false);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/app-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          channel: noTexts ? "print" : channel,
          ...(noTexts ? { tempPassword: true } : {}),
          ...(mode === "guardian"
            ? { phone: phone.trim(), relationship, dependentIds: extra }
            : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success)
        throw new Error(formatApiError(json, "The invite wasn’t created"));
      setIssued({ ...json.data, channel: noTexts ? "print" : channel });
      status.reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The invite wasn’t created",
      );
    } finally {
      setBusy(false);
    }
  };

  const cancelInvite = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/app-invite`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success)
        throw new Error(formatApiError(json, "The invite wasn’t cancelled"));
      setIssued(null);
      status.reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The invite wasn’t cancelled",
      );
    } finally {
      setBusy(false);
    }
  };

  // Print the slip on its own page, so the rest of the record never reaches the printer.
  const printSlip = () => {
    const slip = slipRef.current;
    if (!slip) return;
    const win = window.open("", "_blank", "width=420,height=640");
    if (!win) return setError("Allow pop-ups for this site to print the slip.");
    win.document
      .write(`<!doctype html><html><head><meta charset="utf-8"><title>eMCR invite</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;color:#111}.slip{max-width:300px;margin:0 auto;text-align:center}
h1{font-size:18px;margin:0 0 4px}p{font-size:13px;margin:4px 0;line-height:1.4}.code{font:700 24px ui-monospace,monospace;letter-spacing:3px;margin:12px 0 4px}
.qr{margin:16px auto 8px;width:180px}.qr svg{width:180px;height:180px}ol{text-align:left;font-size:13px;padding-left:20px;margin:12px 0}
.muted{color:#555;font-size:12px}</style></head><body>${slip.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const who = mode === "self" ? firstName : `${firstName}’s parent or carer`;

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && close()}
      className="max-w-md"
      labelledBy={`${ids}-title`}
    >
      <div className="p-6">
        <h2
          id={`${ids}-title`}
          className="text-lg font-bold tracking-tight text-gray-900"
        >
          {issued ? "Invite ready" : "Send app invite"}
        </h2>

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        {issued ? (
          <div className="mt-3 text-sm text-gray-700">
            {issued.tempPassword ? (
              <p>
                {firstName === who ? `${firstName}’s` : "Their"} eMCR account is
                ready. Give them the slip; the temporary password is shown only
                now and they must choose their own at first sign-in.
              </p>
            ) : (
              <p>
                {issued.channel !== "print" &&
                  (issued.smsSent
                    ? `Texted to ${issued.phone}. `
                    : `The text to ${issued.phone} didn’t go through; print the slip instead. `)}
                Works once, until{" "}
                <span className="font-medium text-gray-900">
                  {dateLabel(issued.expiresAt)}
                </span>
                . The sign-in code goes only to {issued.phone}.
              </p>
            )}
            <div
              ref={slipRef}
              className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-center"
            >
              <div className="slip">
                <h1 className="text-base font-bold text-gray-900">
                  {clinicName
                    ? `${clinicName} invites you to eMCR`
                    : "You’re invited to eMCR"}
                </h1>
                <p className="text-gray-600">Health records for {who}</p>
                {issued.tempPassword ? (
                  <>
                    {issued.loginId && (
                      <>
                        <p className="muted mt-4 text-xs text-gray-500">
                          Login ID
                        </p>
                        <p className="code break-all font-mono text-sm font-bold text-gray-900">
                          {issued.loginId}
                        </p>
                      </>
                    )}
                    <p className="muted mt-4 text-xs text-gray-500">
                      {issued.loginId ? 'or mobile number' : 'Mobile number'}
                    </p>
                    <p className="code font-mono text-xl font-bold text-gray-900">
                      {issued.loginPhone}
                    </p>
                    <p className="muted mt-2 text-xs text-gray-500">
                      Temporary password
                    </p>
                    <p className="code font-mono text-2xl font-bold tracking-widest text-gray-900">
                      {issued.tempPassword}
                    </p>
                    <ol className="mt-3 list-decimal pl-5 text-left text-gray-700">
                      <li>Install the eMCR app.</li>
                      <li>
                        Sign in with the {issued.loginId ? 'login ID or ' : ''}
                        mobile number and the temporary password above.
                      </li>
                      <li>
                        Choose your own password. This one then stops working.
                      </li>
                    </ol>
                  </>
                ) : (
                  <>
                    <div className="qr mx-auto my-3 w-fit">
                      <QRCode value={issued.link} size={168} />
                    </div>
                    <p className="code font-mono text-2xl font-bold tracking-widest text-gray-900">
                      {issued.code}
                    </p>
                    <p className="muted text-xs text-gray-500">
                      Valid until {dateLabel(issued.expiresAt)} · works once
                    </p>
                    <ol className="mt-3 list-decimal pl-5 text-left text-gray-700">
                      <li>Install the eMCR app.</li>
                      <li>
                        Tap “I have an invite from my clinic” and scan this
                        code.
                      </li>
                      <li>
                        Enter the code we text to {issued.phone}, then choose a
                        password.
                      </li>
                    </ol>
                  </>
                )}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {!issued.tempPassword && (
                <button
                  type="button"
                  onClick={cancelInvite}
                  disabled={busy}
                  className={`rounded-md px-3.5 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 ${FOCUS_RING}`}
                >
                  Cancel invite
                </button>
              )}
              {issued.channel !== "sms" && (
                <button
                  type="button"
                  onClick={printSlip}
                  className={`rounded-md border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}
                >
                  Print slip
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className={`rounded-md bg-brand-teal-dark px-4 py-2 font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}
              >
                Done
              </button>
            </div>
          </div>
        ) : !s ? (
          <p className="mt-3 text-sm text-gray-500">
            {status.error ? "The invite details didn’t load." : "Checking…"}
          </p>
        ) : (
          <form
            onSubmit={create}
            className="mt-3 flex flex-col gap-4 text-sm"
            noValidate
          >
            <p className="text-gray-600">
              One code they scan or type in the app. No name or birth-date
              questions; we text a sign-in code to the number below.
            </p>
            {(s.hasOwnAccount || s.managedInApp || s.openInvite) && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                {s.hasOwnAccount && `${firstName} already uses eMCR${s.loginId ? ` (login ID ${s.loginId})` : ''}. `}
                {s.managedInApp &&
                  `Someone already manages ${firstName} in eMCR. `}
                {s.openInvite &&
                  `An invite to ${s.openInvite.phone} is open until ${dateLabel(s.openInvite.expiresAt)}; a new one replaces it.`}
              </p>
            )}

            <fieldset>
              <legend className="mb-1.5 font-medium text-gray-700">
                Who is it for?
              </legend>
              <div className="flex flex-col gap-1.5">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${ids}-mode`}
                    checked={mode === "self"}
                    onChange={() => setMode("self")}
                    className="h-4 w-4 text-brand-teal-dark focus:ring-brand-teal"
                  />
                  {firstName}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${ids}-mode`}
                    checked={mode === "guardian"}
                    onChange={() => setMode("guardian")}
                    className="h-4 w-4 text-brand-teal-dark focus:ring-brand-teal"
                  />
                  A parent or carer who looks after {firstName}
                </label>
              </div>
            </fieldset>

            {mode === "self" ? (
              <p className="text-gray-700">
                Sign-in code goes to{" "}
                {s.phone ? (
                  <span className="font-medium text-gray-900">{s.phone}</span>
                ) : (
                  <span className="font-medium text-red-700">
                    no number on file
                  </span>
                )}
                . If it’s wrong, update the patient’s phone first.
              </p>
            ) : (
              <>
                <div>
                  <label
                    htmlFor={`${ids}-phone`}
                    className="mb-1.5 block font-medium text-gray-700"
                  >
                    Their mobile number
                  </label>
                  <input
                    id={`${ids}-phone`}
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0917 123 4567"
                    className={FIELD}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Check it with them now; the sign-in code goes only here.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor={`${ids}-rel`}
                    className="mb-1.5 block font-medium text-gray-700"
                  >
                    {firstName} is their
                  </label>
                  <select
                    id={`${ids}-rel`}
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className={FIELD}
                  >
                    {RELATIONSHIPS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                {s.siblings.length > 0 && (
                  <fieldset>
                    <legend className="mb-1.5 font-medium text-gray-700">
                      Also include (children on the same number)
                    </legend>
                    <div className="flex flex-col gap-1.5">
                      {s.siblings.map((sib) => (
                        <label
                          key={sib.id}
                          className="inline-flex items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            checked={extra.includes(sib.id)}
                            onChange={(e) =>
                              setExtra((cur) =>
                                e.target.checked
                                  ? [...cur, sib.id]
                                  : cur.filter((x) => x !== sib.id),
                              )
                            }
                            className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal"
                          />
                          {sib.name}
                          {sib.dateOfBirth && (
                            <span className="text-gray-500">
                              · born {sib.dateOfBirth}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </>
            )}

            <label className="inline-flex items-start gap-2">
              <input
                type="checkbox"
                checked={noTexts}
                onChange={(e) => setNoTexts(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal"
              />
              <span>
                Their phone can’t get texts
                <span className="block text-xs text-gray-500">
                  Creates the account now and prints a temporary password
                  instead of an invite code. They choose their own at first
                  sign-in.
                </span>
              </span>
            </label>

            {!noTexts && (
              <div>
                <label
                  htmlFor={`${ids}-channel`}
                  className="mb-1.5 block font-medium text-gray-700"
                >
                  How to hand it over
                </label>
                <select
                  id={`${ids}-channel`}
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as Channel)}
                  className={FIELD}
                >
                  {CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {s.openInvite && (
                <button
                  type="button"
                  onClick={cancelInvite}
                  disabled={busy}
                  className={`mr-auto rounded-md px-3.5 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 ${FOCUS_RING}`}
                >
                  Cancel open invite
                </button>
              )}
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className={`rounded-md px-3.5 py-2 font-semibold text-gray-700 hover:bg-gray-100 ${FOCUS_RING}`}
              >
                Close
              </button>
              <button
                type="submit"
                disabled={
                  busy ||
                  (mode === "self" && !s.phone) ||
                  (mode === "guardian" && !phone.trim())
                }
                aria-busy={busy}
                className={`rounded-md bg-brand-teal-dark px-4 py-2 font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
              >
                {busy
                  ? "Creating…"
                  : noTexts
                    ? "Create account"
                    : "Create invite"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
