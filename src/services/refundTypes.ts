import type { PaymentMethodId } from "@/domain/payments";
import type { Role } from "@/domain/permissions";
import type { RefundRecord } from "./ports/orders";

export interface RefundActor {
  id: string;
  role: Role;
}

export interface RefundCommand {
  idempotencyKey: string;
  orderId: string;
  /** `void` cancels a completed order without refunds; `refund` needs `items`. */
  kind: "refund" | "void";
  items?: ReadonlyArray<{ lineId: string; qty: number }>;
  reason: string;
  /** Payment method the money goes back through. */
  method: PaymentMethodId;
  actor: RefundActor;
  /** Required when the actor's role is below the minimum for the action. */
  approver?: RefundActor;
}

export type RefundResult =
  | { ok: true; refund: RefundRecord; replayed: boolean }
  | {
      ok: false;
      code: "invalid" | "forbidden" | "failed";
      message: string;
      /** Per-line maximum refundable quantity, when the quantities were rejected. */
      maxPerLine?: Record<string, number>;
    };
