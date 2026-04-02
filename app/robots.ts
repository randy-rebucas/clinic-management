import type { MetadataRoute } from "next";

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://myclinicsoft.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/features", "/about", "/onboard", "/demo"],
        disallow: [
          "/api/",
          "/dashboard",
          "/patients",
          "/appointments",
          "/doctors",
          "/invoices",
          "/inventory",
          "/prescriptions",
          "/lab-results",
          "/referrals",
          "/documents",
          "/subscription",
          "/patient/",
          "/medical-representative/",
          "/login",
          "/_next/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
