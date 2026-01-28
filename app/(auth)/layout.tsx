import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MyClinicSoft - Authentication",
  description: "Login to MyClinicSoft",
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

