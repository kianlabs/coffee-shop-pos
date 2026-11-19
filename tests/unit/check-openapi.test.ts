import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkOpenApi, extractEmittedEventTypes, extractSyncBodyKeys } from "../../scripts/check-openapi.mjs";
import { parseYaml } from "../../scripts/lib/mini-yaml.mjs";

const SPEC = `openapi: 3.1.0
x-sync-events:
  "order.completed":
    payload: "#/components/schemas/Paid"
    example: {"orderId": "o1", "totalRp": 1000}
  "order.voided":
    payload: "#/components/schemas/Void"
    example: {"orderId": "o1"}
components:
  schemas:
    SyncRequest:
      properties:
        device_id:
          type: string
        events:
          type: array
    SyncEvent:
      properties:
        event_id:
          type: string
        payload:
          type: object
    Paid:
      type: object
      required: [orderId, totalRp]
      additionalProperties: false
      properties:
        orderId:
          type: string
        totalRp:
          type: integer
          minimum: 0
    Void:
      type: object
      required: [orderId]
      properties:
        orderId:
          type: string
`;
const run = (spec: string, ctx = {}) => checkOpenApi(spec, ctx) as Array<{ event: string; message: string }>;
const mutate = (from: string, to: string) => SPEC.replace(from, to);

describe("check-openapi", () => {
  it("lulus untuk spesifikasi dengan contoh valid", () => {
    expect(run(SPEC)).toEqual([]);
  });
  it("gagal dengan nama event bila field wajib hilang", () => {
    const fails = run(mutate('{"orderId": "o1", "totalRp": 1000}', '{"orderId": "o1"}'));
    expect(fails.map((f) => f.event)).toEqual(["order.completed"]);
    expect(fails[0].message).toContain("totalRp");
  });
  it("gagal bila tipe salah, di bawah minimum, atau ada field tak dikenal", () => {
    expect(run(mutate('"totalRp": 1000', '"totalRp": "1000"'))[0]).toMatchObject({ event: "order.completed" });
    expect(run(mutate('"totalRp": 1000', '"totalRp": -1'))[0].message).toContain("minimum");
    expect(run(mutate('"totalRp": 1000', '"totalRp": 1000, "x": 1'))[0].message).toContain("tidak dikenal");
    expect(run(mutate('"totalRp": 1000', '"totalRp": 10.5'))[0].message).toContain("integer");
  });
  it("gagal bila skema atau contoh tidak ada", () => {
    expect(run(mutate("schemas/Void", "schemas/Nope"))[0]).toMatchObject({ event: "order.voided" });
    expect(run(mutate('    example: {"orderId": "o1"}\n', ""))[0]).toMatchObject({ event: "order.voided" });
  });
  it("gagal bila x-sync-events kosong atau YAML rusak", () => {
    expect(run("openapi: 3.1.0\n")[0].message).toContain("x-sync-events");
    expect(run("openapi: 3.1.0\nx-sync-events:\n  a: {1\n")[0].message).toContain("YAML");
  });
  it("gagal bila client mengirim event_type yang tidak didokumentasikan", () => {
    const fails = run(SPEC, { emittedEventTypes: ["order.completed", "order.refunded"] });
    expect(fails).toEqual([{ event: "order.refunded", message: expect.stringContaining("x-sync-events") }]);
  });
  it("gagal bila client mengirim field amplop yang tidak ada di skema", () => {
    const src = [
      "body: JSON.stringify({",
      "  device_id: d,",
      "  events: events.map((e) => ({",
      "    event_id: e.id,",
      "    extra_field: 1,",
      "    payload: e.p,",
      "  })),",
      "}),",
    ].join("\n");
    const fails = run(SPEC, { syncSource: src });
    expect(fails.map((f) => f.message)).toEqual(['SyncEvent tidak punya field "extra_field" yang dikirim client']);
  });
  it("ekstraksi dari sumber client", () => {
    expect(extractEmittedEventTypes("INSERT INTO sync_outbox (a) VALUES (?, 'order.voided', 'order')")).toEqual(["order.voided"]);
    expect(extractSyncBodyKeys("tidak ada")).toBeNull();
  });
  it("repo nyata lulus terhadap sync.ts dan orderRepository.ts", () => {
    const read = (p: string) => readFileSync(p, "utf8");
    const emitted = extractEmittedEventTypes(read("src/data/orderRepository.ts")) as string[];
    expect(emitted.length).toBeGreaterThan(0);
    expect(run(read("api/openapi.yaml"), { syncSource: read("src/data/sync.ts"), emittedEventTypes: emitted })).toEqual([]);
  });
});

describe("mini-yaml", () => {
  it("membaca map, list, flow, block scalar, dan komentar", () => {
    const y = parseYaml(`a: 1\n# c\nb:\n  - x\n  - name: n\n    v: true\nc: [1, "two", z]\nd: |\n  baris1\n  baris2\n"200":\n  k: http://h:80\n`);
    expect(y).toEqual({ a: 1, b: ["x", { name: "n", v: true }], c: [1, "two", "z"], d: "baris1\nbaris2", "200": { k: "http://h:80" } });
  });
});
