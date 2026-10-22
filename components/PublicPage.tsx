import Link from 'next/link';

/** Shared building blocks for the marketing pages, matching the home page system. */

export function Icon({ d, className = 'w-5 h-5' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

export const icons = {
  arrow: 'M13 7l5 5m0 0l-5 5m5-5H6',
  chevron: 'M9 5l7 7-7 7',
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  chat: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  question: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  bolt: 'M13 10V3L4 14h7v7l9-11h-7z',
  check: 'M5 13l4 4L19 7',
  checkCircle: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  phone: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
  lifebuoy: 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z',
  book: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  bug: 'M12 19c-3.314 0-6-2.686-6-6V9a6 6 0 0112 0v4c0 3.314-2.686 6-6 6zm0 0v-8m-6 2H3m18 0h-3M6.5 6.5L4 4m13.5 2.5L20 4M6 17l-2 2m14-2l2 2',
  key: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
};

/** Hero with the faint grid backdrop used across the public site. */
export function PageHero({
  eyebrow,
  title,
  accent,
  children,
  actions,
}: {
  eyebrow: string;
  title: React.ReactNode;
  /** Second headline line, set in brand teal. */
  accent?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden px-4 sm:px-6 lg:px-8">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 30% 0%, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 30% 0%, black 20%, transparent 75%)',
        }}
      />
      <div className="container relative mx-auto max-w-7xl py-12 sm:py-16 lg:py-20">
        <div className="max-w-3xl">
          <p className="animate-fade-up-in text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal-dark mb-4">
            {eyebrow}
          </p>
          <h1 className="animate-fade-up-in text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold text-gray-900 tracking-tight leading-[1.06]">
            {title}
            {accent && (
              <>
                <br />
                <span className="text-brand-teal-dark">{accent}</span>
              </>
            )}
          </h1>
          {children && (
            <p
              className="animate-fade-up-in text-base sm:text-lg text-gray-600 mt-5 max-w-xl leading-relaxed"
              style={{ animationDelay: '90ms' }}
            >
              {children}
            </p>
          )}
          {actions && (
            <div className="animate-fade-up-in mt-8 flex flex-col sm:flex-row gap-3" style={{ animationDelay: '160ms' }}>
              {actions}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export const buttonPrimary =
  'group inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-teal text-white rounded-md font-semibold hover:bg-brand-teal-dark transition-colors duration-150 shadow-[0_6px_20px_rgba(14,165,164,0.3)]';

export const buttonSecondary =
  'inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-900 rounded-md font-semibold border border-gray-300 hover:border-gray-900 transition-colors duration-150';

export function SectionHeading({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-8 sm:mb-10">
      <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">{title}</h2>
      {children && <p className="text-gray-600 mt-2 max-w-xl">{children}</p>}
    </div>
  );
}

/** Navy closing band, as on the home page. */
export function NavyBand({
  title,
  children,
  actions,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  actions: { href: string; label: string; icon?: string; primary?: boolean }[];
}) {
  return (
    <section className="relative bg-brand-navy px-4 sm:px-6 lg:px-8 py-12 sm:py-14 overflow-hidden">
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
      <div className="container relative mx-auto max-w-7xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
        <div className="text-center lg:text-left">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">{title}</h2>
          {children && <p className="text-slate-300 max-w-lg mx-auto lg:mx-0">{children}</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {actions.map((a) => {
            const className = a.primary
              ? 'inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-brand-navy rounded-md font-semibold hover:bg-slate-100 transition-colors duration-150 text-sm'
              : 'inline-flex items-center justify-center gap-2 px-5 py-3 text-white rounded-md font-semibold border border-white/30 hover:border-white/60 transition-colors duration-150 text-sm';
            const inner = (
              <>
                {a.icon && <Icon d={a.icon} className="w-4 h-4" />}
                {a.label}
              </>
            );
            return a.href.startsWith('mailto:') ? (
              <a key={a.href} href={a.href} className={className}>
                {inner}
              </a>
            ) : (
              <Link key={a.href} href={a.href} className={className}>
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export const SUPPORT_EMAIL = 'support@myclinicsoft.solutions';

export const supportHours = [
  { days: 'Monday – Friday', hours: '9:00 AM – 6:00 PM' },
  { days: 'Saturday', hours: '10:00 AM – 4:00 PM' },
  { days: 'Sunday', hours: 'Closed' },
];

export function SupportHours({ className = '' }: { className?: string }) {
  return (
    <dl className={`divide-y divide-gray-100 text-sm ${className}`}>
      {supportHours.map((h) => (
        <div key={h.days} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="text-gray-600">{h.days}</dt>
          <dd className={`font-mono tabular-nums ${h.hours === 'Closed' ? 'text-gray-400' : 'font-semibold text-gray-900'}`}>
            {h.hours}
          </dd>
        </div>
      ))}
    </dl>
  );
}
