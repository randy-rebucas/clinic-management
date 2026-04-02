import type { Metadata } from 'next';
import PublicOnboardingClient from '@/components/PublicOnboardingClient';

export const metadata: Metadata = {
  title: 'Get Started — My Clinic Software',
  description:
    'Set up your clinic in minutes. Create your account and start managing patients, appointments, and billing today.',
};

export default function PublicOnboardingPage() {
  return <PublicOnboardingClient />;
}

