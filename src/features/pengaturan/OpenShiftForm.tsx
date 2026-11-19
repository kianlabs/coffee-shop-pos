import { PlayCircle } from "lucide-react";
import { useState } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import { Button } from "@/components/ui/button";
import { Field } from "./Field";

interface OpenShiftFormProps {
  cashierName: string;
  cashierNameUnsaved: boolean;
  onOpen: (cashierName: string, openCashRp: number) => void;
}

export function OpenShiftForm({ cashierName, cashierNameUnsaved, onOpen }: OpenShiftFormProps) {
  const [openCash, setOpenCash] = useState(0);
  return (
    <div className="flex flex-col gap-4" data-testid="shift-open-form">
      <div className="rounded-md bg-muted p-3 text-sm">
        <p>
          Tidak ada shift berjalan. Kasir:{" "}
          <span className="font-semibold">{cashierName || "(belum diisi)"}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {cashierNameUnsaved
            ? "Nama kasir baru belum disimpan. Simpan dulu bila shift harus memakai nama baru."
            : "Nama kasir diubah di bagian Kasir."}
        </p>
      </div>
      <Field id="open-cash" label="Modal awal kas laci" hint="Uang tunai di laci saat shift dimulai.">
        <MoneyInput
          id="open-cash"
          value={openCash}
          allowEmpty
          onChange={(val) => setOpenCash(Math.max(0, val))}
          placeholder="Rp0"
          className="sm:max-w-60"
          aria-describedby="open-cash-hint"
        />
      </Field>
      <Button
        type="button"
        className="w-full sm:w-fit"
        onClick={() => {
          onOpen(cashierName, openCash);
          setOpenCash(0);
        }}
      >
        <PlayCircle aria-hidden />
        Buka shift
      </Button>
    </div>
  );
}
