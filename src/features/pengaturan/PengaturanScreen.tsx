import { useState } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { t } from "@/services/i18n";
import { AboutSection } from "./AboutSection";
import { KasirSection } from "./KasirSection";
import { PrinterSection } from "./PrinterSection";
import { SaveBar } from "./SaveBar";
import { SecuritySection } from "./SecuritySection";
import { SECTIONS, SectionNav, type SectionId } from "./SectionNav";
import { ShiftSection } from "./ShiftSection";
import { StoreSection } from "./StoreSection";
import { useMediaQuery } from "./useMediaQuery";
import { useSettingsForm } from "./useSettingsForm";

const CONTENT_CLASS = "min-w-0 data-[state=inactive]:hidden";

/**
 * Settings screen. Toko, Kasir, and Keamanan edit a draft that applies only
 * after "Simpan pengaturan"; Shift, Printer, and Tentang act immediately.
 */
export function PengaturanScreen() {
  const form = useSettingsForm();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [tab, setTab] = useState<SectionId>("toko");
  const usesSave = SECTIONS.find((s) => s.id === tab)?.usesSave ?? false;

  return (
    <div className="flex flex-col gap-4" data-testid="pengaturan-screen">
      <div>
        <h1 className="text-xl font-semibold">{t("pengaturan.screen.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("pengaturan.screen.description")}</p>
      </div>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = SECTIONS.find((s) => s.id === v);
          if (next) setTab(next.id);
        }}
        orientation={wide ? "vertical" : "horizontal"}
        className={wide ? "flex-row items-start gap-6" : "gap-4"}
      >
        <SectionNav vertical={wide} />
        <div className="min-w-0 flex-1">
          {/* Mounted while hidden, so drafts, scan results, and messages survive switching sections. */}
          <TabsContent value="toko" forceMount className={CONTENT_CLASS}>
            <StoreSection profile={form.profile} setProfile={form.setProfile} />
          </TabsContent>
          <TabsContent value="kasir" forceMount className={CONTENT_CLASS}>
            <KasirSection settings={form.settings} setSettings={form.setSettings} />
          </TabsContent>
          <TabsContent value="shift" forceMount className={CONTENT_CLASS}>
            <ShiftSection
              cashierName={form.saved.cashierName}
              cashierNameUnsaved={form.settings.cashierName !== form.saved.cashierName}
            />
          </TabsContent>
          <TabsContent value="printer" forceMount className={CONTENT_CLASS}>
            <PrinterSection />
          </TabsContent>
          <TabsContent value="keamanan" forceMount className={CONTENT_CLASS}>
            <SecuritySection form={form} />
          </TabsContent>
          <TabsContent value="tentang" forceMount className={CONTENT_CLASS}>
            <AboutSection />
          </TabsContent>
          {(usesSave || form.dirty) && (
            <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void form.save()} />
          )}
        </div>
      </Tabs>
    </div>
  );
}
