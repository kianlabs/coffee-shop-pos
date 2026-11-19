import { MoneyInput } from "@/components/MoneyInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/domain/money";
import { t } from "@/services/i18n";
import { parseQty, purchaseConversion } from "./stockForm";
import { UnitSelect } from "./UnitSelect";
import { type PurchaseForm } from "./usePurchaseForm";

interface PurchaseAmountFieldsProps {
  form: PurchaseForm;
}

export function PurchaseAmountFields({ form }: PurchaseAmountFieldsProps) {
  const { qty, costRp, inputUnit, baseUnit } = form;
  const conversion = purchaseConversion(qty, costRp, inputUnit, baseUnit);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="buy-qty">{t("stok.purchase.qty.label")}</Label>
        <Input
          id="buy-qty"
          data-testid="stok-buy-qty"
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          placeholder={t("stok.purchase.qty.placeholder")}
          value={qty || ""}
          onChange={(e) => form.setQty(parseQty(e.target.value, false))}
        />
      </div>
      <UnitSelect
        id="buy-unit"
        label={t("stok.purchase.unit.label")}
        value={inputUnit}
        options={form.unitOptions}
        baseUnit={baseUnit}
        onChange={form.setInputUnit}
      />
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="buy-cost">
          {t("stok.purchase.cost.label", { satuan: inputUnit || t("stok.unit.fallback") })}
        </Label>
        <MoneyInput
          id="buy-cost"
          data-testid="stok-buy-cost"
          value={costRp}
          allowEmpty
          placeholder={t("stok.purchase.cost.placeholder")}
          onChange={form.setCostRp}
        />
      </div>
      {qty > 0 && costRp > 0 && (
        <div className="rounded-md bg-muted px-3 py-2 text-sm sm:col-span-2" aria-live="polite">
          <p>
            {t("stok.purchase.total.label")} <strong>{formatRupiah(qty * costRp)}</strong>
          </p>
          {conversion && (
            <p className="text-muted-foreground">
              {t("stok.purchase.conversion", {
                jumlah: conversion.qty,
                satuan: baseUnit,
                harga: formatRupiah(conversion.costPerBaseRp),
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
