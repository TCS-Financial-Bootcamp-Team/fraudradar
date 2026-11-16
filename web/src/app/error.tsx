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
    <main className="mx-auto max-w-xl p-6">
      <ResourceError
        message={t("unexpected")}
        onRetry={reset}
      />
    </main>
  );
}
