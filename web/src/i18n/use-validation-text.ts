"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { isValidationMessage, validationKey } from "./validation";

// Traduz a mensagem de um erro de schema (chave `validation:...`); texto comum passa como está.
export function useValidationText() {
  const t = useTranslations("errors.validation");
  return useCallback(
    (message?: string) =>
      message && isValidationMessage(message)
        ? t(validationKey(message))
        : message,
    [t],
  );
}
