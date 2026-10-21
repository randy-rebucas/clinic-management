import type { Metadata } from "next";
import { NO_INDEX } from "@/lib/seo";

export const metadata: Metadata = {
  title: { default: "Sign In", template: "%s | MyClinicSoft" },
  description: "Sign in to your MyClinicSoft account",
  robots: NO_INDEX,
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

