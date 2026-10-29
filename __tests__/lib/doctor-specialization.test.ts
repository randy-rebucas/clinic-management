import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pediatrics ← "PEDS" ← "LINK": the chain an older form left behind.
const PEDS = '697b0c0ffc7c2a43b8877e9f';
const LINK = '698d67ef55f15dfaf4349f4f';
const TOP = '698d6ba355f15dfaf434a038';
const DEAD = '698d6ba355f15dfaf434ffff';
const SPECS = [
  { _id: PEDS, name: 'Pediatrics' },
  { _id: LINK, name: PEDS },
  { _id: TOP, name: LINK },
];

const create = vi.fn(async (doc: { name: string }) => ({ _id: 'new-id', ...doc }));
vi.mock('@/models/Specialization', () => ({
  default: {
    findOne: vi.fn(async ({ name }: { name: string }) => SPECS.find((s) => s.name === name) ?? null),
    findById: vi.fn(async (id: string) => SPECS.find((s) => s._id === id) ?? null),
    create: (doc: { name: string }) => create(doc),
  },
}));

const { resolveSpecialization } = await import('@/app/api/doctors/_lib/doctor-input');

beforeEach(() => create.mockClear());

describe('resolveSpecialization', () => {
  it('finds a specialty by name', async () => {
    expect(await resolveSpecialization({ specialization: 'Pediatrics' })).toEqual({ specializationId: PEDS });
  });

  it('follows a name that is an id back to the real specialty', async () => {
    expect(await resolveSpecialization({ specialization: LINK })).toEqual({ specializationId: PEDS });
    expect(await resolveSpecialization({ specialization: TOP })).toEqual({ specializationId: PEDS });
    expect(create).not.toHaveBeenCalled();
  });

  it('never stores an id as a new specialty’s name', async () => {
    expect(await resolveSpecialization({ specialization: DEAD })).toEqual({ error: 'Choose the specialty from the list, or type its name' });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a specialty typed by name', async () => {
    expect(await resolveSpecialization({ specialization: 'Sports Medicine' })).toEqual({ specializationId: 'new-id' });
    expect(create).toHaveBeenCalledWith({ name: 'Sports Medicine', active: true, category: 'Specialty' });
  });
});
