import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Signed-in app routes only redirect to /login, and the token pages (invites, feedback,
// document verification) must never be crawled. /login itself stays crawlable so its
// noindex tag is seen; the (auth) layout keeps it out of results.
const PRIVATE_PATHS = [
  "/api/",
  "/admin",
  "/appointments",
  "/dashboard",
  "/doctors",
  "/documents",
  "/emcr-requests",
  "/hmo-claims",
  "/inventory",
  "/invoices",
  "/lab-results",
  "/medical-reps",
  "/memberships",
  "/messages",
  "/notifications",
  "/patients",
  "/philhealth",
  "/prescriptions",
  "/profile",
  "/queue",
  "/referrals",
  "/reports",
  "/settings",
  "/templates",
  "/tenant-not-found",
  "/visits",
  "/platform",
  "/set-password",
  "/feedback/",
  "/verify",
  "/pay/",
  "/install",
  "/marketing-funnel",
  "/monitoring",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
