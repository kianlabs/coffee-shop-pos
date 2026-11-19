import { Delete } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/MoneyInput";
import { formatRupiah } from "@/domain/money";
import { applyNumpadKey, quickCashOptions } from "./checkoutRules";

interface CashTenderProps {
  total: number;
  amount: number;
  onAmount: (value: number) => void;
  showNumpad: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "⌫"];

export function CashTender({ total, amount, onAmount, showNumpad }: CashTenderProps) {
  const short = amount < total;
  const difference = Math.abs(amount - total);

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="pay-amount">Uang diterima</Label>
        <MoneyInput
          id="pay-amount"
          value={amount}
          allowEmpty
          placeholder="0"
          className="h-14 text-2xl font-semibold"
          onChange={(v) => onAmount(Math.max(0, v))}
        />
      </div>
      <div role="group" aria-label="Nominal cepat" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {quickCashOptions(total).map((value) => (
          <Button
            key={value}
            variant={value === amount ? "default" : "outline"}
            onClick={() => onAmount(value)}
            className="tabular-nums"
          >
            {value === total ? "Uang pas" : formatRupiah(value)}
          </Button>
        ))}
      </div>
      {showNumpad && (
        <div role="group" aria-label="Numpad nominal" className="grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <Button
              key={key}
              variant="secondary"
              className="h-12 text-lg tabular-nums"
              aria-label={key === "⌫" ? "Hapus satu angka" : undefined}
              onClick={() => onAmount(applyNumpadKey(amount, key))}
            >
              {key === "⌫" ? <Delete /> : key}
            </Button>
          ))}
        </div>
      )}
      <div
        aria-live="polite"
        data-testid="change-due"
        className={cn(
          "flex items-center justify-between rounded-lg px-4 py-3",
          short ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
        )}
      >
        <span className="text-sm font-medium">{short ? "Uang kurang" : "Kembalian"}</span>
        <span className="text-xl font-bold tabular-nums">{formatRupiah(difference)}</span>
      </div>
    </div>
  );
}
