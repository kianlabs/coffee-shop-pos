import { Info } from "lucide-react";
import { t } from "@/services/i18n";
import { MarginValues } from "./MarginValues";
import { type HppLine } from "./hppModel";

interface HppPreviewProps {
  line: HppLine;
}

/** Live result of the values in the edit dialog. */
export function HppPreview({ line }: HppPreviewProps) {
  return (
    <section aria-label={t("hpp.preview.ariaLabel")} aria-live="polite" className="space-y-2 rounded-md bg-muted p-3">
      <h3 className="text-sm font-medium">{t("hpp.preview.title")}</h3>
      <MarginValues priceRp={line.priceRp} hppRp={line.hppRp} margin={line.margin} layout="stack" />
      {line.note && (
        <p className="flex items-start gap-1 text-xs text-warning">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {line.note}
        </p>
      )}
    </section>
  );
}
