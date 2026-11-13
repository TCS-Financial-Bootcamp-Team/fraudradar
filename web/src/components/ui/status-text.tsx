"use client";

import { useTranslations } from "next-intl";

// Texto de estado para os fallbacks de Suspense dos layouts do servidor.
export function StatusText({
  message,
  className,
}: {
  message:
    | "loadingSession"
    | "openingPanel"
    | "loadingLogin"
    | "loadingSignup"
    | "loadingRecovery"
    | "loadingAlert";
  className?: string;
}) {
  const t = useTranslations("shell.states");
  return (
    <p role="status" className={className}>
      {t(message)}
    </p>
  );
}
