import { create } from "zustand";
import { EMPTY_CATALOG, type Catalog } from "@/domain/catalog";
import { type Order } from "@/domain/orders";
import { type Shift } from "@/domain/shifts";
import { DEFAULT_STORE_PROFILE, type StoreProfile } from "@/domain/storeProfile";
import { getLegacyStoreProfile } from "@/data/storeProfile";
import { getSettings, type PosSettings } from "@/data/settings";
import { type PrinterStatus } from "@/data/printer";
import { type AvailableUpdate } from "@/services/appUpdater";
import { type View } from "@/app/navigation";
import { loadStoredShift, saveStoredShift } from "./persistence";

interface AppState {
  view: View;
  dbReady: boolean;
  orders: Order[];
  catalog: Catalog;
  catalogVersion: number;
  ordersVersion: number;
  posSettings: PosSettings;
  storeProfile: StoreProfile;
  shift: Shift | null;
  online: boolean;
  pendingCount: number | null;
  printer: PrinterStatus;
  availableUpdate: AvailableUpdate | null;
  updateDialogOpen: boolean;

  setView: (view: View) => void;
  setDbReady: (ready: boolean) => void;
  setOrders: (orders: Order[] | ((prev: Order[]) => Order[])) => void;
  setCatalog: (catalog: Catalog) => void;
  bumpCatalog: () => void;
  bumpOrders: () => void;
  setPosSettings: (settings: PosSettings) => void;
  setStoreProfile: (profile: StoreProfile) => void;
  setShift: (shift: Shift | null) => void;
  setOnline: (online: boolean) => void;
  setPendingCount: (count: number | null) => void;
  setPrinter: (printer: PrinterStatus) => void;
  setAvailableUpdate: (update: AvailableUpdate | null) => void;
  setUpdateDialogOpen: (open: boolean) => void;
}

function initialProfile(): StoreProfile {
  try {
    return getLegacyStoreProfile();
  } catch {
    return DEFAULT_STORE_PROFILE;
  }
}

export const useAppStore = create<AppState>()((set) => ({
  view: "kasir",
  dbReady: false,
  orders: [],
  catalog: EMPTY_CATALOG,
  catalogVersion: 0,
  ordersVersion: 0,
  posSettings: getSettings(),
  storeProfile: initialProfile(),
  shift: loadStoredShift(),
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  pendingCount: null,
  printer: { connected: false, address: null, name: null },
  availableUpdate: null,
  updateDialogOpen: false,

  setView: (view) => set({ view }),
  setDbReady: (dbReady) => set({ dbReady }),
  setOrders: (next) =>
    set((s) => ({ orders: typeof next === "function" ? next(s.orders) : next })),
  setCatalog: (catalog) => set({ catalog }),
  bumpCatalog: () => set((s) => ({ catalogVersion: s.catalogVersion + 1 })),
  bumpOrders: () => set((s) => ({ ordersVersion: s.ordersVersion + 1 })),
  setPosSettings: (posSettings) => set({ posSettings }),
  setStoreProfile: (storeProfile) => set({ storeProfile }),
  setShift: (shift) => {
    saveStoredShift(shift);
    set({ shift });
  },
  setOnline: (online) => set({ online }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setPrinter: (printer) => set({ printer }),
  setAvailableUpdate: (availableUpdate) => set({ availableUpdate }),
  setUpdateDialogOpen: (updateDialogOpen) => set({ updateDialogOpen }),
}));
