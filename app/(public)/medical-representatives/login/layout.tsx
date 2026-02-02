import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Medical Representative Login | MyClinicSoft',
  description: 'Login to your medical representative account',
};

export default function MedicalRepresentativeLoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
