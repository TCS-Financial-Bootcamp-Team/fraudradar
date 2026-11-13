import type { AppLocale } from "./config";
import type { AppMessages } from "./messages";

// Tipa `t("chave")`: chave inexistente em pt-BR falha no `pnpm build`.
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: AppMessages;
  }
}
