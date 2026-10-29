'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS = [
  { label: 'Overview', href: '/platform' },
  { label: 'Clinics', href: '/platform/clinics' },
  { label: 'Support', href: '/platform/support' },
  { label: 'Chat', href: '/platform/chat' },
  { label: 'eMCR vouchers', href: '/platform/vouchers' },
  { label: 'Notify', href: '/platform/notifications' },
  { label: 'Configuration', href: '/platform/configuration' },
];

/** `waiting`: support requests awaiting a reply. `chatWaiting`: support chats with unread messages. */
export default function PlatformNav({ waiting, chatWaiting }: { waiting: number; chatWaiting: number }) {
  const pathname = usePathname();
  return (
    <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {SECTIONS.map((s) => {
        const active = s.href === '/platform' ? pathname === s.href : pathname.startsWith(s.href);
        const count = s.href === '/platform/support' ? waiting : s.href === '/platform/chat' ? chatWaiting : 0;
        return (
          <li key={s.href} className="shrink-0">
            <Link
              href={s.href}
              aria-current={active ? 'page' : undefined}
              className={`relative inline-flex h-11 items-center gap-2 px-3 text-sm whitespace-nowrap rounded-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${
                active ? 'font-semibold text-white' : 'font-medium text-slate-300 hover:text-white'
              }`}
            >
              {s.label}
              {count > 0 && (
                <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold leading-4 text-brand-navy" aria-label={`${count} waiting`}>
                  {count}
                </span>
              )}
              {active && <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-teal" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
