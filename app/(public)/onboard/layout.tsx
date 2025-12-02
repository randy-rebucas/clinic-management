import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Patient Registration | ClinicHub",
  description: "Register as a new patient",
};

export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

