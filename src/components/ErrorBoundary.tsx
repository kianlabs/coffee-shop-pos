import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "@/services/i18n";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Menangkap error render supaya satu bug tidak membuat layar putih total di
 * tengah jam sibuk. Kasir tetap bisa melihat pesan + tombol muat ulang.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Simpan ke console agar masih bisa diperiksa lewat remote debugging.
    console.error("POS crash:", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <div role="alert" className="mx-auto my-12 max-w-xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">{t("app.crash.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("app.crash.description")}
        </p>
        <pre className="max-h-52 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
          {this.state.error.message}
        </pre>
        <button
          type="button"
          className="h-12 min-w-40 rounded-md bg-primary px-6 font-medium text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          {t("app.crash.reload")}
        </button>
      </div>
    );
  }
}
