import type { Metadata } from 'next';
import TenantOnboardClient from '@/components/TenantOnboardClient';

export const metadata: Metadata = {
  title: 'Register Your Clinic | My Clinic Software',
  description: 'Set up your clinic in minutes — name, contact details, and admin account.',
};

export default function TenantOnboardPage() {
  return <TenantOnboardClient />;
}

