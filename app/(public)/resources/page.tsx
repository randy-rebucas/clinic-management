import Link from 'next/link';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { Icon, icons, NavyBand, PageHero, SUPPORT_EMAIL } from '@/components/PublicPage';

export const metadata: Metadata = pageMetadata({
  title: 'Resources',
  path: '/resources',
  description: 'Everything you need to choose, set up, and run MyClinicSoft — features, pricing, security, the eMCR patient app, the API, and answers to common questions.',
});

const document = 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
const scale = 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3';

// Only pages that exist. Add guides here as they're written — never a placeholder link.
const groups = [
  {
    title: 'Choosing MyClinicSoft',
    description: 'What it does, what it costs, and how it compares.',
    links: [
      { href: '/features', title: 'Feature overview', description: 'Every module, from records to inventory.', icon: icons.book },
      { href: '/pricing', title: 'Plans and pricing', description: 'Peso pricing, limits, and what each plan adds.', icon: icons.checkCircle },
      { href: '/compare', title: 'Compare', description: 'One system vs. paper, spreadsheets, and chat.', icon: scale },
      { href: '/about', title: 'About us', description: 'Who builds MyClinicSoft and why.', icon: icons.users },
    ],
  },
  {
    title: 'Data privacy and security',
    description: 'How patient data is protected under the Data Privacy Act.',
    links: [
      { href: '/security', title: 'Security', description: 'Encryption, access controls, and your part.', icon: icons.shield },
      { href: '/privacy', title: 'Privacy Policy', description: 'What we collect, why, and your rights.', icon: document },
      { href: '/terms', title: 'Terms of Service', description: 'The rules for using the service.', icon: document },
    ],
  },
  {
    title: 'For patients',
    description: 'Booking visits and keeping records in your pocket.',
    links: [
      { href: '/book', title: 'Book an appointment', description: 'Choose your clinic, doctor, and time.', icon: icons.clock },
      { href: '/download', title: 'eMCR patient app', description: 'Bookings, live queue, and results on your phone.', icon: icons.phone },
      { href: '/faq#patients', title: 'Patient FAQ', description: 'Answers to common patient questions.', icon: icons.question },
    ],
  },
  {
    title: 'Developers',
    description: 'Connect MyClinicSoft to your other systems.',
    links: [
      { href: '/integrations', title: 'Integrations', description: 'What’s built in and what you can connect.', icon: icons.key },
      { href: '/integrations#api', title: 'REST API and webhooks', description: 'Endpoints, scopes, and signed events.', icon: icons.bolt },
    ],
  },
];

export default function ResourcesPage() {
  return (
    <div className="min-h-screen bg-white">
      <PageHero eyebrow="Resources" title="Everything in" accent="one place">
        Guides and answers for clinic teams, patients, and developers — whether you&apos;re choosing, setting up, or
        already running MyClinicSoft.
      </PageHero>

      <section className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="container mx-auto max-w-7xl space-y-12">
          {groups.map((g) => (
            <div key={g.title} className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-5 lg:gap-12">
              <div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">{g.title}</h2>
                <p className="text-sm text-gray-500 mt-1">{g.description}</p>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="group flex h-full items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-[border-color,box-shadow] duration-200 hover:border-brand-teal/50 hover:shadow-[0_12px_40px_rgb(15,23,42,0.08)]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-teal-light text-brand-teal-dark">
                        <Icon d={l.icon} className="w-4 h-4" />
                      </span>
                      <span className="flex-1">
                        <span className="block font-semibold text-gray-900 group-hover:text-brand-teal-dark">{l.title}</span>
                        <span className="block text-sm text-gray-500 mt-0.5">{l.description}</span>
                      </span>
                      <Icon
                        d={icons.chevron}
                        className="mt-1 w-4 h-4 shrink-0 text-gray-300 transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-brand-teal"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <NavyBand
        title="Can’t find what you need?"
        actions={[
          { href: '/faq', label: 'Browse the FAQ', icon: icons.question, primary: true },
          { href: `mailto:${SUPPORT_EMAIL}`, label: 'Email support', icon: icons.mail },
        ]}
      >
        Ask us — we&apos;ll answer, and add a guide if others need it too.
      </NavyBand>
    </div>
  );
}
