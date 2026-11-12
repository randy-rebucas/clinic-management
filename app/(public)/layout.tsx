import type { Metadata } from "next";
import PublicLayout from "@/components/PublicLayout";
import ClinicSiteLayout from "@/components/clinic-site/ClinicSiteLayout";
import JsonLd from "@/components/JsonLd";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { getTenantContext } from "@/lib/tenant";
import { getClinicWebsite } from "@/lib/clinic-website";
import { verifySession } from "@/app/lib/dal";

/** On a clinic subdomain, page titles and share cards carry the clinic's name, not MyClinicSoft's. */
export async function generateMetadata(): Promise<Metadata> {
  const { tenant } = await getTenantContext();
  if (!tenant) return {};
  const clinic = await getClinicWebsite(tenant);
  return {
    title: { template: `%s | ${clinic.name}`, default: clinic.name },
    applicationName: clinic.name,
    openGraph: { siteName: clinic.name },
  };
}

export default async function PublicRouteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // On a clinic's subdomain the public pages are that clinic's website, under its own name.
  const { tenant } = await getTenantContext();
  if (tenant) {
    const [clinic, session] = await Promise.all([getClinicWebsite(tenant), verifySession()]);
    return (
      <ClinicSiteLayout clinic={clinic} signedIn={!!session && session.tenantId === tenant._id}>
        {children}
      </ClinicSiteLayout>
    );
  }

  return (
    <PublicLayout>
      <JsonLd data={[organizationJsonLd, websiteJsonLd]} />
      {children}
    </PublicLayout>
  );
}
