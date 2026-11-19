import { afterEach, describe, expect, it } from "vitest";
import { memoryBackend, sqlBackend, type Backend } from "./support/orderBackends";
import { SCENARIOS } from "./support/orderScenarios";
const open: Backend[] = [];
afterEach(() => {
  for (const b of open.splice(0)) b.close();
});
async function run(make: () => Promise<Backend>, name: string) {
  const b = await make();
  open.push(b);
  const scenario = SCENARIOS.find((s) => s.name === name);
  if (scenario === undefined) throw new Error(name);
  const outcome = await scenario.run(b);
  return { b, outcome, snapshot: await b.snapshot() };
}
describe("order ports: memory store and SQL adapter agree", () => {
  it.each(SCENARIOS.map((s) => s.name))("%s", async (name) => {
    const memory = await run(async () => memoryBackend(), name);
    const sql = await run(sqlBackend, name);
    expect(sql.outcome).toEqual(memory.outcome);
    expect(sql.snapshot).toEqual(memory.snapshot);
    expect(await sql.b.fkViolations()).toEqual([]);
  });
});
