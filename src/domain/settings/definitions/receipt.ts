import { defineSetting } from "../registry";

const base = { auditable: false, requiresRestart: false } as const;

export const RECEIPT_SETTINGS = [
  defineSetting({ ...base, key: "struk_header", label: { id: "Teks atas struk", en: "Receipt header" }, type: "text", default: "", maxLength: 200 }),
  defineSetting({ ...base, key: "struk_footer", label: { id: "Teks bawah struk", en: "Receipt footer" }, type: "text", default: "", maxLength: 200 }),
  defineSetting({ ...base, key: "struk_bahasa", label: { id: "Bahasa struk", en: "Receipt language" }, type: "enum", default: "id", options: ["id", "en"] }),
] as const;
