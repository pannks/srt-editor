import { create } from "zustand";

export type ToastKind = "ok" | "err" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/** Errors linger longer: they are the ones worth reading twice. */
const TOAST_MS: Record<ToastKind, number> = { ok: 4000, info: 4000, err: 7000 };

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

let nextId = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = "info") => {
    const id = ++nextId;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      TOAST_MS[kind],
    );
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative handle for non-component code (pipelines, boot checks). */
export const toast = {
  ok: (message: string) => useToasts.getState().push(message, "ok"),
  err: (message: string) => useToasts.getState().push(message, "err"),
  info: (message: string) => useToasts.getState().push(message, "info"),
};
