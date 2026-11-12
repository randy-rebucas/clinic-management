import type { Metadata } from 'next';
import LoginForm from '@/components/LoginForm';
import BrandLogo from '@/components/BrandLogo';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import { getClinicIdentity, type ClinicIdentity } from '@/lib/clinic-website';
import { mainSiteHost } from '@/lib/subdomain';
import ClinicMark from '@/components/clinic-site/ClinicMark';

const PIN = 'M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z';
const PHONE =
  'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z';
const GLOBE = 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9';

function Icon({ d, className }: { d: string; className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

/**
 * Which clinic this sign-in is for, pinned to the top so staff can tell they're on the right one
 * before typing a password. "Not your clinic?" goes to the main site's sign-in, where they pick
 * their clinic. Fixed over the form column only: on desktop it starts where the branding panel
 * (lg:w-1/2 xl:w-5/12) ends.
 */
function SigningInTo({ clinic, host, switchUrl }: { clinic: ClinicIdentity; host: string; switchUrl: string }) {
  return (
    <section
      aria-label="Clinic"
      className="fixed top-0 right-0 left-0 lg:left-1/2 xl:left-[41.666667%] z-50 h-16 border-b border-gray-200 bg-white/95 backdrop-blur-md"
    >
      <div className="flex h-full items-center gap-3 px-4 sm:px-6 lg:px-8">
        <ClinicMark name={clinic.name} logo={clinic.logo} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 leading-none">Signing in to</p>
          <p className="mt-1 truncate font-bold text-gray-900 leading-tight" title={clinic.address ? `${clinic.name} · ${clinic.address}` : clinic.name}>
            {clinic.name}
            {clinic.address && (
              <span className="hidden md:inline font-normal text-sm text-gray-500"> · {clinic.address}</span>
            )}
          </p>
        </div>
        <span className="hidden xl:inline text-xs text-gray-500 shrink-0">{host}</span>
        <a
          href={switchUrl}
          className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-xs sm:text-sm font-semibold text-gray-700 hover:border-gray-900 hover:text-gray-900 transition-colors"
        >
          <span className="hidden sm:inline">Not your clinic? </span>Switch
        </a>
      </div>
    </section>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const { tenant } = await getTenantContext();
  if (!tenant) return {};
  const clinic = await getClinicIdentity(tenant);
  return { title: { absolute: `Staff sign in | ${clinic.name}` } };
}

export default async function LoginPage() {
  const session = await verifySession();

  // A medical representative's session is only good for the mobile API, not the web app.
  if (session && session.role !== 'medical-representative') {
    redirect('/dashboard');
  }

  // On a clinic subdomain, show staff which clinic they are signing in to.
  const { tenant } = await getTenantContext();
  const clinic = tenant ? await getClinicIdentity(tenant) : null;
  const h = await headers();
  const host = (h.get('x-forwarded-host') || h.get('host') || '').toLowerCase();
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const switchUrl = `${proto}://${mainSiteHost(host)}/login`;

  return (
    <div className="min-h-screen flex bg-white">
      {clinic && <SigningInTo clinic={clinic} host={host} switchUrl={switchUrl} />}
      {/* Left branding panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 relative flex-col justify-between p-12 bg-brand-navy overflow-hidden">
        {/* Background decoration — grid pattern, consistent with homepage */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to right, #ffffff10 1px, transparent 1px), linear-gradient(to bottom, #ffffff10 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 80%)',
          }}
        />

        {/* Scattered medical iconography — subtle texture, not clutter */}
        <div className="pointer-events-none absolute inset-0 text-white/[0.07]">
          {/* Stethoscope */}
          <svg className="absolute -top-6 right-10 w-40 h-40 rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4.5 3v6a3.5 3.5 0 007 0V3M8 12.5v2a5 5 0 0010 0v-2.379a2.5 2.5 0 10-1-.001M20.5 10.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM4.5 3H3M11.5 3H10" />
          </svg>
          {/* Heartbeat pulse */}
          <svg className="absolute top-1/3 -left-8 w-56 h-28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2 12h4l2-6 4 12 3-9 2 3h5" />
          </svg>
          {/* Cross / first aid */}
          <svg className="absolute bottom-24 right-16 w-24 h-24 -rotate-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4v16m8-8H4" />
            <rect x="3" y="3" width="18" height="18" rx="3" strokeWidth={1} />
          </svg>
          {/* Pill capsule */}
          <svg className="absolute bottom-40 left-6 w-28 h-16 rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="2" y="8" width="20" height="8" rx="4" strokeWidth={1} />
            <path strokeWidth={1} d="M12 8v8" />
          </svg>
          {/* Syringe */}
          <svg className="absolute top-14 left-1/2 w-32 h-32 -translate-x-1/2 rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M18 3l3 3m-5-1l3 3M6 21l-2-2m0 0l1.5-4.5L14 6l4 4-8.5 8.5L6 21zM12 8l4 4" />
          </svg>
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-3">
            {clinic ? (
              <ClinicMark name={clinic.name} logo={clinic.logo} size={48} />
            ) : (
              <BrandLogo size={48} rounded="rounded-2xl" />
            )}
            <span className="text-white font-bold text-lg">{clinic ? clinic.name : 'MyClinicSoft'}</span>
          </Link>
        </div>

        {/* Center content */}
        {clinic ? (
          <div className="relative z-10 space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Staff portal</p>
            <div>
              <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight mb-3 tracking-tight text-balance">
                {clinic.name}
              </h2>
              <p className="text-slate-300 text-base xl:text-lg leading-relaxed">
                For doctors, nurses, front desk and administrators of this clinic.
              </p>
            </div>
            <ul className="flex flex-col gap-3 pt-2 text-sm text-slate-300">
              {clinic.address && (
                <li className="flex items-start gap-3">
                  <Icon d={PIN} className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                  {clinic.address}
                </li>
              )}
              {clinic.phone && (
                <li className="flex items-center gap-3">
                  <Icon d={PHONE} className="w-4 h-4 text-slate-400 shrink-0" />
                  {clinic.phone}
                </li>
              )}
              <li className="flex items-center gap-3">
                <Icon d={GLOBE} className="w-4 h-4 text-slate-400 shrink-0" />
                {host}
              </li>
            </ul>
          </div>
        ) : (
        <div className="relative z-10 space-y-6">
          <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center border border-white/20">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight mb-3 tracking-tight">
              Clinic management,<br />simplified.
            </h2>
            <p className="text-slate-300 text-base xl:text-lg leading-relaxed">
              Manage patients, appointments, queues, and billing — all in one place.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-col gap-3 pt-2">
            {[
              { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', label: 'Patient Records' },
              { icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', label: 'Appointment Scheduling' },
              { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', label: 'Queue Management' },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                  </svg>
                </div>
                <span className="text-slate-300 text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Bottom tagline */}
        <div className="relative z-10">
          <p className="text-slate-400 text-sm">
            {clinic ? 'Powered by MyClinicSoft' : <>&copy; {new Date().getFullYear()} MyClinicSoft. All rights reserved.</>}
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className={`flex-1 flex flex-col justify-center items-center px-6 py-12 sm:px-12 bg-white relative overflow-hidden ${clinic ? 'pt-28' : ''}`}>
        {/* Subtle grid background for mobile */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 lg:hidden"
          style={{
            backgroundImage:
              'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 20%, black 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 20%, black 20%, transparent 75%)',
          }}
        />

        <div className="w-full max-w-md">
          {/* Mobile logo */}
          {!clinic && (
            <Link href="/" className="flex lg:hidden items-center justify-center gap-3 mb-10">
              <BrandLogo size={44} rounded="rounded-2xl" className="shadow-lg" />
              <span className="text-gray-900 font-bold text-lg">MyClinicSoft</span>
            </Link>
          )}


          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">Welcome back</h1>
            <p className="text-gray-500 text-sm sm:text-base">
              {clinic ? `Sign in with your ${clinic.name} staff account.` : 'Sign in to your clinic account to continue.'}
            </p>
            {/* Phones get neither the branding panel nor the bar's address: say where, for clinics with branches. */}
            {clinic?.address && (
              <p className="md:hidden mt-2 flex items-start gap-1.5 text-xs text-gray-500">
                <Icon d={PIN} className="w-3.5 h-3.5 mt-px shrink-0 text-gray-400" />
                {clinic.address}
              </p>
            )}
          </div>

          <LoginForm />

          <p className="mt-8 text-center text-xs text-gray-500 flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Protected by secure authentication &mdash; MyClinicSoft
          </p>
        </div>
      </div>
    </div>
  );
}
