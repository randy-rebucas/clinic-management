import { requirePlatformPage } from '@/lib/platform-auth';
import { listReferralCodes, referralRepOptions } from '@/lib/rep-referral';
import { CARD, H2 } from '@/components/platform/shared';
import NewReferralCodeForm from '@/components/platform/NewReferralCodeForm';
import ReferralCodeTable from '@/components/platform/ReferralCodeTable';

export const dynamic = 'force-dynamic';

export default async function PlatformReferralCodesPage() {
  await requirePlatformPage();
  const [codes, reps] = await Promise.all([listReferralCodes(), referralRepOptions()]);
  const clinicsLinked = codes.reduce((n, c) => n + c.uses, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Rep referral codes</h1>
        <p className="text-sm text-gray-500">
          A clinic that registers with a rep’s code or link, or enters it later on its billing page, gets that rep added to its
          representatives, so it can ask them to sponsor its plan. Reps make their own code in the Rep app; make custom ones here.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className={`${CARD} p-5 lg:order-2`} aria-labelledby="new-code">
          <h2 id="new-code" className={H2}>New custom code</h2>
          <div className="mt-4">
            <NewReferralCodeForm reps={reps} />
          </div>
        </section>

        <section className={`${CARD} lg:col-span-2 lg:order-1`} aria-labelledby="codes">
          <div className="flex items-baseline justify-between px-5 pt-5">
            <h2 id="codes" className={H2}>Codes</h2>
            <p className="text-xs text-gray-500">
              {codes.length} code{codes.length === 1 ? '' : 's'} · {clinicsLinked} clinic{clinicsLinked === 1 ? '' : 's'} linked
            </p>
          </div>
          <ReferralCodeTable codes={codes} />
        </section>
      </div>
    </div>
  );
}
