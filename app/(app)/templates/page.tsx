import { requirePagePermission } from '@/app/lib/auth-helpers';
import TemplatesClient from '@/components/templates/TemplatesClient';
import type { TemplateKind } from '@/lib/clinical-templates';

export const metadata = { title: 'Templates · My Clinic Software' };

const KINDS: TemplateKind[] = ['visit', 'prescription', 'phrase'];

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // Same rule as the sidebar and every template write: templates are for people who write notes.
  await requirePagePermission('visits', 'write');
  const { tab } = await searchParams;
  return <TemplatesClient initialKind={KINDS.find((k) => k === tab) ?? 'visit'} />;
}
