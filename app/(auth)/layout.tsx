import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ClinicHub - Authentication",
  description: "Login to ClinicHub",
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

