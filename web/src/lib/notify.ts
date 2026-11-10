export type ToastKind = "success" | "info" | "error";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  createdAt: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

interface ToastStore {
  seq: number;
  toasts: ToastItem[];
  listeners: Set<ToastListener>;
}

const GLOBAL_STORE_KEY = "__FRAUDRADAR_TOAST_STORE__";

function getStore(): ToastStore {
  const target = (typeof window !== "undefined"
    ? window
    : globalThis) as unknown as Record<string, ToastStore>;

  if (!target[GLOBAL_STORE_KEY]) {
    target[GLOBAL_STORE_KEY] = {
      seq: 0,
      toasts: [],
      listeners: new Set<ToastListener>(),
    };
  }
  return target[GLOBAL_STORE_KEY];
}

function emit() {
  const store = getStore();
  const current = [...store.toasts];
  for (const listener of store.listeners) {
    listener(current);
  }
}

export function subscribeToasts(listener: ToastListener): () => void {
  const store = getStore();
  store.listeners.add(listener);
  listener([...store.toasts]);
  return () => {
    store.listeners.delete(listener);
  };
}

export function dismissToast(id: number): void {
  const store = getStore();
  store.toasts = store.toasts.filter((t) => t.id !== id);
  emit();
}

export function clearToasts(): void {
  const store = getStore();
  store.toasts = [];
  emit();
}

function pushToast(kind: ToastKind, title: string, body?: string): number {
  const store = getStore();
  const id = ++store.seq;
  const item: ToastItem = {
    id,
    kind,
    title,
    body,
    createdAt: Date.now(),
  };
  // No máximo 4 notificações empilhadas no canto inferior direito
  store.toasts = [...store.toasts, item].slice(-4);
  emit();
  return id;
}

export const notify = {
  success: (title: string, body?: string) => pushToast("success", title, body),
  info: (title: string, body?: string) => pushToast("info", title, body),
  error: (title: string, body?: string) => pushToast("error", title, body),
  dismiss: (id: number) => dismissToast(id),
  clear: () => clearToasts(),
};

if (typeof window !== "undefined") {
  (window as unknown as { notify?: typeof notify }).notify = notify;
}
