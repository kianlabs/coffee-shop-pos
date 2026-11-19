import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { t } from "@/services/i18n";
import type { HelpSectionDef } from "./helpContent";
export function HelpSection({ section }: { section: HelpSectionDef }) {
  const { icon: Icon, prefix, id, stepCount } = section;
  const headingId = `bantuan-${id}-title`;
  const steps = Array.from({ length: stepCount }, (_, i) => i + 1);
  return (
    <section aria-labelledby={headingId} data-testid={`bantuan-section-${id}`}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Icon className="size-5 text-primary" aria-hidden />
            <h3 id={headingId} className="font-display text-base leading-none font-semibold">
              {t(`${prefix}.title`)}
            </h3>
          </div>
          <CardDescription>{t(`${prefix}.description`)}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm marker:font-semibold marker:text-primary">
            {steps.map((n) => (
              <li key={n}>{t(`${prefix}.${n}`)}</li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  );
}
