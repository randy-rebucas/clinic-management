import Link from 'next/link';

export type LegalSection = {
  id: string;
  title: string;
  body: React.ReactNode;
};

type LegalDocumentProps = {
  title: string;
  summary: string;
  /** Date the text last changed, as YYYY-MM-DD. Update it whenever the wording changes. */
  updated: string;
  sections: LegalSection[];
  related: { href: string; label: string }[];
};

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-700 leading-relaxed [&+*]:mt-4">{children}</p>;
}

export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="font-semibold text-gray-900 mt-6 mb-2 first:mt-0">{children}</h3>;
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 [&+*]:mt-4">
      {items.map((item, i) => (
        <li key={i} className="relative pl-5 text-gray-700 leading-relaxed">
          <span aria-hidden="true" className="absolute left-0 top-[0.6em] h-1.5 w-1.5 rounded-full bg-brand-teal" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ContactCard({ email }: { email: string }) {
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/70 p-4 sm:p-5">
      <dl className="grid grid-cols-[5rem_1fr] gap-y-2 text-sm">
        <dt className="text-gray-500">Email</dt>
        <dd>
          <a href={`mailto:${email}`} className="font-semibold text-brand-teal-dark hover:underline underline-offset-2">
            {email}
          </a>
        </dd>
        <dt className="text-gray-500">Operator</dt>
        <dd className="text-gray-900">DevCom Digital, Philippines</dd>
      </dl>
    </div>
  );
}

export default function LegalDocument({ title, summary, updated, sections, related }: LegalDocumentProps) {
  const updatedLabel = new Date(`${updated}T00:00:00`).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <section className="relative overflow-hidden border-b border-gray-200 px-4 sm:px-6 lg:px-8">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 80% 90% at 30% 0%, black 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 90% at 30% 0%, black 20%, transparent 75%)',
          }}
        />
        <div className="container relative mx-auto max-w-6xl py-12 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal-dark mb-3">Legal</p>
          <h1 className="animate-fade-up-in text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-[1.06]">
            {title}
          </h1>
          <p className="animate-fade-up-in text-base sm:text-lg text-gray-600 mt-4 max-w-2xl leading-relaxed" style={{ animationDelay: '90ms' }}>
            {summary}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-gray-500">
              Last updated <time dateTime={updated} className="font-medium text-gray-900">{updatedLabel}</time>
            </span>
            {related.map((r) => (
              <Link key={r.href} href={r.href} className="font-semibold text-brand-teal-dark hover:underline underline-offset-2">
                {r.label} →
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="container mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-10 lg:gap-16">
          <nav aria-label="On this page" className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 mb-3">On this page</p>
            <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-x-6 border-l border-gray-200">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="-ml-px flex gap-2.5 border-l border-transparent py-1.5 pl-4 text-sm text-gray-600 transition-colors duration-150 hover:border-brand-teal hover:text-gray-900"
                  >
                    <span className="font-mono text-[11px] text-gray-400 pt-0.5 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="max-w-3xl">
            {sections.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                aria-labelledby={`${s.id}-title`}
                className="scroll-mt-24 border-t border-gray-100 py-8 first:border-t-0 first:pt-0"
              >
                <h2 id={`${s.id}-title`} className="flex items-baseline gap-3 text-xl sm:text-2xl font-bold text-gray-900 tracking-tight mb-4">
                  <span className="font-mono text-sm font-semibold text-brand-teal-dark tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {s.title}
                </h2>
                {s.body}
              </section>
            ))}

            <div className="mt-4 flex flex-col gap-3 rounded-xl bg-brand-navy p-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-300">
                Questions about this document? Our team answers patients and clinics alike.
              </p>
              <Link
                href="/contact"
                className="inline-flex shrink-0 items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-brand-navy transition-colors duration-150 hover:bg-slate-100"
              >
                Contact us
              </Link>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
