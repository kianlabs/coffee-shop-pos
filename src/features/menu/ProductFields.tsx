import { MoneyInput } from "@/components/MoneyInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/domain/catalog";
import { formatRupiah } from "@/domain/money";
import { t } from "@/services/i18n";

export interface ProductDraft {
  name: string;
  price: number;
  categoryId: string;
}

interface ProductFieldsProps {
  draft: ProductDraft;
  onChange: (draft: ProductDraft) => void;
  categories: Category[];
}

export function ProductFields({ draft, onChange, categories }: ProductFieldsProps) {
  const noCategories = categories.length === 0;
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="product-name">{t("menu.product.nameLabel")}</Label>
        <Input
          id="product-name"
          data-testid="product-name"
          placeholder={t("menu.product.namePlaceholder")}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value.slice(0, 80) })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="product-price">{t("menu.product.priceLabel")}</Label>
          <MoneyInput
            id="product-price"
            data-testid="product-price"
            placeholder={t("menu.product.pricePlaceholder")}
            value={draft.price}
            allowEmpty
            aria-invalid={draft.price < 0 || undefined}
            onChange={(price) => onChange({ ...draft, price })}
          />
          {draft.price < 0 && (
            <p className="text-sm text-destructive" role="alert">
              {t("menu.product.priceNegative")}
            </p>
          )}
          {draft.price > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("menu.product.priceHint", { harga: formatRupiah(draft.price) })}
            </p>
          )}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="product-category">{t("menu.common.category")}</Label>
          <Select
            value={draft.categoryId}
            onValueChange={(categoryId) => onChange({ ...draft, categoryId })}
            disabled={noCategories}
          >
            <SelectTrigger
              id="product-category"
              data-testid="product-category"
              className="w-full"
            >
              <SelectValue
                placeholder={
                  noCategories
                    ? t("menu.product.categoryPlaceholderEmpty")
                    : t("menu.product.categoryPlaceholder")
                }
              />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {noCategories && (
            <p className="text-sm text-warning">{t("menu.product.needCategory")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
