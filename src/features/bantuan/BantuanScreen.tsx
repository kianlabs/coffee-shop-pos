import { HelpSection } from "./HelpSection";
import { HELP_SECTIONS } from "./helpContent";
import { t } from "@/services/i18n";
export function BantuanScreen() {
  return (
    <div className="space-y-4" data-testid="bantuan-screen">
      <header>
        <h2 className="font-display text-xl font-semibold">{t("bantuan.intro.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("bantuan.intro.description")}</p>
      </header>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {HELP_SECTIONS.map((section) => (
          <HelpSection key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}
