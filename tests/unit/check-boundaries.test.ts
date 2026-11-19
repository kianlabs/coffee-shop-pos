import { describe, expect, it } from "vitest";
import { MAX_TSX_LINES, findViolations } from "../../scripts/check-boundaries.mjs";

type Violation = { file: string; rule: string };

function rulesFor(files: Record<string, string>): Violation[] {
  return findViolations(new Map(Object.entries(files))) as Violation[];
}

function rulesOf(files: Record<string, string>): string[] {
  return rulesFor(files).map((v) => v.rule);
}

describe("check-boundaries: lulus untuk impor yang sah", () => {
  it("domain mengimpor domain saja", () => {
    expect(rulesOf({ "src/domain/a.ts": 'import { b } from "./b";\nexport const a = b;' })).toEqual([]);
  });

  it("features mengimpor services, domain, dan components/ui", () => {
    expect(
      rulesOf({
        "src/features/kasir/K.tsx": 'import { x } from "@/domain/money";\nimport { y } from "@/services/svc";\nimport { Button } from "@/components/ui/button";\nexport const K = () => null;',
      }),
    ).toEqual([]);
  });
});

describe("check-boundaries: aturan impor lapisan", () => {
  it("domain tidak boleh mengimpor data, services, atau UI", () => {
    expect(rulesOf({ "src/domain/a.ts": 'import { x } from "@/data/db";' })).toContain("domain-no-outer-layer");
    expect(rulesOf({ "src/domain/a.ts": 'import { x } from "../services/svc";' })).toContain("domain-no-outer-layer");
    expect(rulesOf({ "src/domain/a.ts": 'import { x } from "@/features/kasir/K";' })).toContain("domain-no-outer-layer");
  });

  it("domain tidak boleh mengimpor React atau Capacitor", () => {
    expect(rulesOf({ "src/domain/a.ts": 'import React from "react";' })).toContain("domain-no-framework-or-plugin");
    expect(rulesOf({ "src/domain/a.ts": 'import { App } from "@capacitor/app";' })).toContain("domain-no-framework-or-plugin");
  });

  it("services tidak boleh mengimpor data atau UI, dan tidak boleh memakai React", () => {
    expect(rulesOf({ "src/services/s.ts": 'import { x } from "@/data/db";' })).toContain("services-no-data-or-ui");
    expect(rulesOf({ "src/services/s.ts": 'import { x } from "@/features/a/b";' })).toContain("services-no-data-or-ui");
    expect(rulesOf({ "src/services/s.ts": 'import { useState } from "react";' })).toContain("services-no-framework");
  });

  it("data tidak boleh mengimpor UI atau React", () => {
    expect(rulesOf({ "src/data/d.ts": 'import { K } from "@/features/kasir/K";' })).toContain("data-no-ui");
    expect(rulesOf({ "src/data/d.ts": 'import { useState } from "react";' })).toContain("data-no-react");
  });

  it("features dan components tidak boleh mengimpor data", () => {
    expect(rulesOf({ "src/features/kasir/K.tsx": 'import { repo } from "@/data/orderRepo";' })).toContain("ui-no-data");
    expect(rulesOf({ "src/components/X.tsx": 'import { repo } from "../data/orderRepo";' })).toContain("ui-no-data");
  });

  it("plugin SQLite hanya boleh dipakai di src/data", () => {
    const sqlite = 'import { CapacitorSQLite } from "@capacitor-community/sqlite";';
    expect(rulesOf({ "src/data/db.ts": sqlite })).toEqual([]);
    expect(rulesOf({ "src/features/kasir/K.tsx": sqlite })).toContain("no-sqlite-outside-data");
    expect(rulesOf({ "src/domain/a.ts": sqlite })).toContain("no-sqlite-outside-data");
  });

  it("impor dinamis juga diperiksa", () => {
    expect(rulesOf({ "src/domain/a.ts": 'export const load = () => import("@/data/db");' })).toContain("domain-no-outer-layer");
  });
});

describe("check-boundaries: domain murni", () => {
  it("menolak Date.now, Math.random, dan localStorage di domain", () => {
    expect(rulesOf({ "src/domain/a.ts": "export const t = Date.now();" })).toContain("domain-impure-api");
    expect(rulesOf({ "src/domain/a.ts": "export const r = Math.random();" })).toContain("domain-impure-api");
    expect(rulesOf({ "src/domain/a.ts": 'export const s = localStorage.getItem("k");' })).toContain("domain-impure-api");
  });

  it("waktu yang diterima sebagai parameter tetap lulus", () => {
    expect(rulesOf({ "src/domain/a.ts": "export const f = (now: Date) => now.toISOString();" })).toEqual([]);
  });
});

describe("check-boundaries: jalur tulis SQLite", () => {
  it("db.run di luar src/data/tx.ts dan migrasi ditolak", () => {
    expect(rulesOf({ "src/data/repo.ts": 'db.run("DELETE FROM t");' })).toContain("write-path-outside-tx");
  });

  it("db.run di src/data/tx.ts diizinkan", () => {
    expect(rulesOf({ "src/data/tx.ts": 'db.run("BEGIN");' })).toEqual([]);
  });

  it("withTransaction harus berada di dalam runSerializedWrite", () => {
    expect(rulesOf({ "src/data/repo.ts": "withTransaction(async () => 1);" })).toContain("tx-outside-serialized-write");
    expect(rulesOf({ "src/data/repo.ts": "runSerializedWrite(() => withTransaction(async () => 1));" })).toEqual([]);
  });
});

describe("check-boundaries: batas baris .tsx", () => {
  it("berkas .tsx di atas batas ditolak, di bawah batas diterima", () => {
    const long = Array.from({ length: MAX_TSX_LINES + 1 }, () => "//").join("\n");
    const short = Array.from({ length: MAX_TSX_LINES }, () => "//").join("\n");
    expect(rulesOf({ "src/features/a/A.tsx": long })).toContain("max-tsx-lines");
    expect(rulesOf({ "src/features/a/A.tsx": short })).toEqual([]);
  });
});
