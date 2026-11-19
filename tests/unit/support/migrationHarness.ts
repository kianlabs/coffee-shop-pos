import { runMigrations, type Transaction } from "@/data/migration/runner";
import { createMigrationHooks, type LegacyInputs, type LegacyKey } from "@/data/migration/hooks";
import { LATEST_VERSION, MIGRATION_STEPS } from "@/data/migration/steps";
import { openSqlJsDb } from "@/testing/sqlJsDb";
export type Db = Awaited<ReturnType<typeof openSqlJsDb>>;
export const NOW = "2026-01-01T00:00:00.000Z";
export const NO_LEGACY: LegacyInputs = { settings: null, shift: null, cart: null, held: null };
export const txFor = (db: Db): Transaction => async (fn) => {
  await db.exec("BEGIN");
  try {
    const result = await fn(db);
    await db.exec("COMMIT");
    return result;
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
};
/** Runs the real step list up to `latest` (default: all) with the given legacy inputs. */
export async function migrate(
  db: Db,
  legacy: LegacyInputs = NO_LEGACY,
  latest = LATEST_VERSION,
  clear?: (key: LegacyKey) => void,
): Promise<number[]> {
  const { hooks, afterCommit } = createMigrationHooks({ legacy, now: () => NOW, clear });
  const result = await runMigrations({
    db, transaction: txFor(db), steps: MIGRATION_STEPS, latest, hooks, afterCommit, now: () => NOW,
  });
  return result.applied;
}
/** Database at schema version `version` created from the real steps (data hooks are skipped on purpose: statements only). */
export async function openAt(version: number): Promise<Db> {
  const db = await openSqlJsDb();
  for (const step of MIGRATION_STEPS.filter((s) => s.version <= version)) {
    for (const statement of step.statements) await db.exec(statement);
  }
  await db.exec(`PRAGMA user_version = ${version}`);
  return db;
}
export async function fkViolations(db: Db): Promise<unknown[]> {
  return db.query("PRAGMA foreign_key_check");
}
export async function userVersion(db: Db): Promise<number> {
  return (await db.query<{ user_version: number }>("PRAGMA user_version"))[0].user_version;
}
