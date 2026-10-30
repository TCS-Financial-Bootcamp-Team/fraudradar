"use client";
import { ResourceError } from "@/components/ui/states";
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-xl p-6">
      <ResourceError
        message="Ocorreu uma falha inesperada. Tente carregar a página novamente."
        onRetry={reset}
      />
    </main>
  );
}
