import { describe, it, expect, afterEach, vi } from 'vitest';
import { clinicHostRedirect } from '@/lib/subdomain';

afterEach(() => vi.unstubAllEnvs());

describe('clinicHostRedirect: staff pages live on their clinic subdomain', () => {
  it('sends the main site (www and bare root) to the clinic subdomain, keeping path and query', () => {
    vi.stubEnv('ROOT_DOMAIN', 'myclinicsoft.solutions');
    expect(clinicHostRedirect('www.myclinicsoft.solutions', 'https', 'my-clinic', '/dashboard?x=1'))
      .toBe('https://my-clinic.myclinicsoft.solutions/dashboard?x=1');
    expect(clinicHostRedirect('myclinicsoft.solutions', 'https', 'my-clinic', '/patients/123'))
      .toBe('https://my-clinic.myclinicsoft.solutions/patients/123');
  });

  it("sends another clinic's subdomain to the session's clinic", () => {
    vi.stubEnv('ROOT_DOMAIN', 'myclinicsoft.solutions');
    expect(clinicHostRedirect('other.myclinicsoft.solutions', 'https', 'my-clinic', '/dashboard'))
      .toBe('https://my-clinic.myclinicsoft.solutions/dashboard');
  });

  it('leaves the right host alone, so a suspended clinic cannot loop', () => {
    vi.stubEnv('ROOT_DOMAIN', 'myclinicsoft.solutions');
    expect(clinicHostRedirect('My-Clinic.myclinicsoft.solutions', 'https', 'my-clinic', '/dashboard')).toBeNull();
  });

  it('works on local dev hosts without ROOT_DOMAIN', () => {
    vi.stubEnv('ROOT_DOMAIN', '');
    expect(clinicHostRedirect('localhost:3000', 'http', 'my-clinic', '/dashboard'))
      .toBe('http://my-clinic.localhost:3000/dashboard');
    expect(clinicHostRedirect('other.localhost:3000', 'http', 'my-clinic', '/queue'))
      .toBe('http://my-clinic.localhost:3000/queue');
    expect(clinicHostRedirect('my-clinic.localhost:3000', 'http', 'my-clinic', '/dashboard')).toBeNull();
  });

  it('never redirects Vercel previews to production', () => {
    vi.stubEnv('ROOT_DOMAIN', 'myclinicsoft.solutions');
    expect(clinicHostRedirect('app-git-branch.vercel.app', 'https', 'my-clinic', '/dashboard')).toBeNull();
  });

  it('never points off-site, whatever the path says', () => {
    vi.stubEnv('ROOT_DOMAIN', 'myclinicsoft.solutions');
    for (const path of ['//evil.example/x', '/\\evil.example', 'https://evil.example', '']) {
      expect(clinicHostRedirect('www.myclinicsoft.solutions', 'https', 'my-clinic', path))
        .toBe('https://my-clinic.myclinicsoft.solutions/dashboard');
    }
  });
});
