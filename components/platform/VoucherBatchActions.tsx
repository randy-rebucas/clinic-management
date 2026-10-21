'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FIELD } from '../appointments/shared';
import { php } from './shared';
import { LABEL, Notice, OUTLINE, PRIMARY, callPlatform } from './platform-api';

/** Record the cash for a batch, void it, or void one lost voucher. */
export default function VoucherBatchActions({
  batchId,
  status,
  amountDue,
  unsold,
}: {
  batchId: string;
  status: 'unpaid' | 'paid' | 'void';
  amountDue: number;
  unsold: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [paymentRef, setPaymentRef] = useState('');
  const [amount, setAmount] = useState(amountDue);
  const [payNotes, setPayNotes] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [code, setCode] = useState('');
  const [codeReason, setCodeReason] = useState('');

  async function patch(key: string, body: Record<string, unknown>, done: string, after?: () => void) {
    setBusy(key);
    setNotice(null);
    const r = await callPlatform(`/api/platform/vouchers/${batchId}`, 'PATCH', body);
    setBusy(null);
    if (!r.ok) return setNotice({ tone: 'error', text: r.error });
    setNotice({ tone: 'ok', text: done });
    after?.();
    router.refresh();
  }

  if (status === 'void') {
    return <p className="text-sm text-gray-600">This batch is void. None of its unused codes can be redeemed.</p>;
  }

  return (
    <div className="space-y-6">
      {status === 'unpaid' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (amount !== amountDue && !window.confirm(`${php(amount)} is not the ${php(amountDue)} due. Record it anyway?`)) return;
            patch('pay', { action: 'mark_paid', paymentRef: paymentRef.trim(), amountReceived: amount, notes: payNotes.trim() || undefined }, 'Marked paid. The codes work now.');
          }}
          className="space-y-3"
        >
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Mark paid</h3>
            <p className="mt-0.5 text-xs text-gray-600">Once the cash or deposit is in hand. The batch&rsquo;s codes can be redeemed from then on.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pay-ref" className={LABEL}>Receipt or deposit ref</label>
              <input id="pay-ref" required maxLength={100} value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} className={FIELD} />
            </div>
            <div>
              <label htmlFor="pay-amount" className={LABEL}>Amount received (₱)</label>
              <input id="pay-amount" type="number" required min={0} step="any" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={FIELD} />
            </div>
          </div>
          <div>
            <label htmlFor="pay-notes" className={LABEL}>Notes <span className="font-normal text-gray-500">(optional)</span></label>
            <input id="pay-notes" maxLength={500} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} className={FIELD} />
          </div>
          <button type="submit" disabled={!!busy || !paymentRef.trim() || !(amount >= 0)} className={PRIMARY}>
            {busy === 'pay' ? 'Saving…' : 'Mark paid'}
          </button>
        </form>
      )}

      {unsold > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            patch('code', { action: 'void_code', code: code.trim(), reason: codeReason.trim() || undefined }, 'That voucher no longer works.', () => {
              setCode('');
              setCodeReason('');
            });
          }}
          className="space-y-3 border-t border-gray-100 pt-5"
        >
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Void one voucher</h3>
            <p className="mt-0.5 text-xs text-gray-600">A lost or stolen voucher, as printed. Only an unused code can be voided.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="void-code" className={LABEL}>Code</label>
              <input id="void-code" required maxLength={40} autoComplete="off" placeholder="XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={`${FIELD} font-mono`} />
            </div>
            <div>
              <label htmlFor="void-code-reason" className={LABEL}>Reason <span className="font-normal text-gray-500">(optional)</span></label>
              <input id="void-code-reason" maxLength={500} value={codeReason} onChange={(e) => setCodeReason(e.target.value)} className={FIELD} />
            </div>
          </div>
          <button type="submit" disabled={!!busy || !code.trim()} className={OUTLINE}>
            {busy === 'code' ? 'Voiding…' : 'Void voucher'}
          </button>
        </form>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!window.confirm('Void the whole batch? Its unused codes stop working, and this can’t be undone.')) return;
          patch('void', { action: 'void', reason: voidReason.trim() }, 'The batch is void.');
        }}
        className="space-y-3 border-t border-gray-100 pt-5"
      >
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Void batch</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            Every unused code stops working. Codes already redeemed keep their activation.
            {status === 'unpaid' ? ' Use this when the clinic won’t pay for the batch.' : ''}
          </p>
        </div>
        <div>
          <label htmlFor="void-reason" className={LABEL}>Reason</label>
          <input id="void-reason" required maxLength={500} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className={FIELD} />
        </div>
        <button type="submit" disabled={!!busy || !voidReason.trim()} className={`${OUTLINE} text-rose-700 hover:border-rose-700`}>
          {busy === 'void' ? 'Voiding…' : 'Void batch'}
        </button>
      </form>

      <Notice notice={notice} />
    </div>
  );
}
