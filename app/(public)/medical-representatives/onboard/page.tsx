import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import MedicalRepresentativeOnboardingClient from '@/components/MedicalRepresentativeOnboardingClient';

export const metadata: Metadata = pageMetadata({
  title: 'Medical Representative Registration',
  path: '/medical-representatives/onboard',
  description: 'Register as a pharmaceutical medical representative to connect with clinics that use MyClinicSoft.',
});

export default function MedicalRepresentativeOnboardingPage() {
  return <MedicalRepresentativeOnboardingClient />;
}
