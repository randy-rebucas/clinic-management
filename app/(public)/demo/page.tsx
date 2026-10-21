import { permanentRedirect } from 'next/navigation';

// Demos aren't offered — the 14-day free trial replaces them. Kept as a redirect so old links still land.
export default function DemoPage() {
  permanentRedirect('/tenant-onboard');
}
