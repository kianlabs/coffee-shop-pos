import { memo } from "react";
import { formatRupiah } from "../domain/money";
import { unitPriceFor, type Product, type ProductVariant } from "../domain/catalog";
import { Icon } from "./Icon";

type ProductItemProps = {
  product: Product;
  variants: ProductVariant[];
  onAdd: (product: Product, variant: ProductVariant | null) => void;
};

/**
 * Kartu menu di layar kasir. Di-memo agar menambah item ke keranjang tidak
 * me-render ulang seluruh grid (penting di tablet 4 GB).
 */
export const ProductItem = memo(function ProductItem({
  product,
  variants,
  onAdd,
}: ProductItemProps) {
  return (
    <article className="product-card">
      <h3 title={product.name}>{product.name}</h3>
      {/* Harga + aksi dikelompokkan di kaki kartu supaya sejajar antar kartu
          dalam satu baris, termasuk saat tetangganya punya varian. */}
      <div className="product-actions">
        <div className="product-price">{formatRupiah(product.basePriceRp)}</div>
        {variants.length === 0 ? (
          <button
            className="add-btn"
            onClick={() => onAdd(product, null)}
            aria-label={`Tambah ${product.name}`}
          >
            <Icon name="plus" size={15} />
            Tambah
          </button>
        ) : (
          <div className="variant-list" aria-label={`Varian ${product.name}`}>
            {variants.map((variant) => (
              <button
                key={variant.id}
                className="variant-btn"
                onClick={() => onAdd(product, variant)}
                aria-label={`Tambah ${product.name} ${variant.name}`}
              >
                <span>{variant.name}</span>
                <span className="money">{formatRupiah(unitPriceFor(product, variant))}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
});
