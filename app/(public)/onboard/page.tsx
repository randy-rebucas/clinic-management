import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import PublicOnboardingClient from '@/components/PublicOnboardingClient';

export const metadata: Metadata = pageMetadata({
  title: 'Patient Registration',
  path: '/onboard',
  description: 'Register as a patient online in a few minutes and get your patient code for faster check-in at your clinic.',
});

export default function PublicOnboardingPage() {
  return <PublicOnboardingClient />;
}

