/** Dispensing arithmetic shared by the dispense API and the prescriptions list. Pure; safe on the client. */

export type DispenseItem = { medicationIndex: number; quantity: number };

/** Spread a lump quantity over medications in order, filling each one's remaining amount. */
export function distribute(total: number, prescribed: number[], already: number[]): DispenseItem[] {
  const items: DispenseItem[] = [];
  let left = total;
  for (let i = 0; i < prescribed.length && left > 0; i++) {
    const remaining = Math.max(0, prescribed[i] - already[i]);
    const take = Math.min(left, remaining);
    if (take > 0) {
      items.push({ medicationIndex: i, quantity: take });
      left -= take;
    }
  }
  return items;
}

/** Quantity already dispensed per medication, including legacy records without a breakdown. */
export function dispensedPerMedication(
  prescribed: number[],
  records: { items?: DispenseItem[] | null; quantityDispensed?: number | null }[] | null | undefined
): number[] {
  const done = prescribed.map(() => 0);
  for (const r of records || []) {
    const items: DispenseItem[] = Array.isArray(r.items) && r.items.length ? r.items : distribute(r.quantityDispensed || 0, prescribed, done);
    for (const it of items) {
      if (it.medicationIndex >= 0 && it.medicationIndex < done.length) done[it.medicationIndex] += it.quantity || 0;
    }
  }
  return done;
}

/** How many medicines on a prescription are fully dispensed (a medicine without a quantity counts once anything was given). */
export function medicinesDispensed(
  medications: { quantity?: number | null }[],
  records: { items?: DispenseItem[] | null; quantityDispensed?: number | null }[] | null | undefined
) {
  const prescribed = medications.map((m) => Math.max(0, Number(m.quantity) || 0));
  const given = dispensedPerMedication(prescribed, records);
  const done = prescribed.filter((q, i) => (q > 0 ? given[i] >= q : given[i] > 0)).length;
  return { done, total: medications.length };
}
