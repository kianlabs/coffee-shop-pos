import { ImageIcon } from "lucide-react";
import { t } from "@/services/i18n";

interface LogoPreviewProps {
  logoB64: string;
  failed: boolean;
  onError: () => void;
}

const DEFAULT_LOGO = "assets/logo.png";

export function LogoPreview({ logoB64, failed, onError }: LogoPreviewProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed bg-muted p-4 text-center">
      {failed ? (
        <ImageIcon className="size-10 text-muted-foreground" aria-hidden />
      ) : (
        <img
          src={logoB64 || DEFAULT_LOGO}
          alt={t("pengaturan.logo.previewAlt")}
          className="max-h-[70px] max-w-[160px] object-contain"
          onError={onError}
        />
      )}
      <span className="text-xs text-muted-foreground">
        {logoB64 ? t("pengaturan.logo.usingCustom") : t("pengaturan.logo.usingDefault")}
      </span>
    </div>
  );
}
