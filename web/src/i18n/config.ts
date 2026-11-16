// Idiomas do front. PT-BR é o padrão e a fonte das traduções (messages/pt-BR).
export const LOCALES = ["pt-BR", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "pt-BR";
export const LOCALE_COOKIE = "NEXT_LOCALE";
// Um ano, em segundos.
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Cookie ausente ou com valor desconhecido cai no padrão.
export function resolveLocale(value: string | null | undefined): AppLocale {
  return (LOCALES as readonly string[]).includes(value ?? "")
    ? (value as AppLocale)
    : DEFAULT_LOCALE;
}

// Grava o cookie do idioma (só no navegador): um ano, em todo o site, SameSite=Lax.
export function writeLocaleCookie(locale: AppLocale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; max-age=${LOCALE_COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}
