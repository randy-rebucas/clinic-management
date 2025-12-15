import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Patient Portal | MyClinicSoft",
  description: "View your medical records, appointments, and more",
};

export default function PatientPortalRouteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

