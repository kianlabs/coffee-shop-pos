import { Component, type ErrorInfo, type ReactNode } from "react";

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
      <div style={{ maxWidth: 560, margin: "48px auto", padding: 24, fontFamily: "sans-serif" }}>
        <h1 style={{ fontSize: 20 }}>Aplikasi berhenti karena error</h1>
        <p style={{ fontSize: 14 }}>
          Transaksi yang sudah tersimpan tetap aman di database. Muat ulang untuk melanjutkan.
        </p>
        <pre
          style={{
            background: "#f5f5f5",
            padding: 12,
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: "pre-wrap",
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          {this.state.error.message}
        </pre>
        <button style={{ minHeight: 48, minWidth: 160 }} onClick={() => window.location.reload()}>
          Muat ulang
        </button>
      </div>
    );
  }
}
