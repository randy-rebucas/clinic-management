import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { getConfiguredLab, labErrorMessage, listConfiguredLabs } from '@/lib/lab-integration';

const TENANT = '697b02f0e4c1ce12546a5556';
const OTHER = '697b02f0e4c1ce12546a0000';

const entries = [
  { labCode: 'SLIMMLAB', labName: 'SLIMM Laboratory Inc', apiEndpoint: 'https://lab.example/v1/orders', apiKey: 'lpk_x', webhookSecret: 'whsec_x', tenantIds: [TENANT] },
  { labCode: 'ACME', labName: 'Acme Diagnostics', apiEndpoint: 'https://acme.example/v1/orders', apiKey: 'k' },
  { labCode: 'NOKEY', labName: 'No key yet', apiEndpoint: 'https://nokey.example/v1/orders' },
];

describe('partner labs for a clinic', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lists the labs open to the clinic, by name, without endpoints or keys', () => {
    vi.stubEnv('LAB_INTEGRATIONS', JSON.stringify(entries));
    const labs = listConfiguredLabs(TENANT);
    expect(labs).toEqual([
      { labCode: 'ACME', labName: 'Acme Diagnostics' },
      { labCode: 'SLIMMLAB', labName: 'SLIMM Laboratory Inc' },
    ]);
    expect(JSON.stringify(labs)).not.toMatch(/apiKey|lpk_|whsec_|https:/);
  });

  it('leaves out a lab limited to other clinics', () => {
    vi.stubEnv('LAB_INTEGRATIONS', JSON.stringify(entries));
    expect(listConfiguredLabs(OTHER).map((l) => l.labCode)).toEqual(['ACME']);
    expect(getConfiguredLab('SLIMMLAB', OTHER)).toBeNull();
  });

  it('is empty when the setting is missing or not JSON', () => {
    vi.stubEnv('LAB_INTEGRATIONS', '');
    expect(listConfiguredLabs(TENANT)).toEqual([]);
    vi.stubEnv('LAB_INTEGRATIONS', '{not json');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(listConfiguredLabs(TENANT)).toEqual([]);
  });
});

describe('lab refusal messages', () => {
  it("shows the lab's own message", () => {
    expect(labErrorMessage(422, JSON.stringify({ error: { code: 'UNKNOWN_TEST', message: 'This lab does not offer "Lipid profile".' } }))).toBe(
      'The lab said: This lab does not offer "Lipid profile".'
    );
  });

  it('falls back to plain words per status', () => {
    expect(labErrorMessage(401, '')).toMatch(/connection key/);
    expect(labErrorMessage(429, 'oops')).toMatch(/too many orders/);
    expect(labErrorMessage(503, undefined)).toMatch(/had a problem/);
    expect(labErrorMessage(409, '{}')).toBe('The lab refused the order (HTTP 409).');
  });

  it('cuts a long message to 200 characters', () => {
    const msg = labErrorMessage(400, JSON.stringify({ error: { message: 'x'.repeat(500) } }));
    expect(msg.length).toBe('The lab said: '.length + 200);
  });
});
