import LoginForm from '@/components/LoginForm';
import BrandLogo from '@/components/BrandLogo';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';

export default async function LoginPage() {
  const session = await verifySession();

  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex bg-white">
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
            <BrandLogo size={48} rounded="rounded-2xl" />
            <span className="text-white font-bold text-lg">My Clinic Software</span>
          </Link>
        </div>

        {/* Center content */}
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

        {/* Bottom tagline */}
        <div className="relative z-10">
          <p className="text-slate-400 text-sm">
            &copy; {new Date().getFullYear()} My Clinic Software. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 sm:px-12 bg-white relative overflow-hidden">
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
          <Link href="/" className="flex lg:hidden items-center justify-center gap-3 mb-10">
            <BrandLogo size={44} rounded="rounded-2xl" className="shadow-lg" />
            <span className="text-gray-900 font-bold text-lg">My Clinic Software</span>
          </Link>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">Welcome back</h1>
            <p className="text-gray-500 text-sm sm:text-base">Sign in to your clinic account to continue.</p>
          </div>

          <LoginForm />

          <p className="mt-8 text-center text-xs text-gray-500 flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Protected by secure authentication &mdash; My Clinic Software
          </p>
        </div>
      </div>
    </div>
  );
}
