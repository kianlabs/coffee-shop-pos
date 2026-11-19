import { useState, type Dispatch, type SetStateAction } from "react";

type Flat = object;

export function shallowEqual<T extends Flat>(a: T, b: T): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as (keyof T)[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is(a[key], b[key]));
}

export interface DraftState<T> {
  draft: T;
  setDraft: Dispatch<SetStateAction<T>>;
  dirty: boolean;
}

/**
 * Editable copy of a saved value. When the saved value changes from outside
 * (database load, PIN migration) an untouched draft follows it; an edited
 * draft is passed through `merge` so the user's typing is kept.
 */
export function useDraft<T extends Flat>(saved: T, merge: (draft: T, saved: T) => T): DraftState<T> {
  const [draft, setDraft] = useState<T>(saved);
  const [base, setBase] = useState<T>(saved);
  if (base !== saved) {
    setBase(saved);
    setDraft(shallowEqual(draft, base) ? saved : merge(draft, saved));
  }
  return { draft, setDraft, dirty: !shallowEqual(draft, saved) };
}
