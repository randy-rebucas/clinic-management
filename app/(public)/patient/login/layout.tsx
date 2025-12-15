import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Patient Login | MyClinicSoft",
  description: "Login to your patient portal",
};

export default function PatientLoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

