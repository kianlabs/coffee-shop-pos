import type { OutboxStore } from "@/services/ports/orders";
import type { DbPort } from "../dbPort";
import { writeInTx } from "../tx";
const INSERT = `INSERT INTO sync_outbox (id, event_type, aggregate_type, aggregate_id, payload_json, created_at)
  VALUES (?, ?, ?, ?, ?, ?)`;
/** OutboxStore over `sync_outbox`; rows start `pending` with the schema defaults. */
export function createOutboxRepo(db: DbPort): OutboxStore {
  return {
    enqueue: (e) =>
      writeInTx(db, INSERT, [
        e.id,
        `${e.entityType}.${e.op}`,
        e.entityType,
        e.entityId,
        JSON.stringify({ entityType: e.entityType, entityId: e.entityId, op: e.op }),
        e.createdAt,
      ]),
  };
}
