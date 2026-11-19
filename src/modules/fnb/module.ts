import type { MigrationStep } from "@/domain/migration";
import type { ModuleDeclaration } from "@/domain/modules/types";
import { FNB_SETTINGS } from "@/domain/settings/definitions/fnb";
const steps = import.meta.glob<{ default: MigrationStep }>("./migrations/*.ts", { eager: true });
const migrations = Object.values(steps)
  .map((m) => m.default)
  .sort((a, b) => a.version - b.version);
/** Modul F&B: modifier, urutan produk, foto, antrean bar, promo, bill. UI and services come in later tasks. */
const fnb: ModuleDeclaration = {
  id: "fnb",
  name: { id: "F&B", en: "F&B" },
  dependsOn: [],
  settingKeys: [...FNB_SETTINGS.map((s) => s.key), "bar.ambang_tunggu_menit"],
  migrations,
  nav: [],
};
export default fnb;
