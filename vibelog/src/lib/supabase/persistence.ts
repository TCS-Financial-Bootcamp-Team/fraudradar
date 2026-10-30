import { parseCookieHeader, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";

export const PREFERENCE_COOKIE = "vl_keep_signed_in";
export const SESSION_DURATION = 60 * 60 * 24 * 365;
export function shouldKeepSignedIn(cookies: { name: string; value: string }[]) {
  return cookies.find((c) => c.name === PREFERENCE_COOKIE)?.value !== "0";
}
export function sessionCookieOptions(
  options: CookieOptions,
  persistent: boolean,
  value: string,
): CookieOptions {
  // Exclusões e limpeza de chunks precisam manter sua expiração imediata.
  if (!value || options.maxAge === 0) return options;
  const nextOptions = { ...options };
  delete nextOptions.expires;
  if (persistent) nextOptions.maxAge = SESSION_DURATION;
  else delete nextOptions.maxAge;
  return nextOptions;
}
export function setPersistence(persistent: boolean) {
  document.cookie = serializeCookieHeader(PREFERENCE_COOKIE, persistent ? "1" : "0", {
    path: "/",
    sameSite: "lax",
    secure: location.protocol === "https:",
    maxAge: SESSION_DURATION,
  });
}
export const browserCookies = {
  getAll: () => parseCookieHeader(document.cookie),
  setAll: (entries: { name: string; value: string; options: CookieOptions }[]) => {
    const persistent = shouldKeepSignedIn(parseCookieHeader(document.cookie));
    entries.forEach(({ name, value, options }) => {
      document.cookie = serializeCookieHeader(
        name,
        value,
        sessionCookieOptions(options, persistent, value),
      );
    });
  },
};
