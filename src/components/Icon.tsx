import type { SVGProps } from "react";

export type IconName =
  | "cart"
  | "menu"
  | "receipt"
  | "chart"
  | "calculator"
  | "box"
  | "cloud"
  | "settings"
  | "search"
  | "plus"
  | "minus"
  | "trash"
  | "close"
  | "check"
  | "alert"
  | "info"
  | "printer"
  | "wifi"
  | "wifiOff"
  | "refresh"
  | "chevronDown"
  | "chevronRight"
  | "store"
  | "clock"
  | "lock"
  | "download"
  | "upload"
  | "sync"
  | "coffee"
  | "edit"
  | "tag";

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

/**
 * Ikon inline (stroke 1.8) supaya tidak perlu dependency ikon / request jaringan.
 * Semua memakai currentColor agar otomatis mengikuti tema.
 */
export function Icon({ name, size = 22, ...rest }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    ...rest,
  };

  switch (name) {
    case "cart":
      return (
        <svg {...common}>
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="18" cy="20" r="1.4" />
          <path d="M2.5 3.5h2.2l2.4 11.1a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2l1.6-6.7H5.2" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          <path d="M4 4.5h6.5a2.5 2.5 0 0 1 2.5 2.5v12a2 2 0 0 0-2-2H4z" />
          <path d="M20 4.5h-6.5a2.5 2.5 0 0 0-2.5 2.5v12a2 2 0 0 1 2-2h7z" />
        </svg>
      );
    case "receipt":
      return (
        <svg {...common}>
          <path d="M5 3.5h14v17l-2.3-1.5-2.3 1.5-2.4-1.5-2.3 1.5L7.3 19 5 20.5z" />
          <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case "calculator":
      return (
        <svg {...common}>
          <rect x="4.5" y="2.5" width="15" height="19" rx="2.5" />
          <path d="M8 6.5h8v3H8zM8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17.5h.01M12 17.5h.01M16 17.5h.01" />
        </svg>
      );
    case "box":
      return (
        <svg {...common}>
          <path d="m12 2.8 8 4.2v9.9l-8 4.3-8-4.3V7z" />
          <path d="m4.4 7.2 7.6 4 7.6-4M12 11.2v9.9" />
        </svg>
      );
    case "cloud":
      return (
        <svg {...common}>
          <path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.7A3.7 3.7 0 0 1 17.5 18.5z" />
          <path d="M12 11.5v6M9.5 15l2.5 2.5 2.5-2.5" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "minus":
      return (
        <svg {...common}>
          <path d="M5 12h14" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M4 6.5h16M9 6.5V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8v1.7M6.5 6.5l.8 12.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8l.8-12.2" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m4.5 12.5 5 5 10-11" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      );
    case "printer":
      return (
        <svg {...common}>
          <path d="M6.5 8.5V3.5h11v5" />
          <rect x="3" y="8.5" width="18" height="8.5" rx="2" />
          <path d="M6.5 14.5h11v6h-11zM17.5 11.5h.01" />
        </svg>
      );
    case "wifi":
      return (
        <svg {...common}>
          <path d="M2.5 8.8a15 15 0 0 1 19 0M5.5 12.3a10.5 10.5 0 0 1 13 0M8.5 15.8a6 6 0 0 1 7 0" />
          <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "wifiOff":
      return (
        <svg {...common}>
          <path d="M2 2l20 20M8.5 15.8a6 6 0 0 1 7 0M5.5 12.3a10.5 10.5 0 0 1 4.2-2.4M2.5 8.8a15 15 0 0 1 4-2.5M14 6.2a15 15 0 0 1 7.5 2.6" />
          <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 1 0-2.3 6.3M20 4.5V11h-6.5" />
        </svg>
      );
    case "chevronDown":
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "chevronRight":
      return (
        <svg {...common}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "store":
      return (
        <svg {...common}>
          <path d="M3.5 9.5V20h17V9.5M2.5 9.5 5 3.5h14l2.5 6a3 3 0 0 1-5 2.2 3 3 0 0 1-4.5 0 3 3 0 0 1-4.5 0 3 3 0 0 1-5-2.2z" />
          <path d="M9.5 20v-5h5v5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" />
          <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7M12 15v2" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v12M7 10.5l5 5 5-5M4 20.5h16" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 16V4M7 8.5l5-5 5 5M4 20.5h16" />
        </svg>
      );
    case "sync":
      return (
        <svg {...common}>
          <path d="M4 7.5h13l-3-3M20 16.5H7l3 3" />
        </svg>
      );
    case "coffee":
      return (
        <svg {...common}>
          <path d="M4 8.5h13v6.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
          <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M7 2.5v2.5M11 2.5v2.5M15 2.5v2.5" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17zM14 6l3 3" />
        </svg>
      );
    case "tag":
      return (
        <svg {...common}>
          <path d="M3.5 3.5h7.6l9.4 9.4a2 2 0 0 1 0 2.8l-4.8 4.8a2 2 0 0 1-2.8 0L3.5 11.1z" />
          <circle cx="8" cy="8" r="1.3" />
        </svg>
      );
    default:
      return null;
  }
}
