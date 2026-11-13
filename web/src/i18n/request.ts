import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, resolveLocale } from "./config";
import { catalogs } from "./messages";

// Sem idioma na URL: o idioma vem do cookie NEXT_LOCALE (padrão pt-BR).
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  return { locale, messages: catalogs[locale], timeZone: "UTC" };
});
