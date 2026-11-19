import type { ProductRowData } from "./catalogView";
import { ProductRow } from "./ProductRow";

interface ProductListProps {
  rows: ProductRowData[];
  onOpen: (productId: string) => void;
}

export function ProductList({ rows, onOpen }: ProductListProps) {
  return (
    <ul className="divide-y overflow-hidden rounded-lg border bg-card" data-testid="menu-product-list">
      {rows.map((row) => (
        <li key={row.product.id}>
          <ProductRow row={row} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}
