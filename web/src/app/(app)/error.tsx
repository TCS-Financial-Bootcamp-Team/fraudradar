"use client";

import { useTranslations } from "next-intl";
import { ResourceError } from "@/components/ui/states";
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("shell.errorPages");
  return (
    <ResourceError
      message={t("area")}
      onRetry={reset}
    />
  );
}
