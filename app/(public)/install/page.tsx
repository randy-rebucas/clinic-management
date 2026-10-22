import type { Metadata } from 'next';
import InstallClient from '@/components/InstallClient';
import { NO_INDEX } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Install', robots: NO_INDEX };

/**
 * Setup wizard. Nothing about the server is rendered here: the client asks for the install
 * secret, then loads the checks from /api/install/check (which proxy.ts guards).
 */
export default function InstallPage() {
  return <InstallClient enabled={Boolean(process.env.INSTALL_SECRET)} />;
}
