import { getCurrentDataset } from "@/lib/dataset";

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

const SESSION_EXPIRED = "Sua sessão expirou. Entre novamente.";

// A API (FastAPI) explica o erro em `detail`, em português. Só texto é mostrado: o formato
// de lista do 422 do Pydantic cai na mensagem genérica.
export function errorMessageFor(
  status: number,
  body: unknown,
  fallback: string,
): string {
  if (status === 401) return SESSION_EXPIRED;
  const detail =
    typeof body === "object" && body !== null
      ? (body as { detail?: unknown }).detail
      : undefined;
  return typeof detail === "string" && detail.trim() ? detail : fallback;
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
        `Não foi possível concluir a solicitação (${response.status}). Tente novamente.`,
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
    xhr.onerror = () => reject(new Error("Falha de conexão durante o envio."));
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
              `Envio recusado (${xhr.status}). Verifique o arquivo e tente novamente.`,
            ),
          ),
        );
      }
      try {
        resolve(JSON.parse(xhr.responseText) as T);
      } catch {
        reject(new Error("Resposta inválida da API."));
      }
    };
    if (signal?.aborted)
      return reject(new DOMException("Envio cancelado", "AbortError"));
    xhr.send(formData);
  });
}
