import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | My Clinic Software",
  description: "Sign in to your My Clinic Software account",
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

