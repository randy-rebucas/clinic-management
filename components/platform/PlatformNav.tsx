'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Building2,
  Gauge,
  LifeBuoy,
  LogOut,
  Menu,
  MessagesSquare,
  Settings,
  Ticket,
  UserRoundPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { platformLogout } from '@/app/actions/platform-auth';

type Item = { label: string; href: string; icon: LucideIcon; badge?: 'support' | 'chat' };

const GROUPS: { label?: string; items: Item[] }[] = [
  { items: [{ label: 'Overview', href: '/platform', icon: Gauge }] },
  {
    label: 'Customers',
    items: [
      { label: 'Clinics', href: '/platform/clinics', icon: Building2 },
      { label: 'Medical reps', href: '/platform/reps', icon: Users },
      { label: 'Rep referrals', href: '/platform/referral-codes', icon: UserRoundPlus },
      { label: 'eMCR vouchers', href: '/platform/vouchers', icon: Ticket },
    ],
  },
  {
    label: 'Engagement',
    items: [
      { label: 'Support', href: '/platform/support', icon: LifeBuoy, badge: 'support' },
      { label: 'Chat', href: '/platform/chat', icon: MessagesSquare, badge: 'chat' },
      { label: 'Notify', href: '/platform/notifications', icon: Bell },
    ],
  },
  { label: 'System', items: [{ label: 'Configuration', href: '/platform/configuration', icon: Settings }] },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);
const isActive = (href: string, pathname: string) =>
  href === '/platform' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

type Props = { waiting: number; chatWaiting: number; email: string };

/**
 * Admin shell navigation: a fixed sidebar from `lg` up, a top bar with a slide-in drawer below.
 * `waiting`: support requests awaiting a reply. `chatWaiting`: support chats with unread messages.
 */
export default function PlatformNav({ waiting, chatWaiting, email }: Props) {
  const pathname = usePathname();
  // The drawer remembers the path it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);

  // Escape closes it; the page behind doesn't scroll while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenOn(null);
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const counts = { support: waiting, chat: chatWaiting };
  const current = ALL_ITEMS.find((i) => isActive(i.href, pathname));

  const panel = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <BrandLogo size={28} />
        <span className="text-sm font-semibold text-white">MyClinicSoft</span>
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
          Platform
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal lg:hidden"
          aria-label="Close menu"
        >
          <X className="size-5" />
        </button>
      </div>

      <nav aria-label="Platform console" className="flex-1 overflow-y-auto px-3 py-2">
        {GROUPS.map((g, gi) => (
          <div key={g.label ?? gi} className={gi > 0 ? 'mt-6' : undefined}>
            {g.label && (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.label}</p>
            )}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = isActive(item.href, pathname);
                const count = item.badge ? counts[item.badge] : 0;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal ${
                        active
                          ? 'bg-white/10 font-semibold text-white'
                          : 'font-medium text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {active && (
                        <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand-teal" />
                      )}
                      <Icon
                        aria-hidden="true"
                        className={`size-[18px] shrink-0 ${active ? 'text-brand-teal' : 'text-slate-400 group-hover:text-slate-200'}`}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <span
                          className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold leading-[18px] tabular-nums text-brand-navy"
                          aria-label={`${count} waiting`}
                        >
                          {count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-teal/20 text-xs font-semibold uppercase text-brand-teal"
          >
            {email.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white" title={email}>{email}</p>
            <p className="text-[11px] text-slate-400">Platform admin</p>
          </div>
          <form action={platformLogout}>
            <button
              type="submit"
              className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 bg-brand-navy lg:block print:hidden">{panel}</aside>

      {/* Mobile: top bar + drawer */}
      <div className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 bg-brand-navy px-4 lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-ml-1.5 rounded-md p-1.5 text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="platform-drawer"
        >
          <Menu className="size-5" />
        </button>
        <BrandLogo size={24} />
        <span className="truncate text-sm font-semibold text-white">{current?.label ?? 'Platform'}</span>
        {waiting + chatWaiting > 0 && (
          <span className="ml-auto rounded-full bg-amber-400 px-1.5 text-[11px] font-bold leading-[18px] text-brand-navy" aria-label={`${waiting + chatWaiting} waiting`}>
            {waiting + chatWaiting}
          </span>
        )}
      </div>
      <div
        className={`no-print fixed inset-0 z-40 lg:hidden print:hidden ${open ? '' : 'pointer-events-none'}`}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-slate-900/50 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setOpen(false)}
        />
        <aside
          id="platform-drawer"
          inert={!open}
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-brand-navy shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {panel}
        </aside>
      </div>
    </>
  );
}
