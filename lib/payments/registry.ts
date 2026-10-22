import 'server-only';
import type { OnlineProvider } from '@/lib/payments/providers';
import type { GatewayAdapter } from './types';
import { paymongoAdapter } from './paymongo';
import { xenditAdapter } from './xendit';
import { mayaAdapter } from './maya';

/** The online providers a clinic can connect, by key. */
const ADAPTERS: Partial<Record<OnlineProvider, GatewayAdapter>> = {
  paymongo: paymongoAdapter,
  xendit: xenditAdapter,
  maya: mayaAdapter,
};

export function adapterFor(provider: string): GatewayAdapter | null {
  const a = ADAPTERS[provider as OnlineProvider];
  return a && a.available ? a : null;
}

export function availableOnlineProviders(): Array<{ provider: OnlineProvider; label: string; keyHint: string }> {
  return Object.values(ADAPTERS)
    .filter((a): a is GatewayAdapter => !!a && a.available)
    .map((a) => ({ provider: a.provider, label: a.label, keyHint: a.keyHint }));
}
