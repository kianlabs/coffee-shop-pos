/** One stored setting. `value` is the decoded JSON value. */
export interface StoredSetting {
  key: string;
  value: unknown;
}

export interface SettingWrite {
  key: string;
  value: unknown;
  updatedAt: string;
  updatedBy: string;
}

export interface SettingsStore {
  /** Every stored row, including keys the registry no longer knows. */
  loadAll(): Promise<StoredSetting[]>;
  put(row: SettingWrite): Promise<void>;
  /** Deletes the row so the registry default applies again. */
  remove(key: string): Promise<void>;
}

export interface AuditEntry {
  id: string;
  actorId: string;
  approverId: string | null;
  action: string;
  actionType: string | null;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
}

/** Append-only audit log. */
export interface AuditStore {
  append(entry: AuditEntry): Promise<void>;
}
