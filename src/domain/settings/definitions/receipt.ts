import { defineSetting } from "../registry";

const base = { group: "struk", auditable: false, requiresRestart: false } as const;

export const RECEIPT_SETTINGS = [
  defineSetting({ ...base, key: "struk.header", type: "text", default: "", maxLength: 200,
    label: { id: "Teks atas struk", en: "Receipt header" },
    help: { id: "Dicetak di bawah nama toko. Boleh kosong.", en: "Printed under the store name. May be empty." } }),
  defineSetting({ ...base, key: "struk.footer", type: "text", default: "", maxLength: 200,
    label: { id: "Teks bawah struk", en: "Receipt footer" },
    help: { id: "Dicetak di akhir struk, misalnya ucapan terima kasih. Boleh kosong.", en: "Printed at the end of the receipt, for example a thank-you note. May be empty." } }),
  defineSetting({ ...base, key: "struk.bahasa_struk", type: "enum", default: "id", options: ["id", "en"],
    label: { id: "Bahasa struk", en: "Receipt language" },
    help: { id: "Bahasa struk terpisah dari bahasa antarmuka.", en: "The receipt language is separate from the interface language." } }),
] as const;
