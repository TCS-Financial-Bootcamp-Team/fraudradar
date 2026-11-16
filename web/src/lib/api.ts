import { getCurrentDataset } from "@/lib/dataset";
import type { AppLocale } from "@/i18n/config";
import { getT } from "@/i18n/runtime";
import { translateServerMessage } from "@/i18n/server-messages";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

async function buildHeaders() {
  const headers = new Headers();
  headers.set("X-Dataset", getCurrentDataset());
  if (typeof window !== "undefined") {
    const { getSupabaseConfig } = await import("./supabase/config");
    if (getSupabaseConfig()) {
      const { createSupabaseBrowserClient } = await import("./supabase/client");
      const { data } = await createSupabaseBrowserClient().auth.getSession();
      if (data.session)
        headers.set("Authorization", `Bearer ${data.session.access_token}`);
    }
  }
  return headers;
}

// A API (FastAPI) explica o erro em `detail`, em português. Erro convertido também traz `code`
// e `params`: com o código conhecido, a mensagem vem traduzida para o idioma ativo; sem ele
// (ou com um código novo, ainda sem tradução), vale o `detail`. Só texto é mostrado: o formato
// de lista do 422 do Pydantic cai na mensagem genérica.
export function errorMessageFor(
  status: number,
  body: unknown,
  fallback: string,
  locale?: AppLocale,
): string {
  if (status === 401) return getT("errors", locale)("sessionExpired");
  const fields =
    typeof body === "object" && body !== null
      ? (body as { detail?: unknown; code?: unknown; params?: unknown })
      : {};
  const detail =
    typeof fields.detail === "string" && fields.detail.trim()
      ? fields.detail
      : null;
  if (typeof fields.code === "string" && fields.code) {
    const params =
      typeof fields.params === "object" && fields.params !== null
        ? (fields.params as Record<string, unknown>)
        : {};
    const translated = translateServerMessage(
      fields.code,
      params,
      detail,
      locale,
    );
    if (translated) return translated;
  }
  return detail ?? fallback;
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = await buildHeaders();
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new Error(
      errorMessageFor(
        response.status,
        body,
        getT("errors")("requestFailed", { status: response.status }),
      ),
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function apiGet<T>(path: string, init?: RequestInit) {
  return requestJson<T>(path, init);
}
export function apiPost<T>(
  path: string,
  payload: unknown,
  signal?: AbortSignal,
) {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}
export function apiPut<T>(path: string, payload: unknown) {
  return requestJson<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
export function apiDelete<T>(path: string) {
  return requestJson<T>(path, { method: "DELETE" });
}
export async function apiMultipart<T>(
  path: string,
  formData: FormData,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  const headers = await buildHeaders();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    headers.forEach((value, key) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    const handleAbort = () => xhr.abort();
    signal?.addEventListener("abort", handleAbort, { once: true });
    xhr.onloadend = () => signal?.removeEventListener("abort", handleAbort);
    xhr.onerror = () =>
      reject(new Error(getT("errors")("uploadConnection")));
    xhr.onabort = () =>
      reject(new DOMException("Envio cancelado", "AbortError"));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let body: unknown = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          // corpo que não é JSON (proxy, 413 do servidor): vale a mensagem genérica
        }
        return reject(
          new Error(
            errorMessageFor(
              xhr.status,
              body,
              getT("errors")("uploadRefused", { status: xhr.status }),
            ),
          ),
        );
      }
      try {
        resolve(JSON.parse(xhr.responseText) as T);
      } catch {
        reject(new Error(getT("errors")("invalidResponse")));
      }
    };
    if (signal?.aborted)
      return reject(new DOMException("Envio cancelado", "AbortError"));
    xhr.send(formData);
  });
}
