import { formatRupiah } from "../domain/money";
import { unitPriceFor, type Product, type ProductVariant } from "../domain/catalog";

type ProductItemProps = {
  product: Product;
  variants: ProductVariant[];
  onAdd: (product: Product, variant: ProductVariant | null) => void;
};

export function ProductItem({ product, variants, onAdd }: ProductItemProps) {
  if (variants.length === 0) {
    return (
      <div style={{ border: "1px solid #ddd", padding: 8, marginBottom: 8 }}>
        <p>
          {product.name} - {formatRupiah(product.basePriceRp)}
        </p>
        <button onClick={() => onAdd(product, null)}>Tambah</button>
      </div>
    );
  }
  return (
    <div style={{ border: "1px solid #ddd", padding: 8, marginBottom: 8 }}>
      <p>
        {product.name} - {formatRupiah(product.basePriceRp)}+
      </p>
      {variants.map((v) => (
        <button
          key={v.id}
          style={{ marginRight: 8, marginBottom: 4 }}
          onClick={() => onAdd(product, v)}
        >
          {v.name} ({formatRupiah(unitPriceFor(product, v))})
        </button>
      ))}
    </div>
  );
}
