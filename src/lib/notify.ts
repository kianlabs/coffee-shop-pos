import { toast } from "sonner";

/** Success and info toasts hide on their own; errors stay until dismissed. */
export const notify = {
  success(message: string) {
    toast.success(message, { duration: 3000 });
  },
  info(message: string) {
    toast.info(message, { duration: 3000 });
  },
  error(message: string) {
    toast.error(message, { duration: Infinity, closeButton: true });
  },
};

export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
