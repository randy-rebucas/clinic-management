import Link from 'next/link';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import ContactForm from '@/components/ContactForm';
import { Icon, icons, PageHero, SUPPORT_EMAIL, SupportHours } from '@/components/PublicPage';

export const metadata: Metadata = pageMetadata({
  title: 'Contact Us',
  path: '/contact',
  description: 'Questions about MyClinicSoft? Reach our team by email or through the contact form for sales, clinic onboarding, and technical support.',
});

const shortcuts = [
  {
    icon: icons.lifebuoy,
    title: 'Clinic admins',
    description: 'Log in and open a support request — it reaches our team with your clinic details attached.',
    href: '/admin/support',
    cta: 'Open a request',
  },
  {
    icon: icons.phone,
    title: 'Patients',
    description: 'For appointments or records, contact your clinic directly. For the eMCR app, see the FAQ.',
    href: '/faq#patients',
    cta: 'Patient FAQ',
  },
  {
    icon: icons.users,
    title: 'Thinking of switching?',
    description: 'Try every feature with your own team, free for 14 days. No credit card needed.',
    href: '/tenant-onboard',
    cta: 'Start free trial',
  },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white">
      <PageHero eyebrow="Contact" title="Get in touch" accent="with our team">
        Questions about MyClinicSoft or the eMCR app? Send us a message and our team will get back to you.
      </PageHero>

      <section className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="container mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-8 lg:gap-12 items-start">
          <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-8">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Send us a message</h2>
            <p className="text-sm text-gray-500 mt-1 mb-6">We reply during support hours, in the order messages arrive.</p>
            <ContactForm />
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 shrink-0 rounded-md bg-brand-teal-light text-brand-teal-dark flex items-center justify-center">
                  <Icon d={icons.mail} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-gray-500">Email us directly</p>
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="block truncate font-semibold text-brand-teal-dark hover:underline underline-offset-2"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-5">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal-dark mb-4">
                <Icon d={icons.clock} className="w-4 h-4" />
                Support hours
              </p>
              <SupportHours />
              <p className="mt-4 border-t border-gray-200 pt-4 text-xs text-gray-500">
                <span className="font-semibold text-gray-700">Enterprise plans:</span> support terms agreed in your contract.
              </p>
            </div>
          </aside>
        </div>
      </section>

      {/* Shortcuts */}
      <section className="border-t border-gray-200 bg-gray-50/70 px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
        <div className="container mx-auto max-w-7xl">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 mb-6">Faster ways to get help</h2>
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {shortcuts.map((s) => (
              <li key={s.title}>
                <Link
                  href={s.href}
                  className="group flex h-full flex-col rounded-xl border border-gray-200 bg-white p-6 transition-shadow duration-200 hover:shadow-[0_12px_40px_rgb(15,23,42,0.08)]"
                >
                  <div className="w-10 h-10 rounded-md bg-brand-teal-light text-brand-teal-dark flex items-center justify-center mb-4">
                    <Icon d={s.icon} />
                  </div>
                  <h3 className="font-bold text-gray-900">{s.title}</h3>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">{s.description}</p>
                  <span className="mt-auto pt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-teal-dark">
                    {s.cta}
                    <Icon d={icons.arrow} className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
