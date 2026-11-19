import type { MigrationStep } from "@/domain/migration";
import type { ModuleDeclaration } from "@/domain/modules/types";
const steps = import.meta.glob<{ default: MigrationStep }>("./migrations/*.ts", { eager: true });
const migrations = Object.values(steps)
  .map((m) => m.default)
  .sort((a, b) => a.version - b.version);
/** Modul pelanggan: data pelanggan, terpisah dari `fnb` dan tanpa dependensi. */
const pelanggan: ModuleDeclaration = {
  id: "pelanggan",
  name: { id: "Pelanggan", en: "Customers" },
  dependsOn: [],
  settingKeys: [
    "pelanggan.nama_maks_karakter",
    "pelanggan.telepon_digit_min",
    "pelanggan.telepon_digit_maks",
    "pelanggan.catatan_maks_karakter",
  ],
  migrations,
  nav: [],
};
export default pelanggan;
