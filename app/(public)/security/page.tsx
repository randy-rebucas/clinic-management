import Link from 'next/link';
import { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { Icon, icons, NavyBand, PageHero, SectionHeading, SUPPORT_EMAIL, buttonPrimary, buttonSecondary } from '@/components/PublicPage';

export const metadata: Metadata = pageMetadata({
  title: 'Security & Compliance',
  path: '/security',
  description: 'How MyClinicSoft protects patient data: encryption, role-based access controls, two-factor sign-in, audit logging, and Data Privacy Act compliance.',
});

const lock = 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z';
const document = 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
const building = 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4';
const globe = 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9';

// Every control here is implemented in the product; keep this list in step with the code.
const controls = [
  {
    icon: lock,
    title: 'Encryption',
    description: 'All traffic is encrypted with TLS, and the database is encrypted at rest. Sign-in secrets and integration keys get an extra layer of AES-256-GCM encryption.',
  },
  {
    icon: icons.phone,
    title: 'Two-factor sign-in',
    description: 'Staff can turn on authenticator-app codes, so a stolen password alone isn’t enough to get in.',
  },
  {
    icon: icons.key,
    title: 'Login protection',
    description: 'Passwords are stored as bcrypt hashes, and repeated failed sign-ins are rate-limited per account and per network.',
  },
  {
    icon: icons.users,
    title: 'Role-based access',
    description: 'Front desk, doctors, billing, and admins each see only what their role allows — and you can tailor permissions per staff member.',
  },
  {
    icon: building,
    title: 'Clinic isolation',
    description: 'Every clinic’s data is kept separate. Staff of one clinic can never see another clinic’s patients.',
  },
  {
    icon: document,
    title: 'Audit trail',
    description: 'Sign-ins, record access, and changes are logged with who, what, and when — ready for a compliance review.',
  },
  {
    icon: globe,
    title: 'Hardened web app',
    description: 'Strict transport security, a content security policy, and click-jacking protection on every page.',
  },
  {
    icon: icons.shield,
    title: 'Backups you control',
    description: 'Clinic admins can take backups of their clinic’s data from inside the app at any time.',
  },
];

const dpaTools = [
  'Export a patient’s data on request (right of access and data portability)',
  'Handle deletion requests from patients',
  'Data retention rules that clear records you no longer need',
  'An audit log of who accessed which record, and when',
];

const yourPart = [
  { title: 'Turn on two-factor sign-in', description: 'Ask every staff member to enable it in Settings.' },
  { title: 'Give the least access needed', description: 'Assign roles that match each person’s job, and remove leavers promptly.' },
  { title: 'Review the audit log', description: 'A quick monthly look catches unusual access early.' },
  { title: 'Keep your own backups', description: 'Take a backup regularly and before big changes.' },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-white">
      <PageHero
        eyebrow="Security"
        title="Patient data,"
        accent="protected by design"
        actions={
          <>
            <Link href="/privacy" className={buttonPrimary}>
              Read the Privacy Policy
              <Icon d={icons.arrow} className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
            <Link href="/contact" className={buttonSecondary}>
              Ask a security question
            </Link>
          </>
        }
      >
        MyClinicSoft is built for the Philippine Data Privacy Act. Here&apos;s exactly how we keep your clinic&apos;s
        records safe — and what you can do to help.
      </PageHero>

      {/* Controls */}
      <section className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-20">
        <div className="container mx-auto max-w-7xl">
          <SectionHeading title="What protects your data">Layers that work together, from sign-in to storage.</SectionHeading>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {controls.map((c) => (
              <li key={c.title} className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="w-10 h-10 rounded-md bg-brand-teal-light text-brand-teal-dark flex items-center justify-center mb-4">
                  <Icon d={c.icon} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">{c.title}</h3>
                <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{c.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Data Privacy Act */}
      <section className="border-y border-gray-200 bg-gray-50/70 px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="container mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-teal/30 bg-white px-3 py-1 font-mono text-xs font-semibold text-brand-teal-deep mb-4">
              RA 10173
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Built for the Data Privacy Act of 2012
            </h2>
            <p className="text-gray-600 mt-3 leading-relaxed">
              Your clinic is responsible for its patients&apos; personal and health information. MyClinicSoft gives you the
              tools to meet those obligations without extra paperwork.
            </p>
          </div>
          <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
            {dpaTools.map((t) => (
              <li key={t} className="flex items-start gap-3 px-5 py-4 text-sm text-gray-700">
                <Icon d={icons.check} className="w-4 h-4 mt-0.5 shrink-0 text-brand-teal" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Shared responsibility */}
      <section className="px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-20">
        <div className="container mx-auto max-w-7xl">
          <SectionHeading title="Your part in keeping data safe">
            Security is shared. These four habits close the gaps software can&apos;t.
          </SectionHeading>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {yourPart.map((p, i) => (
              <li key={p.title} className="border-t border-gray-200 pt-4">
                <span className="font-mono text-[11px] font-semibold text-gray-400">0{i + 1}</span>
                <h3 className="font-semibold text-gray-900 mt-1">{p.title}</h3>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{p.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <NavyBand
        title="Found a security issue?"
        actions={[
          {
            href: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Security report')}`,
            label: 'Report it privately',
            icon: icons.mail,
            primary: true,
          },
          { href: '/contact', label: 'Other questions', icon: icons.chat },
        ]}
      >
        Tell us privately and we&apos;ll investigate right away. Please don&apos;t share details publicly until it&apos;s fixed.
      </NavyBand>
    </div>
  );
}
