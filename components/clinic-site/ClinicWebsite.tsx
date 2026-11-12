import Link from 'next/link';
import type { ClinicWebsiteData } from '@/lib/clinic-website';
import ClinicMark from '@/components/clinic-site/ClinicMark';

function Icon({ d, className = 'w-5 h-5' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

const icons = {
  pin: 'M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z',
  phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  userPlus: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
  phoneApp: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
};

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-PH')}`;
  }
}

function initials(name: string) {
  return name
    .replace(/^(Dr|Dra|Prof)\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

interface ClinicWebsiteProps {
  clinic: ClinicWebsiteData;
  /** Today's weekday in the clinic's time zone, e.g. "monday". */
  today: string;
}

/** Home page of a clinic's subdomain: who the clinic is, its doctors, services, hours and how to reach it. */
export default function ClinicWebsite({ clinic, today }: ClinicWebsiteProps) {
  const todayHours = clinic.hours.find((h) => h.day === today);
  const mapUrl = clinic.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${clinic.name}, ${clinic.address}`)}`
    : null;

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-teal-light/50 to-white px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl pt-12 pb-10 sm:pt-20 sm:pb-16 lg:pt-24 lg:pb-20">
          <div className="max-w-3xl">
            <div className="mb-6">
              <ClinicMark name={clinic.name} logo={clinic.logo} size={64} />
            </div>
            <h1 className="text-3xl min-[400px]:text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 text-balance break-words">{clinic.name}</h1>
            {clinic.address && (
              <p className="mt-4 flex items-start gap-2 text-lg text-gray-600">
                <Icon d={icons.pin} className="w-5 h-5 mt-1 shrink-0 text-brand-teal" />
                <span>{clinic.address}</span>
              </p>
            )}
            {todayHours && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1 text-sm text-gray-700">
                <span
                  aria-hidden="true"
                  className={`w-2 h-2 rounded-full ${todayHours.closed ? 'bg-gray-400' : 'bg-emerald-500'}`}
                />
                {todayHours.closed ? 'Closed today' : `Open today · ${todayHours.text}`}
              </p>
            )}
            <div className="mt-8 flex flex-col sm:flex-row sm:flex-wrap gap-3">
              <Link
                href="/book"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-teal px-5 py-3 font-semibold text-white hover:bg-brand-teal-dark transition-colors"
              >
                <Icon d={icons.calendar} />
                Book an appointment
              </Link>
              {clinic.phone && (
                <a
                  href={`tel:${clinic.phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 font-semibold text-gray-900 hover:border-gray-900 transition-colors"
                >
                  <Icon d={icons.phone} />
                  Call {clinic.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Doctors */}
      {clinic.doctors.length > 0 && (
        <section id="doctors" className="scroll-mt-20 px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
          <div className="container mx-auto max-w-7xl">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Our doctors</h2>
            <p className="mt-2 text-gray-600">Choose your doctor when you book, or let us match you with whoever is free.</p>
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {clinic.doctors.map((d) => (
                <li key={d.id} className="rounded-2xl border border-gray-200 p-6 flex flex-col">
                  <div className="flex items-center gap-4">
                    <span
                      aria-hidden="true"
                      className="w-14 h-14 rounded-full bg-brand-teal-light text-brand-teal-dark font-bold text-lg flex items-center justify-center shrink-0"
                    >
                      {initials(d.name)}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 break-words">{d.name}</h3>
                      {d.specialization && <p className="text-sm text-brand-teal-dark">{d.specialization}</p>}
                    </div>
                  </div>
                  {d.qualifications.length > 0 && (
                    <p className="mt-4 text-xs text-gray-500">{d.qualifications.join(' · ')}</p>
                  )}
                  {d.bio && <p className="mt-3 text-sm text-gray-600 leading-relaxed line-clamp-4">{d.bio}</p>}
                  <div className="mt-auto pt-5 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                    <p className="text-sm text-gray-500">
                      {d.days.length > 0 ? <>Clinic days: <span className="text-gray-800">{d.days.join(', ')}</span></> : 'By appointment'}
                    </p>
                    <Link
                      href="/book"
                      className="inline-flex items-center justify-center rounded-md border border-brand-teal/40 px-4 py-2 text-sm font-semibold text-brand-teal-dark hover:bg-brand-teal-light/60 transition-colors shrink-0"
                    >
                      Book
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Services */}
      {clinic.services.length > 0 && (
        <section id="services" className="scroll-mt-20 bg-gray-50 px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
          <div className="container mx-auto max-w-7xl">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Services</h2>
            <p className="mt-2 text-gray-600">Prices are a guide; your doctor will confirm what you need.</p>
            <div className="mt-10 grid gap-8 lg:grid-cols-2">
              {clinic.services.map((group) => (
                <div key={group.category} className="rounded-2xl bg-white border border-gray-200 p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">{group.category}</h3>
                  <ul className="mt-4 divide-y divide-gray-100">
                    {group.items.map((s) => (
                      <li key={s.id} className="py-3 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 break-words">{s.name}</p>
                          {s.description && <p className="text-sm text-gray-500 line-clamp-2">{s.description}</p>}
                        </div>
                        <p className="text-right shrink-0">
                          <span className="font-semibold text-gray-900 tabular-nums">{money(s.price, clinic.currency)}</span>
                          {s.unit && s.unit !== 'per service' && <span className="block text-xs text-gray-500">{s.unit}</span>}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Hours + contact */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="container mx-auto max-w-7xl grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div id="hours" className="scroll-mt-20">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-3">
              <Icon d={icons.clock} className="w-7 h-7 text-brand-teal" />
              Clinic hours
            </h2>
            <table className="mt-6 w-full sm:max-w-md text-left">
              <caption className="sr-only">Opening hours by day</caption>
              <tbody className="divide-y divide-gray-100">
                {clinic.hours.map((h) => {
                  const isToday = h.day === today;
                  return (
                    <tr key={h.day} className={isToday ? 'font-semibold text-gray-900' : 'text-gray-700'}>
                      <th scope="row" className={`py-2.5 pr-6 ${isToday ? 'font-semibold' : 'font-normal'}`}>
                        {h.label}
                        {isToday && <span className="ml-2 text-xs font-medium text-brand-teal-dark">Today</span>}
                      </th>
                      <td className={`py-2.5 tabular-nums text-right sm:text-left ${h.closed ? 'text-gray-400' : ''}`}>{h.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div id="contact" className="scroll-mt-20">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Visit or contact us</h2>
            <ul className="mt-6 space-y-4">
              {clinic.address && (
                <li className="flex items-start gap-3">
                  <Icon d={icons.pin} className="w-5 h-5 mt-0.5 text-brand-teal shrink-0" />
                  <div>
                    <p className="text-gray-800">{clinic.address}</p>
                    {mapUrl && (
                      <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-block py-1.5 text-sm font-semibold text-brand-teal-dark hover:underline">
                        Get directions
                      </a>
                    )}
                  </div>
                </li>
              )}
              {clinic.phone && (
                <li className="flex items-center gap-3">
                  <Icon d={icons.phone} className="w-5 h-5 text-brand-teal shrink-0" />
                  <a href={`tel:${clinic.phone.replace(/[^\d+]/g, '')}`} className="text-gray-800 hover:text-brand-teal-dark">
                    {clinic.phone}
                  </a>
                </li>
              )}
              {clinic.email && (
                <li className="flex items-center gap-3">
                  <Icon d={icons.mail} className="w-5 h-5 text-brand-teal shrink-0" />
                  <a href={`mailto:${clinic.email}`} className="text-gray-800 hover:text-brand-teal-dark break-all">
                    {clinic.email}
                  </a>
                </li>
              )}
            </ul>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link href="/onboard" className="rounded-xl border border-gray-200 p-4 hover:border-brand-teal/60 transition-colors">
                <Icon d={icons.userPlus} className="w-5 h-5 text-brand-teal" />
                <p className="mt-2 font-semibold text-gray-900">New patient?</p>
                <p className="text-sm text-gray-600">Register before your visit to skip the paperwork.</p>
              </Link>
              <Link href="/download" className="rounded-xl border border-gray-200 p-4 hover:border-brand-teal/60 transition-colors">
                <Icon d={icons.phoneApp} className="w-5 h-5 text-brand-teal" />
                <p className="mt-2 font-semibold text-gray-900">Your records, on your phone</p>
                <p className="text-sm text-gray-600">See results and prescriptions in the eMCR app.</p>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
