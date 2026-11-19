// Business day for Nomor_Antrean (Req 30.2): date(now − reset time), in device-local time.
const RESET_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseResetTime(hhmm: string): number {
  const m = RESET_RE.exec(hhmm);
  if (m === null) throw new RangeError("Jam reset harus berformat HH:mm (00:00–23:59).");
  return Number(m[1]) * 60 + Number(m[2]);
}

/** `YYYY-MM-DD` of the business day containing `now`; before the reset time it is still yesterday. */
export function businessDay(now: Date, resetHHmm: string): string {
  if (Number.isNaN(now.getTime())) throw new RangeError("Waktu tidak valid.");
  const resetMin = parseResetTime(resetHHmm);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const day = nowMin < resetMin ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) : now;
  const mm = String(day.getMonth() + 1).padStart(2, "0");
  const dd = String(day.getDate()).padStart(2, "0");
  return `${String(day.getFullYear()).padStart(4, "0")}-${mm}-${dd}`;
}
