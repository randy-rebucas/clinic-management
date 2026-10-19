import { requirePagePermission } from '@/app/lib/auth-helpers';
import TemplatesClient from '@/components/templates/TemplatesClient';

export const metadata = { title: 'Templates · My Clinic Software' };

export default async function TemplatesPage() {
  await requirePagePermission('visits', 'read');
  return <TemplatesClient />;
}
