import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { getT } from "./runtime";
import type { AppLocale } from "./config";

// Mensagens que o servidor (API e worker) monta em português vêm com um `code` estável e
// `params`. A chave da tradução é o código com tudo que não é letra/número trocado por `_`
// (`retrain.no_labels` → `errors.api.retrain_no_labels`). Código sem tradução: vale o texto em
// português que o servidor mandou.
export const serverMessageKey = (code: string) =>
  code.replace(/[^A-Za-z0-9_]/g, "_");

type Params = Record<string, unknown> | null | undefined;

// Para código fora do React (serviços): usa o idioma do <html lang>.
export function translateServerMessage(
  code: string | null | undefined,
  params: Params,
  fallback: string | null | undefined,
  locale?: AppLocale,
): string | null {
  if (code) {
    const t = getT("errors.api", locale);
    const key = serverMessageKey(code);
    if (t.has(key as never)) return t(key as never, (params ?? {}) as never);
  }
  return fallback ?? null;
}

// Para componentes.
export function useServerMessage() {
  const t = useTranslations("errors.api");
  return useCallback(
    (
      code: string | null | undefined,
      params: Params,
      fallback: string | null | undefined,
    ): string | null => {
      if (code) {
        const key = serverMessageKey(code);
        if (t.has(key as never)) return t(key as never, (params ?? {}) as never);
      }
      return fallback ?? null;
    },
    [t],
  );
}
