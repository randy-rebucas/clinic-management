import { Metadata } from 'next';
import { faqPageJsonLd, pageMetadata } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import { icons, NavyBand, PageHero, SUPPORT_EMAIL } from '@/components/PublicPage';

export const metadata: Metadata = pageMetadata({
  title: 'Frequently Asked Questions',
  path: '/faq',
  description: 'Answers about MyClinicSoft pricing, the free trial, features, data security and compliance, support and training, and migrating your clinic records.',
});

const faqCategories = [
  {
    id: 'general',
    title: 'General',
    questions: [
      {
        q: 'What is MyClinicSoft?',
        a: 'MyClinicSoft is a clinic management system that helps healthcare providers manage patients, appointments, queues, billing, prescriptions, and more in one integrated platform.',
      },
      {
        q: 'Do I need technical knowledge to use MyClinicSoft?',
        a: 'No. MyClinicSoft is built for healthcare professionals, not IT experts. We also provide documentation and support to help your team get started.',
      },
      {
        q: 'Is MyClinicSoft cloud-based?',
        a: 'Yes. You can use MyClinicSoft from anywhere with an internet connection — no installation or server maintenance required.',
      },
      {
        q: 'Can I try MyClinicSoft before purchasing?',
        a: 'Yes. Every clinic starts with a 14-day free trial of the core features, with the patient and staff limits shown on the pricing page. No credit card is required to start.',
      },
    ],
  },
  {
    id: 'patients',
    title: 'For patients',
    questions: [
      {
        q: 'How do I book an appointment?',
        a: 'Go to the Book Appointment page, choose your clinic, then pick a doctor and an open time. The clinic confirms your request by SMS.',
      },
      {
        q: 'What is the eMCR app?',
        a: 'eMCR (Electronic MyClinic Record) is the patient app for MyClinicSoft clinics. Book visits, follow your place in the queue live, and keep your lab results, prescriptions, and family profiles in one place — with one login across partner clinics.',
      },
      {
        q: 'Is eMCR available on iPhone?',
        a: 'eMCR is available now on Android through Google Play. The iOS version is coming soon.',
      },
      {
        q: 'Who do I contact about my medical records?',
        a: 'Your clinic manages your records, so contact them first for corrections or copies. For problems with the eMCR app itself, contact our support team.',
      },
    ],
  },
  {
    id: 'pricing',
    title: 'Pricing & billing',
    questions: [
      {
        q: 'What payment methods do you accept?',
        a: 'Subscriptions are paid in pesos through PayMongo, which accepts GCash, Maya, credit and debit cards, GrabPay, and QR Ph. Enterprise customers can also pay by invoice.',
      },
      {
        q: 'Can I change my plan later?',
        a: 'Yes. You can switch plans from your clinic’s subscription page. The new plan starts when it’s paid; time left on the old plan isn’t prorated or refunded.',
      },
      {
        q: 'Do you offer refunds?',
        a: 'No. Payments are non-refundable, as set out in our Terms of Service. Use the 14-day free trial to make sure MyClinicSoft fits your clinic before you pay.',
      },
      {
        q: 'Are there any hidden fees?',
        a: 'No. The price you see is the price you pay, with no setup fee.',
      },
      {
        q: 'Do you offer discounts for annual plans?',
        a: 'Yes. Annual plans save about 17% compared to monthly billing — that’s 2 months free.',
      },
    ],
  },
  {
    id: 'features',
    title: 'Features',
    questions: [
      {
        q: 'What features are included in the Basic plan?',
        a: 'The Basic plan includes the core features: patient management, appointment scheduling, visit management, prescriptions, lab results, billing, inventory, and basic reporting. It suits small clinics with 1–3 doctors.',
      },
      {
        q: 'Can I customize MyClinicSoft for my clinic?',
        a: 'Yes. Professional and Enterprise plans add custom reports, API access, and webhooks for your own integrations.',
      },
      {
        q: 'Does MyClinicSoft support multiple locations?',
        a: 'Each clinic location runs as its own MyClinicSoft account today. Managing several locations from one account is on our roadmap; contact us if you need it.',
      },
      {
        q: 'Can patients book appointments online?',
        a: 'Yes. Patients can book online 24/7 through your clinic’s booking page or the eMCR app, based on your doctors’ schedules and clinic hours.',
      },
      {
        q: 'Does MyClinicSoft integrate with lab systems?',
        a: 'MyClinicSoft supports third-party lab integrations. Professional and Enterprise plans also include API access for custom integrations.',
      },
    ],
  },
  {
    id: 'security',
    title: 'Security & privacy',
    questions: [
      {
        q: 'Is MyClinicSoft compliant with the Data Privacy Act?',
        a: 'Yes. MyClinicSoft is built for the Philippine Data Privacy Act of 2012 (RA 10173), with encryption, role-based access controls, and audit logs of access to patient records.',
      },
      {
        q: 'How is patient data protected?',
        a: 'Patient data is encrypted in transit (TLS) and at rest. Role-based access controls limit who can see what, and every access to a record is logged.',
      },
      {
        q: 'Where is my data stored?',
        a: 'Your data is stored on secure cloud infrastructure with regular backups.',
      },
      {
        q: 'Can I export my data?',
        a: 'Yes. You can export your data at any time, including while your account is read-only after a subscription ends.',
      },
    ],
  },
  {
    id: 'support',
    title: 'Support & training',
    questions: [
      {
        q: 'What kind of support do you offer?',
        a: 'All plans include email support. Professional plans get priority handling, and Enterprise support terms are agreed in your contract.',
      },
      {
        q: 'Do you provide training?',
        a: 'Yes. We provide documentation and guides for every module, and Enterprise customers receive personalized training sessions.',
      },
      {
        q: 'How quickly do you respond to support requests?',
        a: 'We answer support email during our support hours, with Professional and Enterprise requests handled first.',
      },
    ],
  },
  {
    id: 'setup',
    title: 'Setup & migration',
    questions: [
      {
        q: 'How long does it take to set up MyClinicSoft?',
        a: 'You can start using MyClinicSoft right after signing up — basic setup takes a few minutes. How long a full rollout takes depends mostly on how many existing records you bring over.',
      },
      {
        q: 'Can I import data from my current system?',
        a: 'Yes. Send us your existing records — for example as CSV or Excel exports — and we’ll help you bring them over. Larger migrations from other systems are handled together with our team.',
      },
      {
        q: 'What happens to my data if I cancel?',
        a: 'You can export all your data before cancelling. After you cancel, a clinic administrator can ask us to delete your data and we’ll do so within 30 days, as described in our Privacy Policy.',
      },
    ],
  },
];

export default function FAQPage() {
  const total = faqCategories.reduce((n, c) => n + c.questions.length, 0);

  return (
    <div className="min-h-screen bg-white">
      <JsonLd data={faqPageJsonLd(faqCategories.flatMap((c) => c.questions))} />

      <PageHero eyebrow="FAQ" title="Questions," accent="answered">
        {total} answers about MyClinicSoft, the eMCR app, pricing, and keeping patient data safe.
      </PageHero>

      <section className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="container mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-8 lg:gap-16">
          <nav aria-label="FAQ topics" className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 mb-3">Topics</p>
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-0 lg:border-l lg:border-gray-200">
              {faqCategories.map((c) => (
                <li key={c.id}>
                  <a
                    href={`#${c.id}`}
                    className="flex items-center justify-between gap-3 rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-600 transition-colors duration-150 hover:border-brand-teal/50 hover:text-gray-900 lg:-ml-px lg:rounded-none lg:border-0 lg:border-l lg:border-transparent lg:py-1.5 lg:pl-4 lg:hover:border-brand-teal"
                  >
                    {c.title}
                    <span className="hidden font-mono text-[11px] text-gray-400 tabular-nums lg:inline">{c.questions.length}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="max-w-3xl space-y-12">
            {faqCategories.map((c) => (
              <section key={c.id} id={c.id} aria-labelledby={`${c.id}-title`} className="scroll-mt-24">
                <h2 id={`${c.id}-title`} className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight mb-4">
                  {c.title}
                </h2>
                <div className="divide-y divide-gray-200 border-y border-gray-200">
                  {c.questions.map((item) => (
                    <details key={item.q} className="group">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 text-left font-semibold text-gray-900 transition-colors duration-150 hover:text-brand-teal-dark [&::-webkit-details-marker]:hidden">
                        {item.q}
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-transform duration-200 group-open:rotate-45 group-open:border-brand-teal group-open:text-brand-teal-dark"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeWidth={2} d="M12 5v14M5 12h14" />
                          </svg>
                        </span>
                      </summary>
                      <p className="pb-5 pr-10 text-gray-600 leading-relaxed">{item.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>

      <NavyBand
        title="Still have a question?"
        actions={[
          { href: `mailto:${SUPPORT_EMAIL}`, label: 'Email support', icon: icons.mail, primary: true },
          { href: '/contact', label: 'Contact us', icon: icons.chat },
          { href: '/support', label: 'Help center', icon: icons.lifebuoy },
        ]}
      >
        Our support team answers patients and clinics alike.
      </NavyBand>
    </div>
  );
}
