export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function apiGet<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_URL}${caminho}`, { ...init, cache: "no-store" });
  if (!resp.ok) {
    throw new Error(`GET ${caminho} falhou: ${resp.status}`);
  }
  return (await resp.json()) as T;
}
