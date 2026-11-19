import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// CSS di-bundle Vite (bukan CDN) supaya tampilan tetap benar saat offline.
import "./theme-init";
import "./styles/globals.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CORE_MIGRATION_VERSIONS } from "./data/migration/steps";
import { registerModules } from "./modules";
import { moduleRegistry } from "./services/moduleRegistry";
// No module is active until ModuleService.load() runs, so the UI renders as before.
registerModules(moduleRegistry, CORE_MIGRATION_VERSIONS);

const rootEl = document.getElementById("root")!;
createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
