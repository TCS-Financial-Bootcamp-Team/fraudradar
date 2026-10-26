"use client";
import { ErroRecurso } from "@/components/ui/estados";
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-xl p-6">
      <ErroRecurso
        mensagem="Ocorreu uma falha inesperada. Tente carregar a página novamente."
        tentar={reset}
      />
    </main>
  );
}
