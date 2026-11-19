import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// CSS di-bundle Vite (bukan CDN) supaya tampilan tetap benar saat offline.
import "./theme-init";
import "./styles/globals.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

const rootEl = document.getElementById("root")!;
createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
