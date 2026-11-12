import type { BookingPlan, RepState } from '@/lib/platform-reps';
import { REP_STATE_LABEL } from '@/lib/platform-reps';
import { day } from './shared';

const STATE_TONE: Record<RepState, string> = {
  active: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  awaiting: 'bg-amber-50 text-amber-800 ring-amber-200',
  inactive: 'bg-gray-100 text-gray-700 ring-gray-200',
  'on-leave': 'bg-sky-50 text-sky-800 ring-sky-200',
};

export function RepStateBadge({ state }: { state: RepState }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATE_TONE[state]}`}>
      {REP_STATE_LABEL[state]}
    </span>
  );
}

/** "Own plan until Dec 12, 2026", "Team Unilab Cebu until …", "Free", or "None". */
export function PlanText({ plan }: { plan: BookingPlan }) {
  switch (plan.kind) {
    case 'free':
      return <>Free for all reps</>;
    case 'own':
      return <>Own plan · until {day(plan.until)}</>;
    case 'team':
      return <>Team {plan.team} · until {day(plan.until)}</>;
    default:
      return <span className="text-gray-500">{plan.endedOn ? `Ended ${day(plan.endedOn)}` : 'None'}</span>;
  }
}
