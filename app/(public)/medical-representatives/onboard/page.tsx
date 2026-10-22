import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { isPayMongoConfigured } from '@/lib/paymongo';
import MedicalRepresentativeOnboardingClient from '@/components/MedicalRepresentativeOnboardingClient';

export const metadata: Metadata = pageMetadata({
  title: 'Medical Representative Registration',
  path: '/medical-representatives/onboard',
  description: 'Register as a pharmaceutical medical representative to connect with clinics that use MyClinicSoft.',
});

export default function MedicalRepresentativeOnboardingPage() {
  // Same rule as the onboard API: online payment only when PayMongo is set up and the fee is at least ₱20.
  const fee = Number(process.env.MEDREP_ACTIVATION_FEE_PHP);
  const onlineFee = isPayMongoConfigured() && fee >= 20 ? fee : null;
  return <MedicalRepresentativeOnboardingClient onlineFee={onlineFee} />;
}
