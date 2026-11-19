import { useMemo } from "react";
import { calcSubtotal, calcTotal } from "@/domain/money";
import { applyRounding } from "@/data/settings";
import { useAppStore } from "./appStore";
import { useCartStore } from "./cartStore";

export interface CartTotals {
  subtotal: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  roundingRp: number;
  total: number;
  itemCount: number;
}

/** Same arithmetic as the previous App.tsx: subtotal − discount + tax + service, then rounding. */
export function useCartTotals(): CartTotals {
  const lines = useCartStore((s) => s.lines);
  const discount = useCartStore((s) => s.discount);
  const tax = useCartStore((s) => s.tax);
  const serviceChargeRp = useAppStore((s) => s.posSettings.serviceChargeRp);
  const roundingStep = useAppStore((s) => s.posSettings.roundingStep);

  return useMemo(() => {
    const subtotal = calcSubtotal(lines);
    const serviceCharge = Math.max(0, Math.trunc(serviceChargeRp) || 0);
    const base = calcTotal(subtotal, discount, tax) + serviceCharge;
    const rounding =
      lines.length === 0 ? { rounded: 0, roundingRp: 0 } : applyRounding(base, roundingStep);
    return {
      subtotal,
      discount,
      tax,
      serviceCharge,
      roundingRp: rounding.roundingRp,
      total: rounding.rounded,
      itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
    };
  }, [lines, discount, tax, serviceChargeRp, roundingStep]);
}
