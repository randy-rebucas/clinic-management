import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/EmcrAccount', () => ({ default: { findOne: vi.fn(), findById: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/lib/emcr/account', () => ({ forgetAccountCache: vi.fn() }));
vi.mock('@/lib/emcr/login-id', () => ({ ensureLoginId: vi.fn() }));

import { Types } from 'mongoose';
import EmcrAccount from '@/models/EmcrAccount';
import {
  authenticateAccountPassword,
  generateTempPassword,
  passwordProblem,
  setAccountPassword,
} from '@/lib/emcr/password';

const PHONE = '+639171234567';
const selectLean = (value: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) });

describe('eMCR account passwords', () => {
  beforeEach(() => vi.clearAllMocks());

  it('temporary passwords are 10 readable characters and long enough', () => {
    for (let i = 0; i < 20; i++) {
      const temp = generateTempPassword();
      expect(temp).toMatch(/^[a-hjkmnp-z2-9]{10}$/);
      expect(passwordProblem(temp)).toBeNull();
    }
  });

  it('rejects short passwords', () => {
    expect(passwordProblem('short')).toMatch(/at least 8/);
    expect(passwordProblem(undefined)).not.toBeNull();
  });

  it('a staff-set password must be changed; a user-set one need not', async () => {
    const id = new Types.ObjectId();
    await setAccountPassword(id, 'temp-pass-1', 'staff');
    expect((vi.mocked(EmcrAccount.updateOne).mock.calls[0] as any[])[1].$set).toMatchObject({ passwordSetBy: 'staff', mustChangePassword: true });
    await setAccountPassword(id, 'Mine-12345', 'user');
    expect((vi.mocked(EmcrAccount.updateOne).mock.calls[1] as any[])[1].$set).toMatchObject({ passwordSetBy: 'user', mustChangePassword: false });
  });

  it('signs in with the right password and hides the hash', async () => {
    const hash = await bcrypt.hash('Correct-123', 4);
    vi.mocked(EmcrAccount.findOne).mockReturnValue(selectLean({ _id: new Types.ObjectId(), phone: PHONE, password: hash }) as any);
    const account = await authenticateAccountPassword({ phone: PHONE }, 'Correct-123');
    expect(account).toMatchObject({ phone: PHONE });
    expect(account).not.toHaveProperty('password');
  });

  it('refuses a wrong password, a number without a password, and a disabled account', async () => {
    const hash = await bcrypt.hash('Correct-123', 4);
    vi.mocked(EmcrAccount.findOne).mockReturnValueOnce(selectLean({ _id: new Types.ObjectId(), password: hash }) as any);
    expect(await authenticateAccountPassword({ phone: PHONE }, 'Wrong-123')).toBeNull();
    vi.mocked(EmcrAccount.findOne).mockReturnValueOnce(selectLean({ _id: new Types.ObjectId() }) as any);
    expect(await authenticateAccountPassword({ phone: PHONE }, 'Correct-123')).toBeNull();
    vi.mocked(EmcrAccount.findOne).mockReturnValueOnce(selectLean({ _id: new Types.ObjectId(), password: hash, disabled: true }) as any);
    expect(await authenticateAccountPassword({ phone: PHONE }, 'Correct-123')).toBeNull();
  });
});
