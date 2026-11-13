import {
  createTranslator,
  type NamespaceKeys,
  type NestedKeyOf,
} from "next-intl";
import { DEFAULT_LOCALE, resolveLocale, type AppLocale } from "./config";
import { catalogs, type AppMessages } from "./messages";

// Para código fora do React (serviços, notify): lê o idioma que o servidor pôs em <html lang>.
// No servidor e nos testes não há documento: vale o padrão pt-BR.
export function currentLocale(): AppLocale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  return resolveLocale(document.documentElement.lang);
}

export function getT<NS extends NamespaceKeys<AppMessages, NestedKeyOf<AppMessages>>>(
  namespace: NS,
  locale: AppLocale = currentLocale(),
) {
  return createTranslator({
    locale,
    messages: catalogs[locale],
    namespace,
    timeZone: "UTC",
    onError: () => {},
  });
}
