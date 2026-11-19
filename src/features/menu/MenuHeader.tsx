import { t } from "@/services/i18n";

interface MenuHeaderProps {
  productCount: number;
}

export function MenuHeader({ productCount }: MenuHeaderProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold">
        {t("menu.header.title")}{" "}
        <span className="font-normal text-muted-foreground tabular-nums">({productCount})</span>
      </h2>
      <p className="text-sm text-muted-foreground">{t("menu.header.description")}</p>
    </div>
  );
}
