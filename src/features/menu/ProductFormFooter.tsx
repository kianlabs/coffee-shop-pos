import { Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/services/i18n";

interface ProductFormFooterProps {
  formId: string;
  isEdit: boolean;
  canSave: boolean;
  saving: boolean;
  deleting: boolean;
  busy: boolean;
  onDelete: () => void;
  onCancel: () => void;
}

export function ProductFormFooter({
  formId,
  isEdit,
  canSave,
  saving,
  deleting,
  busy,
  onDelete,
  onCancel,
}: ProductFormFooterProps) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center">
      {isEdit && (
        <Button
          type="button"
          variant="outline"
          className="text-destructive sm:mr-auto"
          data-testid="product-delete"
          loading={deleting}
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 aria-hidden />
          {t("menu.product.delete")}
        </Button>
      )}
      <Button type="button" variant="outline" className={isEdit ? undefined : "sm:ml-auto"} onClick={onCancel}>
        {t("menu.common.cancel")}
      </Button>
      <Button
        type="submit"
        form={formId}
        data-testid="product-form-save"
        loading={saving}
        disabled={!canSave}
      >
        <Check aria-hidden />
        {isEdit ? t("menu.common.save") : t("menu.product.add")}
      </Button>
    </div>
  );
}
