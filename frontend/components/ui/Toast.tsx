"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cx } from "@/lib/cx";

export type ToastVariant = "info" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  leaving: boolean;
}

interface ToastApi {
  show: (message: string, variant?: ToastVariant) => void;
}

const VISIBLE_MS = 5000;
// Removal waits a little longer than the CSS exit (--duration-exit) so the fade always finishes.
const EXIT_MS = 250;

// Glyph colors are the same-hue text shades that pass 4.5:1 on surface.
const GLYPHS: Record<ToastVariant, { path: string; className: string }> = {
  info: { path: "M12 11v5M12 8h.01", className: "text-cyan-700" },
  success: { path: "M7.5 12.5l3 3 6-7", className: "text-green-700" },
  error: { path: "M12 7.5v5M12 16h.01", className: "text-red-700" },
};

const ToastContext = createContext<ToastApi | null>(null);

/** Shows toasts at the bottom of the screen and announces them politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  // One pending timer per toast: its auto-dismiss, replaced by its removal once it starts leaving.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const schedule = useCallback((id: number, fn: () => void, ms: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        fn();
      }, ms),
    );
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      schedule(id, () => setToasts((all) => all.filter((t) => t.id !== id)), EXIT_MS);
    },
    [schedule],
  );

  const show = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = ++nextId.current;
      setToasts((all) => [...all, { id, message, variant, leaving: false }]);
      schedule(id, () => dismiss(id), VISIBLE_MS);
    },
    [dismiss, schedule],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={api}>
      {children}
      {/* Always mounted, so screen readers are already watching it when the first toast arrives. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext>
  );
}

/**
 * Enters on the default spring from just below and leaves the same way, accelerating out. These are
 * transitions (with @starting-style), not keyframes, so a dismiss mid-entry reverses from where the
 * toast is. Reduced motion: no movement, a short cross-fade.
 */
function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const glyph = GLYPHS[toast.variant];
  return (
    <div
      className={cx(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-slate-200 bg-surface p-4 text-ink shadow-overlay",
        "transition-[opacity,translate] motion-reduce:duration-(--duration-fast) motion-reduce:ease-out",
        toast.leaving
          ? "opacity-0 duration-(--duration-exit) ease-exit motion-safe:translate-y-4"
          : "duration-(--duration-spring) ease-spring starting:opacity-0 motion-safe:starting:translate-y-4",
      )}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cx("mt-px size-5 shrink-0 fill-none stroke-current stroke-2", glyph.className)}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9.25" />
        <path d={glyph.path} />
      </svg>
      <p className="flex-1 text-sm">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="focus-ring -m-1 rounded-control p-1 text-muted transition-colors duration-(--duration-fast) hover:bg-slate-100 hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-4 fill-none stroke-current stroke-2"
          strokeLinecap="round"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

/** `show(message, variant)` from any client component under <ToastProvider>. */
export function useToast(): ToastApi {
  const api = use(ToastContext);
  if (!api) throw new Error("useToast() must be used inside <ToastProvider>.");
  return api;
}
