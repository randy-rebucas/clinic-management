import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Medical Representative Portal | My Clinic Software",
  description: "Access your medical representative account and manage your tasks",
};

export default function MedicalRepresentativePortalRouteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

