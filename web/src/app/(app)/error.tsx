"use client";
import { ErroRecurso } from "@/components/ui/estados";
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErroRecurso
      mensagem="Ocorreu uma falha ao abrir esta área. Tente novamente."
      tentar={reset}
    />
  );
}
