import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { consultBlocker } from '@/lib/queue-order';

const DR_A = new Types.ObjectId();
const DR_B = new Types.ObjectId();
const inConsult = (doctor?: unknown) => ({ _id: new Types.ObjectId(), doctor, patientName: 'Ana Cruz', queueNumber: 'W20261105-003' });

describe('consultBlocker', () => {
  it('lets a patient in when their doctor is free', () => {
    expect(consultBlocker({ _id: 'x', doctor: DR_A }, [], 2)).toBeNull();
  });

  it('blocks a second patient for the same doctor and names who is in consult', () => {
    expect(consultBlocker({ _id: 'x', doctor: DR_A }, [inConsult(DR_A)], 2)).toContain('Ana Cruz (W-003)');
  });

  it('matches a populated doctor (the page) against a bare id (the server)', () => {
    const populated = { _id: String(DR_A), firstName: 'A', lastName: 'B' };
    expect(consultBlocker({ _id: 'x', doctor: populated }, [inConsult(DR_A)], 2)).not.toBeNull();
    expect(consultBlocker({ _id: 'x', doctor: DR_A }, [inConsult(populated)], 2)).not.toBeNull();
  });

  it('lets two doctors consult at the same time', () => {
    expect(consultBlocker({ _id: 'x', doctor: DR_B }, [inConsult(DR_A)], 2)).toBeNull();
  });

  it('does not count the entry against itself', () => {
    const self = inConsult(DR_A);
    expect(consultBlocker({ _id: self._id, doctor: DR_A }, [self], 1)).toBeNull();
  });

  it('holds a one-doctor clinic to one consult, assigned or not', () => {
    expect(consultBlocker({ _id: 'x' }, [inConsult(DR_A)], 1)).toContain('No doctor is free');
    expect(consultBlocker({ _id: 'x', doctor: DR_A }, [inConsult()], 1)).toContain('No doctor is free');
    expect(consultBlocker({ _id: 'x' }, [inConsult()], 1)).toContain('Ana Cruz (W-003)');
  });

  it('keeps unassigned patients to one line, however many doctors are free', () => {
    const reason = consultBlocker({ _id: 'x' }, [inConsult()], 2);
    expect(reason).toContain('Ana Cruz (W-003) is still in consult.');
  });

  it('lets a doctor call their own patient while an unassigned patient is in consult', () => {
    expect(consultBlocker({ _id: 'x', doctor: DR_B }, [inConsult()], 2)).toBeNull();
  });

  it('lets an unassigned patient in while only a doctor line is busy, until every doctor is taken', () => {
    expect(consultBlocker({ _id: 'x' }, [inConsult(DR_A)], 2)).toBeNull();
    expect(consultBlocker({ _id: 'x' }, [inConsult(DR_A), inConsult(DR_B)], 2)).toContain('No doctor is free');
  });

  it('treats a clinic with no doctor records as one line', () => {
    expect(consultBlocker({ _id: 'x' }, [], 0)).toBeNull();
    expect(consultBlocker({ _id: 'x' }, [inConsult()], 0)).not.toBeNull();
  });
});
