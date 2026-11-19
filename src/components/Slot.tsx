import { useSyncExternalStore, type ComponentType } from "react";
import { moduleRegistry } from "@/services/moduleRegistry";
interface SlotProps<P extends object> {
  /** Slot name declared by modules, e.g. "cart.extra". */
  name: string;
  props?: P;
}
function isComponent<P extends object>(value: unknown): value is ComponentType<P> {
  return typeof value === "function";
}
/** Renders what active modules contribute to one slot. Renders nothing when no module is active. */
export function Slot<P extends object = Record<string, never>>({ name, props }: SlotProps<P>) {
  useSyncExternalStore(moduleRegistry.subscribe, moduleRegistry.getSnapshot, moduleRegistry.getSnapshot);
  const parts = moduleRegistry.slots(name).flatMap((c) => (Array.isArray(c) ? c : [c]));
  const components = parts.filter((c): c is ComponentType<P> => isComponent<P>(c));
  if (components.length === 0) return null;
  return (
    <>
      {components.map((Part, i) => (
        <Part key={i} {...(props ?? ({} as P))} />
      ))}
    </>
  );
}
