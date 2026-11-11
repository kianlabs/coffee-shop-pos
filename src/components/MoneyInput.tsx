import { type ChangeEvent, type InputHTMLAttributes } from "react";
import { formatThousands, parseThousands } from "../domain/money";

export type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: number;
  onChange: (value: number) => void;
  allowEmpty?: boolean;
  allowNegative?: boolean;
};

/**
 * Input uang Rupiah dengan pemisah ribuan titik otomatis (id-ID).
 * Mencegah kesalahan ketik (misal kelebihan/kurang nol: 50.000 vs 500.000).
 * Menggunakan inputMode="numeric" agar keyboard sentuh tablet membuka numpad virtual.
 */
export function MoneyInput({
  value,
  onChange,
  allowEmpty = false,
  allowNegative = false,
  className,
  ...rest
}: MoneyInputProps) {
  const displayValue =
    value === 0
      ? allowEmpty
        ? ""
        : "0"
      : formatThousands(value);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const isNeg = allowNegative && raw.trim().startsWith("-");
    const digits = raw.replace(/\D/g, "");

    // Posisi kursor sebelum re-format
    const cursorPos = e.target.selectionStart ?? raw.length;
    const digitsBefore = raw.slice(0, cursorPos).replace(/\D/g, "").length;

    let num = digits ? parseInt(digits, 10) : 0;
    if (isNeg) num = -num;

    onChange(num);

    const nextFormatted =
      num === 0
        ? allowEmpty && raw.trim() === ""
          ? ""
          : "0"
        : formatThousands(num);

    // Kembalikan posisi kursor sesuai jumlah digit yang diketik
    requestAnimationFrame(() => {
      let newCursor = 0;
      let seenDigits = 0;
      for (let i = 0; i < nextFormatted.length; i++) {
        if (/\d/.test(nextFormatted[i])) {
          seenDigits++;
        }
        if (seenDigits === digitsBefore) {
          newCursor = i + 1;
          break;
        }
      }
      if (seenDigits < digitsBefore) newCursor = nextFormatted.length;
      if (e.target) {
        e.target.setSelectionRange(newCursor, newCursor);
      }
    });
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      className={className}
      value={displayValue}
      onChange={handleChange}
    />
  );
}
