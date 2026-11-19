import { ImageIcon } from "lucide-react";

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
          alt="Pratinjau logo struk"
          className="max-h-[70px] max-w-[160px] object-contain"
          onError={onError}
        />
      )}
      <span className="text-xs text-muted-foreground">
        {logoB64 ? "Memakai logo sendiri" : "Memakai logo bawaan"}
      </span>
    </div>
  );
}
