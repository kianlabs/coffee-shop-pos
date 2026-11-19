import { createHash } from "node:crypto";
import { isFutureSchema, pendingSteps, stepChecksum, validateChain, type MigrationStep } from "@/domain/migration";
import type { DbPort } from "@/data/dbPort";
import { runSerializedWrite } from "@/data/tx";

export type Transaction = <T>(fn: (db: DbPort) => Promise<T>) => Promise<T>;
export type DataHook = (db: DbPort) => Promise<void>;

export interface RunnerOptions {
  db: DbPort;
  /** Runs `fn` inside one transaction. The caller decides the connection. */
  transaction: Transaction;
  steps: readonly MigrationStep[];
  /** Highest version this build understands. Older builds refuse newer databases. */
  latest: number;
  hooks?: Record<string, DataHook>;
  /** Functions to run once every pending version has committed (for example, cache reloads). */
  afterCommit?: Array<() => Promise<void>>;
  now?: () => string;
}

const INSERT_ROW = "INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)";

export class MigrationError extends Error {}

const sha256 = (input: string): string => createHash("sha256").update(input).digest("hex");

async function ensureTable(db: DbPort): Promise<void> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
}

async function userVersion(db: DbPort): Promise<number> {
  const rows = await db.query<{ user_version: number }>("PRAGMA user_version");
  return rows[0]?.user_version ?? 0;
}

type AppliedRow = {
  version: number;
  checksum: string;
};

async function applied(db: DbPort): Promise<Map<number, string>> {
  const rows = await db.query<AppliedRow>("SELECT version, checksum FROM schema_migrations");
  return new Map(rows.map((r) => [r.version, r.checksum]));
}

/**
 * Brings the database to `latest`. Each pending version runs in its own
 * transaction and is recorded with a checksum. Databases created before the
 * runner existed are bootstrapped from PRAGMA user_version.
 */
export async function runMigrations(opts: RunnerOptions): Promise<{ applied: number[] }> {
  const { db, steps, latest } = opts;
  const chainError = validateChain(steps);
  if (chainError) throw new MigrationError(chainError);

  const now = opts.now ?? (() => new Date().toISOString());
  const pendingAfterCommit: Array<() => Promise<void>> = [];

  return runSerializedWrite(async () => {
    await ensureTable(db);
    const version = await userVersion(db);
    if (isFutureSchema(version, latest)) {
      throw new MigrationError(`Database versi ${version} lebih baru dari aplikasi (maks ${latest}).`);
    }
    const byVersion = new Map(steps.map((s) => [s.version, s]));

    await opts.transaction(async (tx) => {
      const rows = await applied(tx);
      if (rows.size === 0 && version > 0) {
        for (let v = 1; v <= version; v++) {
          const step = byVersion.get(v);
          if (!step) throw new MigrationError(`Langkah versi ${v} tidak ada untuk bootstrap.`);
          await tx.run(INSERT_ROW, [v, stepChecksum(step, sha256), now()]);
        }
      }
      for (const [v, checksum] of await applied(tx)) {
        const step = byVersion.get(v);
        if (step && stepChecksum(step, sha256) !== checksum) {
          throw new MigrationError(`Checksum migrasi versi ${v} tidak cocok. Database mungkin diubah manual.`);
        }
      }
    });

    const current = await userVersion(db);
    const done: number[] = [];
    for (const step of pendingSteps(steps, current, latest)) {
      await opts.transaction(async (tx) => {
        if (step.statements.length > 0) await tx.exec(step.statements.join(";\n"));
        if (step.hook) {
          const hook = opts.hooks?.[step.hook];
          if (!hook) throw new MigrationError(`Hook "${step.hook}" belum terdaftar.`);
          await hook(tx);
        }
        await tx.run(INSERT_ROW, [step.version, stepChecksum(step, sha256), now()]);
        await tx.exec(`PRAGMA user_version = ${step.version}`);
      });
      done.push(step.version);
    }
    pendingAfterCommit.push(...(opts.afterCommit ?? []));
    return { applied: done };
  }).then(async (result) => {
    for (const fn of pendingAfterCommit) await fn();
    return result;
  });
}
