"use client";
import { ResourceError } from "@/components/ui/states";
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ResourceError
      message="Ocorreu uma falha ao abrir esta área. Tente novamente."
      onRetry={reset}
    />
  );
}
