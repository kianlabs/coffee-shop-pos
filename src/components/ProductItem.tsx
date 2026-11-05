import { formatRupiah } from "../domain/money";
import { unitPriceFor, type Product, type ProductVariant } from "../domain/catalog";

type ProductItemProps = {
  product: Product;
  variants: ProductVariant[];
  onAdd: (product: Product, variant: ProductVariant | null) => void;
};

export function ProductItem({ product, variants, onAdd }: ProductItemProps) {
  return (
    <article className="product-card">
      <h3>{product.name}</h3>
      <div className="product-price">{formatRupiah(product.basePriceRp)}</div>
      {variants.length === 0 ? (
        <button onClick={() => onAdd(product, null)}>Tambah</button>
      ) : (
        <div className="variant-list">
          {variants.map((v) => (
            <button key={v.id} className="variant-btn" onClick={() => onAdd(product, v)}>
              <span>{v.name}</span>
              <span className="money">{formatRupiah(unitPriceFor(product, v))}</span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
