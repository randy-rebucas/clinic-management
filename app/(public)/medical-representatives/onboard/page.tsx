import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { isPayMongoConfigured } from '@/lib/paymongo';
import { isMedRepSelfSignupEnabled } from '@/lib/medrep-signup';
import { PageHero, buttonPrimary, buttonSecondary } from '@/components/PublicPage';
import MedicalRepresentativeOnboardingClient from '@/components/MedicalRepresentativeOnboardingClient';

export const metadata: Metadata = pageMetadata({
  title: 'Medical Representative Registration',
  path: '/medical-representatives/onboard',
  description: 'Register as a pharmaceutical medical representative to connect with clinics that use MyClinicSoft.',
});

export default function MedicalRepresentativeOnboardingPage() {
  // Reps lost their web portal on 2026-10-18; until their app ships, signing up (and paying) would
  // create an account nobody can sign in to.
  if (!isMedRepSelfSignupEnabled()) {
    return (
      <PageHero
        eyebrow="Medical representatives"
        title="A dedicated app for reps"
        accent="is on the way."
        actions={
          <>
            <Link href="/contact" className={buttonPrimary}>Ask to be notified</Link>
            <Link href="/" className={buttonSecondary}>Back to home</Link>
          </>
        }
      >
        Rep registration is paused while we build it. Clinics that already work with you can still add you from
        their own account.
      </PageHero>
    );
  }

  // Same rule as the onboard API: online payment only when PayMongo is set up and the fee is at least ₱20.
  const fee = Number(process.env.MEDREP_ACTIVATION_FEE_PHP);
  const onlineFee = isPayMongoConfigured() && fee >= 20 ? fee : null;
  return <MedicalRepresentativeOnboardingClient onlineFee={onlineFee} />;
}
