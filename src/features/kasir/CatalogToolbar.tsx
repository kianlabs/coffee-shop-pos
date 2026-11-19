import { Search, X } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { type Category } from "@/domain/catalog";

interface CatalogToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  categories: Category[];
  categoryId: string;
  onCategory: (id: string) => void;
  resultCount: number;
}

export function CatalogToolbar({
  search,
  onSearch,
  categories,
  categoryId,
  onCategory,
  resultCount,
}: CatalogToolbarProps) {
  const searching = search.trim() !== "";
  return (
    <div className="space-y-3 px-4 pt-4 pb-3 md:px-6">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Cari menu"
          placeholder="Cari menu atau varian…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="bg-card pr-11 pl-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {search !== "" && (
          <button
            type="button"
            aria-label="Hapus pencarian"
            onClick={() => onSearch("")}
            className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {searching ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {resultCount} menu cocok dengan “{search.trim()}”
        </p>
      ) : (
        categories.length > 0 && (
          <div
            role="group"
            aria-label="Kategori menu"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:-mx-6 md:px-6"
          >
            {categories.map((category) => {
              const active = category.id === categoryId;
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onCategory(category.id)}
                  className={cn(
                    "h-11 shrink-0 rounded-md border px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                  )}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
