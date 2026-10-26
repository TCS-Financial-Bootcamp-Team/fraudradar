export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const USA_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

async function cabecalhos() {
  const headers = new Headers();
  if (typeof window !== "undefined") {
    const { configuracaoSupabase } = await import("./supabase/config");
    if (configuracaoSupabase()) {
      const { clienteSupabase } = await import("./supabase/client");
      const { data } = await clienteSupabase().auth.getSession();
      if (data.session)
        headers.set("Authorization", `Bearer ${data.session.access_token}`);
    }
  }
  return headers;
}

async function requisitar<T>(
  caminho: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = await cabecalhos();
  new Headers(init.headers).forEach((valor, nome) => headers.set(nome, valor));
  const resp = await fetch(`${API_URL}${caminho}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!resp.ok) {
    throw new Error(
      resp.status === 401
        ? "Sua sessão expirou. Entre novamente."
        : `Não foi possível concluir a solicitação (${resp.status}). Tente novamente.`,
    );
  }
  return (await resp.json()) as T;
}

export function apiGet<T>(caminho: string, init?: RequestInit) {
  return requisitar<T>(caminho, init);
}
export function apiPost<T>(
  caminho: string,
  dados: unknown,
  signal?: AbortSignal,
) {
  return requisitar<T>(caminho, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
    signal,
  });
}
export async function apiMultipart<T>(
  caminho: string,
  dados: FormData,
  progresso: (valor: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  const headers = await cabecalhos();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${caminho}`);
    headers.forEach((valor, nome) => xhr.setRequestHeader(nome, valor));
    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable)
        progresso(Math.round((evento.loaded / evento.total) * 100));
    };
    const abortar = () => xhr.abort();
    signal?.addEventListener("abort", abortar, { once: true });
    xhr.onloadend = () => signal?.removeEventListener("abort", abortar);
    xhr.onerror = () => reject(new Error("Falha de conexão durante o envio."));
    xhr.onabort = () =>
      reject(new DOMException("Envio cancelado", "AbortError"));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300)
        return reject(
          new Error(
            `Envio recusado (${xhr.status}). Verifique o arquivo e tente novamente.`,
          ),
        );
      try {
        resolve(JSON.parse(xhr.responseText) as T);
      } catch {
        reject(new Error("Resposta inválida da API."));
      }
    };
    if (signal?.aborted)
      return reject(new DOMException("Envio cancelado", "AbortError"));
    xhr.send(dados);
  });
}
