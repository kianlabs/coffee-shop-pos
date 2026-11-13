import { STORE_PROFILE_LIMITS, type StoreProfile } from "../domain/storeProfile";

type TextField = "name" | "address" | "npwp" | "receiptHeader" | "receiptFooter";

interface FieldSpec {
  field: TextField;
  label: string;
  placeholder: string;
}

const FIELDS: FieldSpec[] = [
  { field: "name", label: "Nama toko", placeholder: "Nama Toko" },
  { field: "address", label: "Alamat", placeholder: "opsional" },
  { field: "npwp", label: "NPWP", placeholder: "opsional" },
  { field: "receiptHeader", label: "Teks atas struk", placeholder: "opsional" },
  { field: "receiptFooter", label: "Teks bawah struk", placeholder: "kosong = \"Terima kasih\"" },
];

export interface StoreProfileFieldsProps {
  draft: StoreProfile;
  onChange: (next: StoreProfile) => void;
}

export function StoreProfileFields({ draft, onChange }: StoreProfileFieldsProps) {
  return (
    <>
      {FIELDS.map(({ field, label, placeholder }) => (
        <label key={field}>
          {label}
          <input
            value={draft[field]}
            onChange={(e) => onChange({ ...draft, [field]: e.target.value })}
            placeholder={placeholder}
            maxLength={STORE_PROFILE_LIMITS[field]}
          />
        </label>
      ))}
    </>
  );
}
