import { describe, expect, it } from "vitest";
import { businessDay, parseResetTime } from "@/domain/businessDay";

describe("businessDay", () => {
  it("reset 00:00: hari kalender", () => {
    expect(businessDay(new Date(2025, 0, 15, 0, 0), "00:00")).toBe("2025-01-15");
    expect(businessDay(new Date(2025, 0, 15, 23, 59), "00:00")).toBe("2025-01-15");
  });
  it("tepat sebelum jam reset masih hari bisnis kemarin", () => {
    expect(businessDay(new Date(2025, 0, 15, 3, 59), "04:00")).toBe("2025-01-14");
  });
  it("tepat pada jam reset mulai hari bisnis baru", () => {
    expect(businessDay(new Date(2025, 0, 15, 4, 0), "04:00")).toBe("2025-01-15");
  });
  it("melintasi batas bulan dan tahun", () => {
    expect(businessDay(new Date(2025, 2, 1, 1, 0), "04:30")).toBe("2025-02-28");
    expect(businessDay(new Date(2025, 0, 1, 0, 10), "03:00")).toBe("2024-12-31");
  });
  it("menolak format jam reset dan waktu tidak valid", () => {
    expect(() => parseResetTime("4:00")).toThrow(RangeError);
    expect(() => parseResetTime("24:00")).toThrow(RangeError);
    expect(() => businessDay(new Date(NaN), "00:00")).toThrow(RangeError);
    expect(parseResetTime("23:59")).toBe(1439);
  });
});
