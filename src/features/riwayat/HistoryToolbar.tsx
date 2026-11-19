import { RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HISTORY_FILTERS, type HistoryFilter } from "./historyUtils";

interface HistoryToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  filter: HistoryFilter;
  onFilterChange: (value: HistoryFilter) => void;
  reloading: boolean;
  onReload: () => void;
}

export function HistoryToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  reloading,
  onReload,
}: HistoryToolbarProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Label htmlFor="riwayat-search">Cari riwayat</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="riwayat-search"
            type="search"
            placeholder="Cari nomor struk atau menu…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="pr-11 pl-9"
          />
          {query !== "" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Hapus pencarian"
              className="absolute top-0 right-0"
              onClick={() => onQueryChange("")}
            >
              <X aria-hidden />
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter status" className="flex flex-wrap gap-2">
          {HISTORY_FILTERS.map(([value, label]) => (
            <Button
              key={value}
              type="button"
              data-testid="history-filter"
              variant={filter === value ? "default" : "outline"}
              aria-pressed={filter === value}
              onClick={() => onFilterChange(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button type="button" variant="outline" loading={reloading} onClick={onReload}>
          {!reloading && <RefreshCw aria-hidden />}
          Muat ulang
        </Button>
      </div>
    </div>
  );
}
