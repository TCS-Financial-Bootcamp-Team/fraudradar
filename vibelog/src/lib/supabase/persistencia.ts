import { parseCookieHeader, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";

export const COOKIE_PREFERENCIA = "vl_manter_conectado";
export const DURACAO_SESSAO = 60 * 60 * 24 * 365;
export function manterConectado(cookies: { name: string; value: string }[]) {
  return cookies.find((c) => c.name === COOKIE_PREFERENCIA)?.value !== "0";
}
export function opcoesSessao(
  options: CookieOptions,
  persistente: boolean,
  value: string,
): CookieOptions {
  // Exclusões e limpeza de chunks precisam manter sua expiração imediata.
  if (!value || options.maxAge === 0) return options;
  const resultado = { ...options };
  delete resultado.expires;
  if (persistente) resultado.maxAge = DURACAO_SESSAO;
  else delete resultado.maxAge;
  return resultado;
}
export function definirPersistencia(persistente: boolean) {
  document.cookie = serializeCookieHeader(COOKIE_PREFERENCIA, persistente ? "1" : "0", {
    path: "/",
    sameSite: "lax",
    secure: location.protocol === "https:",
    maxAge: DURACAO_SESSAO,
  });
}
export const cookiesNavegador = {
  getAll: () => parseCookieHeader(document.cookie),
  setAll: (valores: { name: string; value: string; options: CookieOptions }[]) => {
    const persistente = manterConectado(parseCookieHeader(document.cookie));
    valores.forEach(({ name, value, options }) => {
      document.cookie = serializeCookieHeader(
        name,
        value,
        opcoesSessao(options, persistente, value),
      );
    });
  },
};
