import { useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Separator } from "@/components/ui/separator";
import type { CatalogProduct, Category } from "@/domain/catalog";
import { ProductFields, type ProductDraft } from "./ProductFields";
import { ProductFormFooter } from "./ProductFormFooter";
import type { CatalogActions } from "./useCatalogEditor";
import { VariantEditor } from "./VariantEditor";

const FORM_ID = "product-form";

interface ProductFormProps {
  /** null = create a new product. */
  product: CatalogProduct | null;
  categories: Category[];
  defaultCategoryId: string;
  busy: boolean;
  actions: CatalogActions;
  /** Called after a successful save with the category that was used. */
  onSaved: (categoryId: string) => void;
  onCancel: () => void;
}

function initialDraft(product: CatalogProduct | null, defaultCategoryId: string): ProductDraft {
  if (!product) return { name: "", price: 0, categoryId: defaultCategoryId };
  return { name: product.name, price: product.basePriceRp, categoryId: product.categoryId };
}

export function ProductForm({
  product,
  categories,
  defaultCategoryId,
  busy,
  actions,
  onSaved,
  onCancel,
}: ProductFormProps) {
  const [draft, setDraft] = useState(() => initialDraft(product, defaultCategoryId));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Same rules as the old editor: name required, no negative price, and a
  // category is required only when creating.
  const canSave =
    draft.name.trim() !== "" && draft.price >= 0 && (product !== null || draft.categoryId !== "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    const input = { name: draft.name, categoryId: draft.categoryId, basePriceRp: draft.price };
    const ok = product
      ? await actions.saveProduct(product.id, input)
      : await actions.addProduct(input);
    setSaving(false);
    if (ok) onSaved(input.categoryId);
  }

  async function handleDelete() {
    if (!product) return;
    setDeleting(true);
    await actions.removeProduct(product);
    setDeleting(false);
  }

  return (
    <>
      <form id={FORM_ID} onSubmit={(e) => void handleSubmit(e)}>
        <ProductFields draft={draft} onChange={setDraft} categories={categories} />
      </form>
      {product ? (
        <>
          <Separator />
          <VariantEditor product={product} basePrice={draft.price} busy={busy} actions={actions} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Varian bisa ditambahkan setelah menu disimpan.</p>
      )}
      <ProductFormFooter
        formId={FORM_ID}
        isEdit={product !== null}
        canSave={canSave}
        saving={saving}
        deleting={deleting}
        busy={busy}
        onDelete={() => setConfirmOpen(true)}
        onCancel={onCancel}
      />
      {product && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Hapus menu "${product.name}"?`}
          description={`"${product.name}" dihapus dari daftar jual dan tidak muncul lagi di kasir. Riwayat transaksi lama tetap utuh.`}
          confirmLabel="Hapus menu"
          destructive
          onConfirm={() => void handleDelete()}
        />
      )}
    </>
  );
}
