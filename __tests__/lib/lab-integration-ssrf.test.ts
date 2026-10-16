import { describe, it, expect, vi, beforeEach } from 'vitest';
import https from 'https';

vi.mock('server-only', () => ({}));

const lookupMock = vi.fn();
vi.mock('dns/promises', () => ({ lookup: (...args: any[]) => lookupMock(...args) }));

import {
  isPrivateAddress,
  createPinnedLookup,
  checkOutboundUrl,
  sendLabRequestToThirdParty,
} from '@/lib/lab-integration';

describe('isPrivateAddress (IPv4)', () => {
  it.each([
    '0.0.0.0', '10.0.0.1', '10.255.255.255', '100.64.0.1', '100.127.255.255', '127.0.0.1', '127.1.2.3',
    '169.254.169.254', '169.254.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '192.0.0.8',
    '192.0.2.1', '198.18.0.1', '198.19.255.255', '198.51.100.7', '203.0.113.9', '224.0.0.1',
    '239.255.255.250', '240.0.0.1', '255.255.255.255',
  ])('blocks %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '100.63.255.255', '100.128.0.0', '172.15.255.255', '172.32.0.0', '169.253.255.255', '223.255.255.255'])(
    'allows %s',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  );
});

describe('isPrivateAddress (IPv6)', () => {
  it.each([
    '::', '::1', '0:0:0:0:0:0:0:1', 'fc00::1', 'fd00:ec2::254', 'fdff:ffff::1', 'fe80::1', 'fe80::1%eth0',
    'febf::1', 'fec0::1', 'ff02::1', '64:ff9b::a00:1', '64:ff9b:1::1', '100::1', '2002:c0a8:101::1',
    '2001::1', '2001:db8::1', '::127.0.0.1',
  ])('blocks %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each([
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::FFFF:169.254.169.254', '0:0:0:0:0:ffff:a9fe:a9fe',
    '0000:0000:0000:0000:0000:ffff:10.0.0.1', '::ffff:0:192.168.0.1', '::ffff:100.64.0.1',
  ])('blocks IPv4-mapped private %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8', '::ffff:808:808'])('allows %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it('treats garbage as private', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
    expect(isPrivateAddress('')).toBe(true);
    expect(isPrivateAddress('1::2::3')).toBe(true);
  });
});

describe('createPinnedLookup', () => {
  const run = (resolved: { address: string; family: number }[], options: any) =>
    new Promise<{ err: any; address: any; family?: number }>((resolve) => {
      const lookup = createPinnedLookup(async () => resolved);
      lookup('lab.example.com', options, (err, address, family) => resolve({ err, address, family }));
    });

  it('rejects a private result', async () => {
    const { err } = await run([{ address: '127.0.0.1', family: 4 }], {});
    expect(err?.code).toBe('EBLOCKEDADDRESS');
  });

  it('rejects when any of several results is private', async () => {
    const { err } = await run([{ address: '93.184.216.34', family: 4 }, { address: 'fd00:ec2::254', family: 6 }], { all: true });
    expect(err?.code).toBe('EBLOCKEDADDRESS');
  });

  it('rejects an IPv4-mapped metadata address', async () => {
    const { err } = await run([{ address: '::ffff:169.254.169.254', family: 6 }], {});
    expect(err?.code).toBe('EBLOCKEDADDRESS');
  });

  it('passes public results through in both callback shapes', async () => {
    const single = await run([{ address: '93.184.216.34', family: 4 }], {});
    expect(single.err).toBeNull();
    expect(single.address).toBe('93.184.216.34');
    expect(single.family).toBe(4);

    const all = await run([{ address: '93.184.216.34', family: 4 }], { all: true });
    expect(all.err).toBeNull();
    expect(all.address).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('is honoured by https.request, so no socket is opened to a private address', async () => {
    const err: any = await new Promise((resolve) => {
      const req = https.request('https://rebind.example/', {
        method: 'POST',
        lookup: createPinnedLookup(async () => [{ address: '127.0.0.1', family: 4 }]) as any,
      });
      req.on('error', resolve);
      req.on('response', () => resolve(null));
      req.end();
    });
    expect(err?.code).toBe('EBLOCKEDADDRESS');
  });
});

describe('DNS rebinding on lab send', () => {
  beforeEach(() => {
    lookupMock.mockReset();
    delete process.env.LAB_API_ALLOWED_HOSTS;
  });

  it('fails when the second resolution returns a private address', async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendLabRequestToThirdParty(
      { labName: 'Lab', integrationType: 'api', apiEndpoint: 'https://rebind.example/orders', apiKey: 'k' },
      {
        requestCode: 'LR-1',
        patient: { firstName: 'A', lastName: 'B', dateOfBirth: '2000-01-01' },
        testType: 'cbc',
        urgency: 'routine',
      }
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to send request to lab');
    expect(lookupMock).toHaveBeenCalledTimes(2);
    expect(errSpy.mock.calls[0][1]?.code).toBe('EBLOCKEDADDRESS');
    errSpy.mockRestore();
  });

  it('checkOutboundUrl keeps the allowlist and scheme rules', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    expect(await checkOutboundUrl('http://lab.example.com')).toMatch(/https/);
    expect(await checkOutboundUrl('https://u:p@lab.example.com')).toMatch(/credentials/);
    expect(await checkOutboundUrl('https://lab.example.com:8443')).toMatch(/port/);
    expect(await checkOutboundUrl('https://[::ffff:127.0.0.1]/')).toMatch(/public/);
    process.env.LAB_API_ALLOWED_HOSTS = 'other.example.com';
    expect(await checkOutboundUrl('https://lab.example.com')).toMatch(/not allowed/);
    process.env.LAB_API_ALLOWED_HOSTS = 'lab.example.com';
    expect(await checkOutboundUrl('https://lab.example.com')).toBeNull();
  });
});
