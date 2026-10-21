import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

type Entry = [path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]];

// Every indexable public page. Keep in step with the pages that call pageMetadata().
const PAGES: Entry[] = [
  ["/", 1, "weekly"],
  ["/features", 0.9, "monthly"],
  ["/pricing", 0.9, "monthly"],
  ["/tenant-onboard", 0.9, "monthly"],
  ["/compare", 0.8, "monthly"],
  ["/integrations", 0.7, "monthly"],
  ["/security", 0.7, "monthly"],
  ["/faq", 0.7, "monthly"],
  ["/about", 0.6, "monthly"],
  ["/contact", 0.6, "yearly"],
  ["/support", 0.6, "monthly"],
  ["/resources", 0.6, "monthly"],
  ["/testimonials", 0.5, "monthly"],
  ["/book", 0.5, "monthly"],
  ["/onboard", 0.5, "monthly"],
  ["/medical-representatives/onboard", 0.4, "yearly"],
  ["/privacy", 0.3, "yearly"],
  ["/terms", 0.3, "yearly"],
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(([path, priority, changeFrequency]) => ({
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));
}
