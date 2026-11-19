import { Plus, Search, Tags, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/domain/catalog";
import { ALL_CATEGORIES } from "./catalogView";

interface MenuToolbarProps {
  categories: Category[];
  query: string;
  onQueryChange: (q: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (id: string) => void;
  onAddProduct: () => void;
  onManageCategories: () => void;
}

export function MenuToolbar({
  categories,
  query,
  onQueryChange,
  categoryFilter,
  onCategoryFilterChange,
  onAddProduct,
  onManageCategories,
}: MenuToolbarProps) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-end">
      <div className="grid gap-2">
        <Label htmlFor="menu-search">Cari menu</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="menu-search"
            data-testid="menu-search"
            type="search"
            placeholder="Nama menu atau varian…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="pr-11 pl-9"
          />
          {query !== "" && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-0 right-0"
              aria-label="Hapus pencarian"
              onClick={() => onQueryChange("")}
            >
              <X />
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="menu-category-filter">Kategori</Label>
        <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
          <SelectTrigger
            id="menu-category-filter"
            data-testid="menu-category-filter"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>Semua kategori</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 md:flex-none"
          data-testid="menu-category-button"
          onClick={onManageCategories}
        >
          <Tags aria-hidden />
          Kategori
        </Button>
        <Button className="flex-1 md:flex-none" data-testid="menu-add-button" onClick={onAddProduct}>
          <Plus aria-hidden />
          Tambah menu
        </Button>
      </div>
    </div>
  );
}
