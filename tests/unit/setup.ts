import fc from "fast-check";

// 100 runs per property. FC_SEED replays a failing run exactly; the failing
// seed is printed by fast-check when a property fails.
const rawSeed = process.env.FC_SEED;
const seed = rawSeed === undefined || rawSeed === "" ? undefined : Number(rawSeed);

if (seed !== undefined && !Number.isInteger(seed)) {
  throw new Error(`FC_SEED harus bilangan bulat, dapat: ${rawSeed}`);
}

fc.configureGlobal({ numRuns: 100, ...(seed === undefined ? {} : { seed }) });
