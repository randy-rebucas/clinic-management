'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BrandLogo from '@/components/BrandLogo';

interface ClinicSignupUnavailableProps {
  /** The clinic whose subdomain this is, when one is active there. */
  clinicName: string | null;
  /** The subdomain the visitor is on, e.g. "my-clinic". */
  subdomain: string;
  /** The main site's sign-up page, with any referral code carried over. */
  onboardUrl: string;
  /** The main site's home page. */
  mainSiteUrl: string;
}

function Icon({ d, className = 'w-5 h-5' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

const ICONS = {
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  back: 'M10 19l-7-7m0 0l7-7m-7 7h18',
  plus: 'M12 4v16m8-8H4',
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  key: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
};

/**
 * Shown at /tenant-onboard on a clinic's subdomain. New clinics register on the main site, so
 * this explains why, points patients and staff to what they probably wanted, and offers to
 * continue the sign-up on the main site.
 */
export default function ClinicSignupUnavailable({ clinicName, subdomain, onboardUrl, mainSiteUrl }: ClinicSignupUnavailableProps) {
  const router = useRouter();
  const where = clinicName ?? subdomain;

  // Back to wherever they came from on this site; the clinic's home page otherwise.
  const goBack = () => {
    let sameSite = false;
    try {
      sameSite = !!document.referrer && new URL(document.referrer).host === window.location.host;
    } catch {
      sameSite = false;
    }
    if (sameSite && window.history.length > 1) router.back();
    else router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <main className="w-full max-w-xl">
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-6 sm:p-10">
          <div className="flex items-center gap-3 text-brand-teal-dark">
            <span className="w-10 h-10 rounded-full bg-brand-teal-light flex items-center justify-center shrink-0">
              <Icon d={ICONS.info} />
            </span>
            <p className="text-sm font-semibold uppercase tracking-[0.14em]">Clinic registration</p>
          </div>

          <h1 className="mt-5 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 text-balance">
            You can&apos;t register a new clinic from {clinicName ? `${clinicName}'s` : 'this clinic'} website
          </h1>
          <p className="mt-3 text-gray-600 leading-relaxed">
            <span className="font-medium text-gray-800">{subdomain}</span> is the website of{' '}
            {clinicName ? <span className="font-medium text-gray-800">{clinicName}</span> : 'a clinic'} on MyClinicSoft.
            New clinics sign up on the main MyClinicSoft site, where you choose your own clinic address and start a free
            14-day trial.
          </p>

          <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900">Looking for something else on {where}?</p>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li>
                <Link href="/book" className="inline-flex items-center gap-2 text-gray-700 hover:text-brand-teal-dark">
                  <Icon d={ICONS.calendar} className="w-4 h-4 text-brand-teal" />
                  Book an appointment
                </Link>
              </li>
              <li>
                <Link href="/onboard" className="inline-flex items-center gap-2 text-gray-700 hover:text-brand-teal-dark">
                  <Icon d={ICONS.user} className="w-4 h-4 text-brand-teal" />
                  Register as a patient
                </Link>
              </li>
              <li>
                <Link href="/login" className="inline-flex items-center gap-2 text-gray-700 hover:text-brand-teal-dark">
                  <Icon d={ICONS.key} className="w-4 h-4 text-brand-teal" />
                  Staff log in — joining this clinic? Ask its administrator for an invite.
                </Link>
              </li>
            </ul>
          </div>

          <div className="mt-8 flex flex-col-reverse sm:flex-row gap-3">
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:border-gray-900 transition-colors"
            >
              <Icon d={ICONS.back} className="w-4 h-4" />
              Go back
            </button>
            <a
              href={onboardUrl}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-teal px-5 py-3 text-sm font-semibold text-white hover:bg-brand-teal-dark transition-colors"
            >
              <Icon d={ICONS.plus} className="w-4 h-4" />
              I want to register a new clinic
            </a>
          </div>
        </div>

        <a
          href={mainSiteUrl}
          className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-brand-teal-dark transition-colors"
        >
          <BrandLogo size={18} rounded="rounded" />
          MyClinicSoft
        </a>
      </main>
    </div>
  );
}
