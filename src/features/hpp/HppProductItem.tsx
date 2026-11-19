import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { type HppProductView } from "@/data/productRepo";
import { formatRupiah } from "@/domain/money";
import { HppLineRow } from "./HppLineRow";
import { productLine, variantLine, type HppLine } from "./hppModel";

interface HppProductItemProps {
  product: HppProductView;
  onEdit: (line: HppLine) => void;
  onRecipe: (line: HppLine) => void;
}

export function HppProductItem({ product, onEdit, onRecipe }: HppProductItemProps) {
  const [open, setOpen] = useState(false);
  const count = product.variants.length;
  const toggle = count > 0 && (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2"
      aria-expanded={open}
      aria-controls={`hpp-variants-${product.id}`}
      onClick={() => setOpen((v) => !v)}
    >
      <ChevronDown className={cn("transition-transform", open && "rotate-180")} aria-hidden />
      {open ? "Sembunyikan" : "Atur"} varian ({count})
    </Button>
  );
  return (
    <li className="rounded-lg border bg-card p-4 lg:rounded-none lg:border-0 lg:border-b lg:bg-transparent lg:py-3">
      <HppLineRow line={productLine(product)} subtitle={product.categoryName} onEdit={onEdit} onRecipe={onRecipe}>
        {toggle}
      </HppLineRow>
      {open && (
        <ul id={`hpp-variants-${product.id}`} className="mt-3 grid gap-3 border-t pt-3" aria-label={`Varian ${product.name}`}>
          {product.variants.map((v) => (
            <li key={v.id} className="rounded-md bg-muted/50 p-3 lg:bg-transparent lg:p-0">
              <HppLineRow
                line={variantLine(product, v)}
                subtitle={`Varian · selisih harga ${formatRupiah(v.priceDeltaRp)}`}
                onEdit={onEdit}
                onRecipe={onRecipe}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
