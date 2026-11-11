/**
 * Pembanding semver sederhana (misal 1.1.0 > 1.0.0, 1.0.1 > 1.0.0).
 */
export function isNewerVersion(remoteTag: string, currentVer: string): boolean {
  const clean = (v: string) =>
    v
      .replace(/^v/, "")
      .trim()
      .split(".")
      .map((part) => parseInt(part, 10) || 0);

  const r = clean(remoteTag);
  const c = clean(currentVer);
  const maxLen = Math.max(r.length, c.length);

  for (let i = 0; i < maxLen; i++) {
    const rVal = r[i] ?? 0;
    const cVal = c[i] ?? 0;
    if (rVal > cVal) return true;
    if (rVal < cVal) return false;
  }
  return false;
}
