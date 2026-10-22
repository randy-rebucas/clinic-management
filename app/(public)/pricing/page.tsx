import Link from 'next/link';
import { Metadata } from 'next';
import { pageMetadata, softwareApplicationJsonLd } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import { SUBSCRIPTION_PACKAGES, type SubscriptionPlan } from '@/lib/subscription-packages';
import { monthsSavedYearly, planPrice } from '@/lib/subscription-period';
import { Icon, icons, NavyBand, PageHero, SectionHeading } from '@/components/PublicPage';

export const metadata: Metadata = pageMetadata({
  title: 'Pricing',
  path: '/pricing',
  description: 'Simple monthly plans for clinics of every size, starting with a free 14-day trial. Compare the Basic, Professional, and Enterprise plans of MyClinicSoft.',
});

type PaidPlan = Exclude<SubscriptionPlan, 'trial'>;

const plans: {
  id: SubscriptionPlan;
  name: string;
  description: string;
  highlights: string[];
  cta: { label: string; href: string };
  featured?: boolean;
}[] = [
  {
    id: 'trial',
    name: 'Free trial',
    description: 'Try everything with your own team for 14 days.',
    highlights: ['AI visit notes and teleconsult included', 'No credit card required'],
    cta: { label: 'Start free trial', href: '/tenant-onboard' },
  },
  {
    id: 'basic',
    name: 'Basic',
    description: 'For small clinics with 1–3 doctors.',
    highlights: ['All core clinic modules', 'Email support'],
    cta: { label: 'Start with Basic', href: '/tenant-onboard' },
    featured: true,
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'For growing clinics with up to 10 doctors.',
    highlights: ['AI visit notes', 'Teleconsult', 'REST API and webhooks', 'Priority email support'],
    cta: { label: 'Start with Professional', href: '/tenant-onboard' },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large and multi-doctor practices.',
    highlights: ['Everything in Professional', 'Custom integrations with our team', 'Support terms agreed in your contract'],
    cta: { label: 'Talk to sales', href: '/contact' },
  },
];

const everyPlan = [
  'Patients, appointments, queue, visits',
  'Prescriptions and lab results',
  'Billing, PhilHealth and HMO claims',
  'Inventory',
  'SMS and email reminders',
  'eMCR patient app connection',
  'Two-factor sign-in and audit trail',
  'Backups you can take any time',
];

const fmtLimit = (n: number | null, unit = '') => (n === null ? 'Unlimited' : `${n.toLocaleString('en-US')}${unit}`);

const comparison: { label: string; value: (p: SubscriptionPlan) => string | boolean }[] = [
  { label: 'Patients', value: (p) => fmtLimit(SUBSCRIPTION_PACKAGES[p].maxPatients) },
  { label: 'Staff accounts', value: (p) => fmtLimit(SUBSCRIPTION_PACKAGES[p].maxUsers) },
  { label: 'Doctors', value: (p) => fmtLimit(SUBSCRIPTION_PACKAGES[p].maxDoctors) },
  { label: 'Appointments a month', value: (p) => fmtLimit(SUBSCRIPTION_PACKAGES[p].maxAppointmentsPerMonth) },
  { label: 'Storage', value: (p) => fmtLimit(SUBSCRIPTION_PACKAGES[p].maxStorageGB, ' GB') },
  { label: 'AI visit notes', value: (p) => SUBSCRIPTION_PACKAGES[p].features.aiScribe },
  { label: 'Teleconsult', value: (p) => SUBSCRIPTION_PACKAGES[p].features.teleconsult },
  { label: 'REST API and webhooks', value: (p) => SUBSCRIPTION_PACKAGES[p].features.apiAccess },
  {
    label: 'Support',
    value: (p) => ({ trial: 'Email', basic: 'Email', professional: 'Priority', enterprise: 'Contract' })[p],
  },
];

const faqs = [
  { q: 'Can I change plans later?', a: 'Yes. Upgrade or downgrade at any time, and changes take effect immediately.' },
  { q: 'What happens after the trial?', a: 'Choose a paid plan to keep going. Everything you set up during the trial stays as it is.' },
  { q: 'Do you offer refunds?', a: 'No. Payments are non-refundable, so start with the 14-day free trial to make sure it fits your clinic.' },
  { q: 'Is there a setup fee?', a: 'No. You only pay the monthly or yearly subscription.' },
];

export default function PricingPage() {
  // Philippines first: always quote the peso price list (charged through PayMongo).
  const currency = 'PHP' as const;

  const priced = plans.map((plan) => {
    if (plan.id === 'trial') return { ...plan, monthly: 0, yearly: 0, saved: 0, code: currency };
    const monthly = planPrice(plan.id as PaidPlan, 'monthly', currency);
    const yearly = planPrice(plan.id as PaidPlan, 'yearly', currency);
    return { ...plan, monthly: monthly.amount, yearly: yearly.amount, saved: monthsSavedYearly(plan.id as PaidPlan, currency), code: monthly.currency };
  });

  const money = (amount: number, code: string) =>
    code === 'PHP' ? `₱${amount.toLocaleString('en-PH')}` : `$${amount.toLocaleString('en-US')}`;

  return (
    <div className="min-h-screen bg-white">
      <JsonLd
        data={softwareApplicationJsonLd(
          priced.map((p) => ({ name: p.name, price: p.monthly, priceCurrency: p.code, description: p.description })),
        )}
      />

      <PageHero eyebrow="Pricing" title="Simple pricing," accent="no setup fees">
        Start free for 14 days, then pick the plan that fits your clinic. Pay yearly and get 2 months free.
      </PageHero>

      {/* Plans */}
      <section className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="container mx-auto max-w-7xl">
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {priced.map((plan) => {
              const pkg = SUBSCRIPTION_PACKAGES[plan.id];
              const limits = [
                `${fmtLimit(pkg.maxPatients)} patients`,
                `${fmtLimit(pkg.maxDoctors)} doctors, ${fmtLimit(pkg.maxUsers)} staff`,
                `${fmtLimit(pkg.maxAppointmentsPerMonth)} appointments a month`,
                `${fmtLimit(pkg.maxStorageGB, ' GB')} storage`,
              ];
              return (
                <li
                  key={plan.id}
                  className={`relative flex flex-col rounded-xl p-6 ${
                    plan.featured
                      ? 'border-2 border-brand-teal bg-white shadow-[0_20px_50px_rgb(14,165,164,0.15)]'
                      : 'border border-gray-200 bg-white'
                  }`}
                >
                  {plan.featured && (
                    <span className="absolute -top-3 left-6 rounded-full bg-brand-teal px-3 py-0.5 text-xs font-semibold text-white">
                      Recommended
                    </span>
                  )}
                  <h2 className="text-lg font-bold text-gray-900">{plan.name}</h2>
                  <p className="text-sm text-gray-500 mt-1 min-h-[2.5rem]">{plan.description}</p>

                  <div className="mt-5">
                    {plan.id === 'trial' ? (
                      <p className="flex items-baseline gap-1.5">
                        <span className="font-mono text-4xl font-semibold text-gray-900">Free</span>
                        <span className="text-sm text-gray-500">for 14 days</span>
                      </p>
                    ) : (
                      <>
                        <p className="flex items-baseline gap-1.5">
                          <span className="font-mono text-4xl font-semibold text-gray-900 tabular-nums">
                            {money(plan.monthly, plan.code)}
                          </span>
                          <span className="text-sm text-gray-500">/ month</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-1.5">
                          or {money(plan.yearly, plan.code)} a year
                          {plan.saved > 0 && (
                            <span className="ml-1.5 rounded-full bg-brand-teal-light px-1.5 py-0.5 font-semibold text-brand-teal-deep">
                              {plan.saved} months free
                            </span>
                          )}
                        </p>
                      </>
                    )}
                  </div>

                  <Link
                    href={plan.cta.href}
                    className={`mt-6 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                      plan.featured
                        ? 'bg-brand-teal text-white hover:bg-brand-teal-dark shadow-[0_6px_20px_rgba(14,165,164,0.3)]'
                        : 'border border-gray-300 text-gray-900 hover:border-gray-900'
                    }`}
                  >
                    {plan.cta.label}
                  </Link>

                  <ul className="mt-6 space-y-2 border-t border-gray-100 pt-5 text-sm">
                    {limits.map((l) => (
                      <li key={l} className="flex items-start gap-2 text-gray-700">
                        <Icon d={icons.check} className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                        {l}
                      </li>
                    ))}
                    {plan.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2 font-medium text-gray-900">
                        <Icon d={icons.check} className="w-4 h-4 mt-0.5 shrink-0 text-brand-teal" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>

          {/* Included everywhere */}
          <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50/70 p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal-dark mb-4">Every plan includes</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2.5 text-sm text-gray-700">
              {everyPlan.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Icon d={icons.check} className="w-4 h-4 mt-0.5 shrink-0 text-brand-teal" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="container mx-auto max-w-7xl">
          <SectionHeading title="Compare plans">Limits and features, side by side.</SectionHeading>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/70">
                  <th scope="col" className="px-5 py-3.5 text-left font-semibold text-gray-500">
                    <span className="sr-only">Feature</span>
                  </th>
                  {priced.map((p) => (
                    <th
                      key={p.id}
                      scope="col"
                      className={`px-5 py-3.5 text-left font-semibold ${p.featured ? 'text-brand-teal-deep' : 'text-gray-900'}`}
                    >
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {comparison.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="px-5 py-3 text-left font-medium text-gray-700">
                      {row.label}
                    </th>
                    {priced.map((p) => {
                      const v = row.value(p.id);
                      return (
                        <td key={p.id} className={`px-5 py-3 ${p.featured ? 'bg-brand-teal-light/30' : ''}`}>
                          {v === true ? (
                            <>
                              <Icon d={icons.check} className="w-4 h-4 text-brand-teal" />
                              <span className="sr-only">Included</span>
                            </>
                          ) : v === false ? (
                            <>
                              <span aria-hidden="true" className="text-gray-300">—</span>
                              <span className="sr-only">Not included</span>
                            </>
                          ) : (
                            <span className="font-mono tabular-nums text-gray-900">{v}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-gray-200 bg-gray-50/70 px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="container mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-8 lg:gap-14 items-start">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Pricing questions</h2>
            <p className="text-gray-600 mt-2">
              More in the{' '}
              <Link href="/faq#pricing" className="font-semibold text-brand-teal-dark hover:underline underline-offset-2">
                full FAQ
              </Link>
              .
            </p>
          </div>
          <dl className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
            {faqs.map((f) => (
              <div key={f.q} className="px-5 py-4">
                <dt className="font-semibold text-gray-900">{f.q}</dt>
                <dd className="text-sm text-gray-600 mt-1 leading-relaxed">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <NavyBand
        title="Not sure which plan fits?"
        actions={[
          { href: '/tenant-onboard', label: 'Start free trial', icon: icons.arrow, primary: true },
          { href: '/contact', label: 'Talk to us', icon: icons.chat },
        ]}
      >
        Start free and decide later — or tell us about your clinic and we&apos;ll recommend one.
      </NavyBand>
    </div>
  );
}
