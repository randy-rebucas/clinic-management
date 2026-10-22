import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import PublicBookingClient from '@/components/PublicBookingClient';

export const metadata: Metadata = pageMetadata({
  title: 'Book a Clinic Appointment Online',
  path: '/book',
  description: 'Book a clinic appointment online: choose your clinic and doctor, pick a schedule that works for you, and get a confirmation right away.',
});

export default function PublicBookingPage() {
  return <PublicBookingClient />;
}
