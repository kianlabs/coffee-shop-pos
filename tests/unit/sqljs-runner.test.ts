import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";

describe("runner Vitest", () => {
  it("menjalankan SQL di sql.js dalam memori", async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, nama TEXT)");
    db.run("INSERT INTO t (nama) VALUES ('kopi')");
    const rows = db.exec("SELECT nama FROM t");
    expect(rows[0].values).toEqual([["kopi"]]);
    db.close();
  });
});
