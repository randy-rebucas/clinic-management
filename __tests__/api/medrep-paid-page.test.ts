import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('server-only', () => ({}));

import RepPaidPage from '@/app/(public)/medical-representatives/paid/page';

const render = async (query: Record<string, string>) =>
  renderToStaticMarkup(await RepPaidPage({ searchParams: Promise.resolve(query) }));

describe('/medical-representatives/paid (PayMongo return page)', () => {
  it('a rep or team subscription: back to eMedRoute, where the subscription shows', async () => {
    const html = await render({ status: 'paid' });
    expect(html).toContain('Go back to the eMedRoute app; your subscription shows there');
    expect(html).not.toContain('MyClinicSoft app');
  });

  it('a clinic sponsorship: the clinic’s plan, not the rep’s subscription', async () => {
    const html = await render({ status: 'paid', for: 'sponsorship' });
    expect(html).toContain('the clinic’s plan you sponsored shows as paid there');
    expect(html).not.toContain('your subscription');
    expect(html).toContain(encodeURIComponent('Clinic sponsorship'));
  });

  it('a cancelled payment names the app too', async () => {
    const html = await render({ status: 'cancelled', for: 'sponsorship' });
    expect(html).toContain('Nothing was charged. Go back to the eMedRoute app');
  });
});
