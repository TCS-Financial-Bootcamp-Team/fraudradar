import {
  parseCookieHeader,
  serializeCookieHeader,
  type CookieOptions,
} from "@supabase/ssr";

export const KEEP_SIGNED_IN_COOKIE = "fr_keep_signed_in";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;
export function shouldKeepSignedIn(cookies: { name: string; value: string }[]) {
  return cookies.find((c) => c.name === KEEP_SIGNED_IN_COOKIE)?.value !== "0";
}
export function getSessionCookieOptions(
  options: CookieOptions,
  persistent: boolean,
  value: string,
): CookieOptions {
  // Exclusões e limpeza de chunks precisam manter sua expiração imediata.
  if (!value || options.maxAge === 0) return options;
  const nextOptions = { ...options };
  delete nextOptions.expires;
  if (persistent) nextOptions.maxAge = SESSION_MAX_AGE;
  else delete nextOptions.maxAge;
  return nextOptions;
}
export function setKeepSignedIn(persistent: boolean) {
  document.cookie = serializeCookieHeader(
    KEEP_SIGNED_IN_COOKIE,
    persistent ? "1" : "0",
    {
      path: "/",
      sameSite: "lax",
      secure: location.protocol === "https:",
      maxAge: SESSION_MAX_AGE,
    },
  );
}
export const browserCookies = {
  getAll: () => parseCookieHeader(document.cookie),
  setAll: (
    cookiesToSet: { name: string; value: string; options: CookieOptions }[],
  ) => {
    const persistent = shouldKeepSignedIn(parseCookieHeader(document.cookie));
    cookiesToSet.forEach(({ name, value, options }) => {
      document.cookie = serializeCookieHeader(
        name,
        value,
        getSessionCookieOptions(options, persistent, value),
      );
    });
  },
};
