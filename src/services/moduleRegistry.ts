import { validateModules } from "@/domain/modules/dependencies";
import type { ModuleDeclaration, ModuleNavItem, ModuleValidation } from "@/domain/modules/types";
export type RegistryListener = () => void;
/**
 * Holds module declarations and which of them are active (Req 29.3). `slots(name)` and
 * `navItems()` only return what active modules contribute; with nothing active they are empty.
 * `S` maps slot names to the contribution type (the UI layer supplies component types).
 */
export class ModuleRegistry<S extends object = Record<string, unknown>> {
  private readonly modules = new Map<string, ModuleDeclaration<Partial<S>>>();
  private active: ReadonlySet<string> = new Set();
  private version = 0;
  private readonly listeners = new Set<RegistryListener>();
  /** Registration order is kept; a duplicate id is rejected (validate() also reports it). */
  register(decl: ModuleDeclaration<Partial<S>>): void {
    if (this.modules.has(decl.id)) throw new Error(`Id modul "${decl.id}" sudah terdaftar.`);
    this.modules.set(decl.id, decl);
  }
  /** Runs the boot checks over everything registered so far. */
  validate(coreVersions: readonly number[]): ModuleValidation {
    return validateModules([...this.modules.values()], coreVersions);
  }
  get(id: string): ModuleDeclaration<Partial<S>> | undefined {
    return this.modules.get(id);
  }
  declarations(): ModuleDeclaration<Partial<S>>[] {
    return [...this.modules.values()];
  }
  /** Replaces the active set. Ids that are not registered are ignored. */
  setActive(ids: Iterable<string>): void {
    const next = new Set([...ids].filter((id) => this.modules.has(id)));
    if (next.size === this.active.size && [...next].every((id) => this.active.has(id))) return;
    this.active = next;
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }
  isActive(id: string): boolean {
    return this.active.has(id);
  }
  activeIds(): string[] {
    return [...this.modules.keys()].filter((id) => this.active.has(id));
  }
  /** Contributions to one slot from active modules, in registration order. */
  slots<N extends keyof S>(name: N): NonNullable<S[N]>[] {
    const out: NonNullable<S[N]>[] = [];
    for (const m of this.modules.values()) {
      const contribution = this.active.has(m.id) ? m.slots?.[name] : undefined;
      if (contribution !== undefined && contribution !== null) out.push(contribution as NonNullable<S[N]>);
    }
    return out;
  }
  navItems(): ModuleNavItem[] {
    return [...this.modules.values()].filter((m) => this.active.has(m.id)).flatMap((m) => [...m.nav]);
  }
  /** For `useSyncExternalStore`. */
  subscribe = (listener: RegistryListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  /** Changes whenever the active set changes. */
  getSnapshot = (): number => this.version;
}
