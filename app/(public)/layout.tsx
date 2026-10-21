import PublicLayout from "@/components/PublicLayout";
import JsonLd from "@/components/JsonLd";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";

export default function PublicRouteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PublicLayout>
      <JsonLd data={[organizationJsonLd, websiteJsonLd]} />
      {children}
    </PublicLayout>
  );
}
