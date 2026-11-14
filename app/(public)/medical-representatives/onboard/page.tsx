import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { PageHero, buttonPrimary, buttonSecondary } from '@/components/PublicPage';

export const metadata: Metadata = pageMetadata({
  title: 'Medical Representative Registration',
  path: '/medical-representatives/onboard',
  description: 'Medical representatives sign up in eMedRoute, the rep app, to connect with clinics that use MyClinicSoft.',
});

/**
 * Reps sign up only in the eMedRoute app, which proves the email and the mobile number and sets the
 * password up front (/api/medical-representatives/onboard/app/*). The web form was retired on 2026-11-14.
 */
export default function MedicalRepresentativeOnboardingPage() {
  return (
    <PageHero
      eyebrow="Medical representatives"
      title="eMedRoute, the app for reps,"
      accent="is on Google Play."
      actions={
        <>
          <a
            href="https://play.google.com/store/apps/details?id=solutions.myclinicsoft.emedroute"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonPrimary}
          >
            Get eMedRoute
          </a>
          <Link href="/" className={buttonSecondary}>Back to home</Link>
        </>
      }
    >
      Download the app to create your rep account and connect with clinics that use MyClinicSoft.
    </PageHero>
  );
}
