import { RotateCcw, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { errorMessage, notify } from "@/lib/notify";
import { LogoPreview } from "./LogoPreview";
import { resizeLogoFile } from "./logoImage";

interface LogoFieldProps {
  logoB64: string;
  onChange: (logoB64: string) => void;
}

export function LogoField({ logoB64, onChange }: LogoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const b64 = await resizeLogoFile(file);
      setPreviewFailed(false);
      onChange(b64);
      notify.success("Logo dipilih. Tekan \"Simpan pengaturan\" untuk menerapkan.");
    } catch (err) {
      notify.error(errorMessage(err, "Gagal memproses gambar logo."));
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    setPreviewFailed(false);
    onChange("");
    notify.info("Logo dikembalikan ke bawaan.");
  }

  return (
    <div className="flex flex-col gap-2" data-testid="settings-logo">
      <Label htmlFor="store-logo">Logo struk</Label>
      <LogoPreview logoB64={logoB64} failed={previewFailed} onError={() => setPreviewFailed(true)} />
      <p className="text-xs text-muted-foreground">
        PNG atau JPEG. Gambar diperkecil otomatis ke lebar 384 piksel (printer 58 mm).
      </p>
      <input
        ref={inputRef}
        id="store-logo"
        aria-label="Pilih file logo"
        type="file"
        accept="image/png, image/jpeg, image/webp"
        className="sr-only"
        onChange={(e) => void handleFile(e)}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" loading={busy} onClick={() => inputRef.current?.click()}>
          {!busy && <Upload aria-hidden />}
          Pilih gambar logo
        </Button>
        {logoB64 !== "" && (
          <Button type="button" variant="ghost" onClick={handleReset}>
            <RotateCcw aria-hidden />
            Pakai logo bawaan
          </Button>
        )}
      </div>
    </div>
  );
}
