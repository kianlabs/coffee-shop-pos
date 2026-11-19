/**
 * Migration chain rules. Pure: no database, no clock. The checksum hash function
 * is passed in so the data layer can supply SHA-256 without this module
 * depending on it.
 */
export interface MigrationStep {
  /** Schema version this step produces. Steps are numbered 1, 2, 3, … */
  version: number;
  statements: string[];
  /** Optional name of a data hook that runs after the statements. */
  hook?: string;
}

export type Sha256 = (input: string) => string;

/** Checksum over the statements and hook name, in order. Changing either changes the checksum. */
export function stepChecksum(step: MigrationStep, sha256: Sha256): string {
  const payload = JSON.stringify({ statements: step.statements, hook: step.hook ?? null });
  return sha256(payload);
}

/**
 * Returns an error message when the chain has a gap, a duplicate, or does not
 * start at version 1. Returns null when the chain is contiguous.
 */
export function validateChain(steps: readonly MigrationStep[]): string | null {
  if (steps.length === 0) return null;
  const versions = steps.map((s) => s.version);
  const seen = new Set<number>();
  for (const v of versions) {
    if (!Number.isInteger(v) || v < 1) return `Versi migrasi tidak valid: ${v}.`;
    if (seen.has(v)) return `Versi migrasi duplikat: ${v}.`;
    seen.add(v);
  }
  const sorted = [...versions].sort((a, b) => a - b);
  if (sorted[0] !== 1) return "Rantai migrasi harus dimulai dari versi 1.";
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      return `Rantai migrasi terputus antara versi ${sorted[i - 1]} dan ${sorted[i]}.`;
    }
  }
  return null;
}

/** Steps that still have to run for a database at `current`, up to `latest`. */
export function pendingSteps(steps: readonly MigrationStep[], current: number, latest: number): MigrationStep[] {
  return steps
    .filter((s) => s.version > current && s.version <= latest)
    .sort((a, b) => a.version - b.version);
}

/** A database newer than this app's latest version must not be opened. */
export function isFutureSchema(current: number, latest: number): boolean {
  return current > latest;
}
