import { memo } from "react";
import { formatRupiah } from "../domain/money";
import { unitPriceFor, type Product, type ProductVariant } from "../domain/catalog";
import { Icon } from "./Icon";

type ProductItemProps = {
  product: Product;
  variants: ProductVariant[];
  categoryName?: string;
  cartQuantity?: number;
  onAdd: (product: Product, variant: ProductVariant | null) => void;
};

/**
 * Kartu menu di layar kasir bergaya production-grade POS (Square/Toast/Moka).
 * Di-memo agar menambah item ke keranjang tidak me-render ulang seluruh grid (penting di tablet).
 */
export const ProductItem = memo(function ProductItem({
  product,
  variants,
  categoryName,
  cartQuantity = 0,
  onAdd,
}: ProductItemProps) {
  const hasVariants = variants.length > 0;
  const inCart = cartQuantity > 0;

  return (
    <article className={`product-card ${inCart ? "is-in-cart" : ""}`}>
      <div className="product-card-top">
        <div className="product-card-meta">
          <span className="product-category-tag">
            <Icon name="coffee" size={13} />
            {categoryName || "Menu"}
          </span>
          {inCart && (
            <span className="product-in-cart-pill" title={`${cartQuantity} item di pesanan`}>
              <Icon name="check" size={12} />
              {cartQuantity} di order
            </span>
          )}
        </div>
        {hasVariants && (
          <span className="product-variant-badge">{variants.length} varian</span>
        )}
      </div>

      <div className="product-card-header">
        <h3 title={product.name}>{product.name}</h3>
      </div>

      {/* Harga + aksi dikelompokkan di kaki kartu supaya sejajar antar kartu
          dalam satu baris, termasuk saat tetangganya punya varian. */}
      <div className="product-actions">
        <div className="product-price">
          {hasVariants ? (
            <span className="price-from">mulai </span>
          ) : null}
          {formatRupiah(product.basePriceRp)}
        </div>

        {!hasVariants ? (
          <button
            className="add-btn"
            onClick={() => onAdd(product, null)}
            aria-label={`Tambah ${product.name}`}
          >
            <Icon name="plus" size={15} />
            <span>Tambah</span>
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
                <span className="variant-name">{variant.name}</span>
                <span className="money">{formatRupiah(unitPriceFor(product, variant))}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
});
