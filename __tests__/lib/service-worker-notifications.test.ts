import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

const source = readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');
const ORIGIN = 'https://app.test';

function appWindow(url: string, { controlled = true } = {}) {
  const client: any = {
    url,
    focus: vi.fn(async () => client),
    navigate: vi.fn(async () => {
      if (!controlled) throw new TypeError('not controlled');
      return client;
    }),
  };
  return client;
}

function loadWorker(windows: unknown[] = []) {
  const handlers: Record<string, (event: any) => void> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (name: string, handler: (event: any) => void) => {
      handlers[name] = handler;
    },
    clients: { matchAll: vi.fn().mockResolvedValue(windows), openWindow: vi.fn().mockResolvedValue(null) },
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
  };
  vm.runInNewContext(source, { self, URL });
  return { self, handlers };
}

async function click(handlers: Record<string, (event: any) => void>, url?: string) {
  let work: Promise<unknown> = Promise.resolve();
  handlers.notificationclick({
    notification: { close: vi.fn(), data: { url } },
    waitUntil: (promise: Promise<unknown>) => {
      work = promise;
    },
  });
  await work;
}

describe('notification click', () => {
  it('focuses a window already on the page', async () => {
    const open = appWindow(`${ORIGIN}/messages?c=1`);
    const { self, handlers } = loadWorker([open]);
    await click(handlers, '/messages?c=1');
    expect(open.focus).toHaveBeenCalled();
    expect(open.navigate).not.toHaveBeenCalled();
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it('moves an open window to the page instead of opening another', async () => {
    const open = appWindow(`${ORIGIN}/queue`);
    const { self, handlers } = loadWorker([open]);
    await click(handlers, '/messages?c=1');
    expect(open.navigate).toHaveBeenCalledWith(`${ORIGIN}/messages?c=1`);
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it('does not mistake a longer path for the target', async () => {
    const open = appWindow(`${ORIGIN}/notifications/settings`);
    const { handlers } = loadWorker([open]);
    await click(handlers, '/notifications');
    expect(open.navigate).toHaveBeenCalledWith(`${ORIGIN}/notifications`);
  });

  it('opens a window when none is open', async () => {
    const { self, handlers } = loadWorker([]);
    await click(handlers, '/queue');
    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/queue`);
  });

  it('opens a window when the open one cannot be moved', async () => {
    const open = appWindow(`${ORIGIN}/queue`, { controlled: false });
    const { self, handlers } = loadWorker([open]);
    await click(handlers, '/messages');
    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/messages`);
  });

  it('leaves windows of other sites alone', async () => {
    const other = appWindow('https://elsewhere.test/queue');
    const { self, handlers } = loadWorker([other]);
    await click(handlers, '/queue');
    expect(other.focus).not.toHaveBeenCalled();
    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/queue`);
  });

  it.each(['https://evil.test/phish', '//evil.test/phish', 'javascript:alert(1)'])(
    'never leaves the app for %s',
    async (url) => {
      const { self, handlers } = loadWorker([]);
      await click(handlers, url);
      expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/dashboard`);
    }
  );

  it('falls back to the dashboard without a url', async () => {
    const { self, handlers } = loadWorker([]);
    await click(handlers);
    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/dashboard`);
  });
});

describe('push display', () => {
  const show = (payload: Record<string, unknown>) => {
    const { self, handlers } = loadWorker();
    handlers.push({ data: { json: () => payload }, waitUntil: vi.fn() });
    return self.registration.showNotification.mock.calls[0][1];
  };

  it('keeps an urgent alert on screen', () => {
    expect(show({ title: 't', priority: 'urgent' }).requireInteraction).toBe(true);
  });

  it('lets other alerts time out', () => {
    expect(show({ title: 't', priority: 'high' }).requireInteraction).toBe(false);
    expect(show({ title: 't' }).requireInteraction).toBe(false);
  });
});
