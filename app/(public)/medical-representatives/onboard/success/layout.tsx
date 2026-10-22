import type { Metadata } from 'next';
import { NO_INDEX } from '@/lib/seo';

// The page reads its query on the client, so its metadata lives here.
export const metadata: Metadata = { title: 'Registration received', robots: NO_INDEX };

export default function MedicalRepresentativeSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
