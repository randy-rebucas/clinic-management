import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn(), recentlyLogged: vi.fn(async () => false) }));

const { periodWords, reportWords, logReportOpened, logReportDownloaded } = await import('@/app/api/reports/_lib/report-audit');
const { createAuditLog, recentlyLogged } = await import('@/lib/audit');

const TZ = 'Asia/Manila';
// Clinic-local midnight and end of day, as the report routes resolve them.
const start = (day: string) => new Date(`${day}T00:00:00+08:00`);
const end = (day: string) => new Date(`${day}T23:59:59.999+08:00`);

describe('periodWords', () => {
  it('reads a month in the clinic’s timezone, not UTC', () => {
    expect(periodWords(start('2026-10-01'), end('2026-10-31'), TZ)).toBe('Oct 1–31, 2026');
  });

  it('names both months when a week crosses one', () => {
    expect(periodWords(start('2026-09-27'), end('2026-10-03'), TZ)).toBe('Sep 27 – Oct 3, 2026');
  });

  it('names both years when the period crosses one', () => {
    expect(periodWords(start('2025-12-28'), end('2026-01-03'), TZ)).toBe('Dec 28, 2025 – Jan 3, 2026');
  });

  it('reads a single day as one date', () => {
    expect(periodWords(start('2026-10-30'), end('2026-10-30'), TZ)).toBe('Oct 30, 2026');
  });
});

describe('reportWords', () => {
  it('gives a ranged report its period', () => {
    expect(reportWords('income', { start: start('2026-10-01'), end: end('2026-10-31') }, TZ)).toBe('the Income report for Oct 1–31, 2026');
  });

  it('leaves the period off a report that describes now', () => {
    expect(reportWords('hmo-claims', { start: start('2026-10-01'), end: end('2026-10-31') }, TZ)).toBe('the HMO claims report');
  });
});

const who = { session: { userId: '507f1f77bcf86cd799439011', email: 'a@clinic.ph', role: 'admin' } as any, tenantId: '507f1f77bcf86cd799439012' };
const request = { headers: new Headers({ 'user-agent': 'test' }), method: 'GET', nextUrl: { pathname: '/api/reports/bir' } };

describe('logging', () => {
  it('marks a report that names patients as sensitive, with its period as clinic days', async () => {
    await logReportOpened(who, request, 'bir', { start: start('2026-10-01'), end: end('2026-10-31') }, TZ);
    expect(createAuditLog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'view',
        resource: 'report',
        isSensitive: true,
        metadata: { report: 'bir', from: '2026-10-01', to: '2026-10-31' },
        description: 'Opened the BIR books report for Oct 1–31, 2026',
      })
    );
  });

  it('logs a report opened again within minutes once', async () => {
    vi.mocked(createAuditLog).mockClear();
    vi.mocked(recentlyLogged).mockResolvedValueOnce(true);
    await logReportOpened(who, request, 'income', { start: start('2026-10-01'), end: end('2026-10-31') }, TZ);
    expect(createAuditLog).not.toHaveBeenCalled();
    expect(recentlyLogged).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'view', resource: 'report', 'metadata.report': 'income', 'metadata.from': '2026-10-01', 'metadata.to': '2026-10-31' }),
      5
    );
  });

  it('logs a download of a totals-only report as not sensitive', async () => {
    await logReportDownloaded(who, { ...request, method: 'POST' }, 'income', { start: start('2026-10-01').toISOString(), end: end('2026-10-31').toISOString() }, TZ);
    expect(createAuditLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'download', isSensitive: false, description: 'Downloaded the Income report for Oct 1–31, 2026 as CSV' })
    );
  });
});
