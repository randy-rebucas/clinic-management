import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book Appointment | ClinicHub",
  description: "Book an appointment with our clinic",
};

export default function BookLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

