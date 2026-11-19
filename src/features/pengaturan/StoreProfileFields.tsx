import { Input } from "@/components/ui/input";
import { STORE_PROFILE_LIMITS, type StoreProfile } from "@/domain/storeProfile";
import { t } from "@/services/i18n";
import { Field } from "./Field";

type TextField = "name" | "address" | "npwp" | "receiptHeader" | "receiptFooter";

interface FieldSpec {
  field: TextField;
  labelKey: string;
  placeholderKey: string;
  hintKey?: string;
}

const OPTIONAL = "pengaturan.common.optional";

const FIELDS: FieldSpec[] = [
  { field: "name", labelKey: "pengaturan.store.name.label", placeholderKey: "pengaturan.store.name.placeholder", hintKey: "pengaturan.store.name.hint" },
  { field: "address", labelKey: "pengaturan.store.address.label", placeholderKey: OPTIONAL },
  { field: "npwp", labelKey: "pengaturan.store.npwp.label", placeholderKey: OPTIONAL },
  { field: "receiptHeader", labelKey: "pengaturan.store.receiptHeader.label", placeholderKey: OPTIONAL },
  { field: "receiptFooter", labelKey: "pengaturan.store.receiptFooter.label", placeholderKey: OPTIONAL, hintKey: "pengaturan.store.receiptFooter.hint" },
];

interface StoreProfileFieldsProps {
  draft: StoreProfile;
  onChange: (next: StoreProfile) => void;
}

export function StoreProfileFields({ draft, onChange }: StoreProfileFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {FIELDS.map(({ field, labelKey, placeholderKey, hintKey }) => {
        const id = `store-${field}`;
        return (
          <Field key={field} id={id} label={t(labelKey)} hint={hintKey ? t(hintKey) : undefined}>
            <Input
              id={id}
              value={draft[field]}
              onChange={(e) => onChange({ ...draft, [field]: e.target.value })}
              placeholder={t(placeholderKey)}
              maxLength={STORE_PROFILE_LIMITS[field]}
              aria-describedby={hintKey ? `${id}-hint` : undefined}
            />
          </Field>
        );
      })}
    </div>
  );
}
