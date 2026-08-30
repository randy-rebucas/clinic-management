/**
 * Computes a parent-before-child ordering of every Prisma model, used by the
 * Postgres-native backup/restore routes (app/api/backups/route.ts,
 * app/api/backups/[id]/restore/route.ts) to satisfy foreign-key constraints:
 *
 * - Backup dump order doesn't actually matter (findMany is read-only), but
 *   using the same canonical order keeps the stored `BackupRecord.data` blob
 *   human-inspectable in a stable, dependency-sensible sequence.
 * - Restore matters a lot: `createMany` on a child table fails if the parent
 *   row referenced by its FK doesn't exist yet, so parents must be
 *   (re)inserted before children. Deletion must happen in the reverse order
 *   (children before parents) for the same reason.
 *
 * How the graph is built: Prisma's exposed `Prisma.dmmf.datamodel.models`
 * does not carry `relationFromFields` in this generated client (it comes
 * back `undefined`), so we can't read "which side holds the FK" directly
 * from the DMMF. Instead we rely on this schema's consistent naming
 * convention (verified across prisma/schema.prisma): a non-list relation
 * field named `foo` whose model also declares a scalar field `fooId` is the
 * side that owns the foreign key, and therefore depends on the related
 * model. This covers every relation in the schema; the one case it can't
 * distinguish (a genuine FK cycle between two models) doesn't occur here.
 */
import { Prisma } from '@prisma/client';

/** Model names to exclude entirely from backup/restore. */
const EXCLUDED_MODELS = new Set([
  // BackupRecord holds the backups themselves — dumping/restoring it would
  // be self-referential (a backup containing itself) and restoring it would
  // wipe backup history mid-restore.
  'BackupRecord',
]);

let cached: string[] | null = null;

/**
 * Returns every backup-eligible Prisma model name, topologically sorted so
 * that parents always precede the children whose rows FK-reference them.
 */
export function getOrderedModelNames(): string[] {
  if (cached) return cached;

  const models = Prisma.dmmf.datamodel.models.filter((m) => !EXCLUDED_MODELS.has(m.name));
  const names = new Set(models.map((m) => m.name));

  // dependsOn[model] = set of other model names that must be inserted first.
  const dependsOn = new Map<string, Set<string>>();
  for (const m of models) dependsOn.set(m.name, new Set());

  for (const m of models) {
    const scalarFieldNames = new Set(
      m.fields.filter((f) => f.kind === 'scalar').map((f) => f.name)
    );
    for (const f of m.fields) {
      if (f.kind !== 'object' || !f.relationName || f.isList) continue;
      if (!names.has(f.type)) continue; // relation to an excluded/unknown model
      if (f.type === m.name) continue; // self-relation — ignore, no known cycles otherwise
      if (scalarFieldNames.has(`${f.name}Id`)) {
        dependsOn.get(m.name)!.add(f.type);
      }
    }
  }

  // Kahn's algorithm.
  const remaining = new Set(names);
  const ordered: string[] = [];
  const indegree = new Map<string, number>();
  for (const n of remaining) indegree.set(n, dependsOn.get(n)!.size);

  while (remaining.size > 0) {
    const ready = [...remaining].filter((n) => indegree.get(n) === 0).sort();
    if (ready.length === 0) {
      // Unexpected cycle — fall back to original DMMF declaration order for
      // whatever's left rather than looping forever.
      ordered.push(...[...remaining].sort());
      break;
    }
    for (const n of ready) {
      ordered.push(n);
      remaining.delete(n);
      indegree.delete(n);
    }
    for (const n of remaining) {
      let count = 0;
      for (const dep of dependsOn.get(n)!) {
        if (remaining.has(dep)) count++;
      }
      indegree.set(n, count);
    }
  }

  cached = ordered;
  return ordered;
}
