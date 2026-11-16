"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { createFormatters } from "@/lib/format";

// Número, moeda, percentual e data no idioma ativo (moeda sempre GBP).
export function useFormatters() {
  const locale = useLocale();
  return useMemo(() => createFormatters(locale), [locale]);
}
