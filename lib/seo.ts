import type { Metadata } from 'next';

/**
 * Shared SEO config for the public marketing site. Page metadata goes through pageMetadata()
 * so every page gets its own canonical URL and Open Graph/Twitter copy — Next.js merges
 * metadata shallowly, so a page that sets no openGraph would otherwise inherit the home page's.
 */

export const SITE_NAME = 'MyClinicSoft';

export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://www.myclinicsoft.solutions';

export const SITE_DESCRIPTION =
  'Cloud clinic management software for Philippine clinics — patient records, appointments, queues, billing, PhilHealth and HMO claims, inventory, and the eMCR patient app.';

export const SUPPORT_EMAIL = 'support@myclinicsoft.solutions';

export const EMCR_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=solutions.myclinicsoft.emcr';

/** Unset until the iOS app is published; iPhone visitors to /download get the unsupported page. */
export const EMCR_APP_STORE_URL = process.env.NEXT_PUBLIC_EMCR_APP_STORE_URL || null;

/** Off for every non-public area (signed-in app, sign-in, one-time links). */
export const NO_INDEX: Metadata['robots'] = { index: false, follow: false };

interface PageSeo {
  /** Bare page title; the root layout appends " | MyClinicSoft". */
  title: string;
  description: string;
  /** Path on the canonical host, e.g. "/pricing". */
  path: string;
  /** Title for social cards when it should differ from the <title>. */
  socialTitle?: string;
  /** Skip the root title template (the home page carries the brand itself). */
  absoluteTitle?: boolean;
}

export function pageMetadata({ title, description, path, socialTitle, absoluteTitle }: PageSeo): Metadata {
  const shareTitle = socialTitle ?? (absoluteTitle ? title : `${title} | ${SITE_NAME}`);
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_PH',
      url: path,
      title: shareTitle,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description,
    },
  };
}

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512x512.png`,
  email: SUPPORT_EMAIL,
  parentOrganization: { '@type': 'Organization', name: 'DevCom Digital' },
  areaServed: { '@type': 'Country', name: 'Philippines' },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: SUPPORT_EMAIL,
    areaServed: 'PH',
    availableLanguage: ['English', 'Filipino'],
  },
  sameAs: [EMCR_PLAY_STORE_URL],
};

export const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: 'en-PH',
  publisher: { '@id': `${SITE_URL}/#organization` },
};

export function softwareApplicationJsonLd(
  offers?: { name: string; price: number; priceCurrency: string; description?: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#software`,
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Clinic management software',
    operatingSystem: 'Web browser',
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    publisher: { '@id': `${SITE_URL}/#organization` },
    ...(offers && {
      // Subscription prices: the spec marks each price as per month.
      offers: offers.map((o) => ({
        '@type': 'Offer',
        name: o.name,
        price: o.price,
        priceCurrency: o.priceCurrency,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: o.price,
          priceCurrency: o.priceCurrency,
          billingDuration: 'P1M',
          unitCode: 'MON',
        },
        ...(o.description && { description: o.description }),
        url: `${SITE_URL}/pricing`,
      })),
    }),
  };
}

export function faqPageJsonLd(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}
