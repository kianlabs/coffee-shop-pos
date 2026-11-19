import { Input } from "@/components/ui/input";
import { STORE_PROFILE_LIMITS, type StoreProfile } from "@/domain/storeProfile";
import { Field } from "./Field";

type TextField = "name" | "address" | "npwp" | "receiptHeader" | "receiptFooter";

interface FieldSpec {
  field: TextField;
  label: string;
  placeholder: string;
  hint?: string;
}

const FIELDS: FieldSpec[] = [
  { field: "name", label: "Nama toko", placeholder: "Nama Toko", hint: "Tampil di bagian atas struk dan di layar." },
  { field: "address", label: "Alamat", placeholder: "Opsional" },
  { field: "npwp", label: "NPWP", placeholder: "Opsional" },
  { field: "receiptHeader", label: "Teks atas struk", placeholder: "Opsional" },
  { field: "receiptFooter", label: "Teks bawah struk", placeholder: "Opsional", hint: "Kosongkan untuk memakai \"Terima kasih\"." },
];

interface StoreProfileFieldsProps {
  draft: StoreProfile;
  onChange: (next: StoreProfile) => void;
}

export function StoreProfileFields({ draft, onChange }: StoreProfileFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {FIELDS.map(({ field, label, placeholder, hint }) => {
        const id = `store-${field}`;
        return (
          <Field key={field} id={id} label={label} hint={hint}>
            <Input
              id={id}
              value={draft[field]}
              onChange={(e) => onChange({ ...draft, [field]: e.target.value })}
              placeholder={placeholder}
              maxLength={STORE_PROFILE_LIMITS[field]}
              aria-describedby={hint ? `${id}-hint` : undefined}
            />
          </Field>
        );
      })}
    </div>
  );
}
