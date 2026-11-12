import 'server-only';

import { cache } from 'react';
import { headers } from 'next/headers';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import { getSettings } from '@/lib/settings';
import { WEEKDAYS, WEEKDAY_LABEL, clock12, type Weekday } from '@/lib/clinic-settings';
import Doctor from '@/models/Doctor';
import Service from '@/models/Service';
import '@/models/Specialization';
import type { TenantData } from '@/lib/tenant';

/**
 * What a clinic's public website (its subdomain's home page) shows. Only facts a clinic already
 * publishes: contact details, opening hours, active doctors (name, specialty, bio, clinic days)
 * and active services with prices. Never a doctor's email, phone, license or time-off.
 */
export interface ClinicWebsiteData {
  name: string;
  logo?: string;
  address?: string;
  phone?: string;
  email?: string;
  hours: { day: Weekday; label: string; text: string; closed: boolean }[];
  /** Days with the same hours run together, e.g. "Mon – Fri" / "9:00 AM – 5:00 PM". */
  hoursSummary: { days: string; text: string }[];
  doctors: {
    id: string;
    name: string;
    specialization?: string;
    bio?: string;
    qualifications: string[];
    days: string[];
  }[];
  services: {
    category: string;
    items: { id: string; name: string; description?: string; price: number; unit?: string }[];
  }[];
  currency: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  consultation: 'Consultations',
  procedure: 'Procedures',
  laboratory: 'Laboratory',
  imaging: 'Imaging',
  medication: 'Medication',
  other: 'Other services',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL);

// Doctor.schedule uses 0 = Sunday; show Monday first like the opening hours.
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const MAX_DOCTORS = 24;
const MAX_SERVICES = 60;

/** Who the clinic is, as staff and patients know it: name, logo and contact details. */
export interface ClinicIdentity {
  name: string;
  logo?: string;
  address?: string;
  phone?: string;
  email?: string;
}

/** The clinic's display identity from its Settings (cached per instance) and tenant record. */
export const getClinicIdentity = cache(async (tenant: TenantData): Promise<ClinicIdentity> => {
  const settings = await getSettings(tenant._id);
  // The clinic's own name from Settings wins, unless it's still the schema default.
  const settingsName = typeof settings?.clinicName === 'string' ? settings.clinicName.trim() : '';
  return {
    name: settingsName && settingsName !== 'MyClinicSoft' ? settingsName : tenant.displayName || tenant.name,
    logo: tenant.settings?.logo || undefined,
    address: settings?.clinicAddress?.trim() || undefined,
    phone: settings?.clinicPhone?.trim() || undefined,
    email: settings?.clinicEmail?.trim() || undefined,
  };
});

export const getClinicWebsite = cache(async (tenant: TenantData): Promise<ClinicWebsiteData> => {
  await connectDB();
  const tenantId = new Types.ObjectId(tenant._id);

  const [settings, identity, doctors, services] = await Promise.all([
    getSettings(tenant._id),
    getClinicIdentity(tenant),
    Doctor.find({ tenantId, status: 'active' })
      .select('firstName lastName title bio qualifications specializationId schedule')
      .populate('specializationId', 'name')
      .sort({ lastName: 1, firstName: 1 })
      .limit(MAX_DOCTORS)
      .lean<Record<string, any>[]>(),
    Service.find({ tenantId, active: true })
      .select('name description category unitPrice unit')
      .sort({ category: 1, name: 1 })
      .limit(MAX_SERVICES)
      .lean<Record<string, any>[]>(),
  ]);

  const stored = (settings?.businessHours ?? []) as { day: Weekday; open?: string; close?: string; closed?: boolean }[];
  const hours = WEEKDAYS.map((day) => {
    const h = stored.find((x) => x.day === day);
    const closed = !h || h.closed === true;
    return {
      day,
      label: WEEKDAY_LABEL[day],
      closed,
      text: closed ? 'Closed' : `${clock12(h.open || '09:00')} – ${clock12(h.close || '17:00')}`,
    };
  });

  const hoursSummary: ClinicWebsiteData['hoursSummary'] = [];
  for (let i = 0; i < hours.length; ) {
    let j = i;
    while (j + 1 < hours.length && hours[j + 1].text === hours[i].text) j++;
    const first = hours[i].label.slice(0, 3);
    const last = hours[j].label.slice(0, 3);
    hoursSummary.push({ days: i === j ? first : `${first} – ${last}`, text: hours[i].text });
    i = j + 1;
  }

  const grouped = new Map<string, ClinicWebsiteData['services'][number]['items']>();
  for (const s of services) {
    const key = CATEGORY_LABEL[s.category] ? s.category : 'other';
    grouped.set(key, [
      ...(grouped.get(key) ?? []),
      {
        id: String(s._id),
        name: s.name,
        description: s.description || undefined,
        price: Number(s.unitPrice) || 0,
        unit: s.unit || undefined,
      },
    ]);
  }

  return {
    ...identity,
    hours,
    hoursSummary,
    doctors: doctors.map((d) => {
      const available = new Set<number>(
        (d.schedule ?? []).filter((s: any) => s?.isAvailable !== false).map((s: any) => Number(s.dayOfWeek))
      );
      return {
        id: String(d._id),
        name: [d.title || 'Dr.', d.firstName, d.lastName].filter(Boolean).join(' '),
        specialization: d.specializationId?.name || undefined,
        bio: typeof d.bio === 'string' && d.bio.trim() ? d.bio.trim() : undefined,
        qualifications: Array.isArray(d.qualifications) ? d.qualifications.filter(Boolean).slice(0, 4) : [],
        days: DAY_ORDER.filter((n) => available.has(n)).map((n) => DAY_SHORT[n]),
      };
    }),
    services: CATEGORY_ORDER.filter((c) => grouped.has(c)).map((c) => ({
      category: CATEGORY_LABEL[c],
      items: grouped.get(c)!,
    })),
    currency: String(settings?.billingSettings?.currency || tenant.settings?.currency || 'PHP').toUpperCase(),
  };
});

/**
 * Absolute address of a page on the clinic subdomain serving this request. Metadata needs it:
 * the root layout's metadataBase would resolve a relative canonical to the main site.
 */
export async function clinicPageUrl(path: string): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  if (!host) return path;
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}${path}`;
}
