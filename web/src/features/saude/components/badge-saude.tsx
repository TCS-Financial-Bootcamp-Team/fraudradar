"use client";
import { useSaude } from "../hooks/use-saude";
export function BadgeSaude() {
  const { estado, recarregar } = useSaude();
  const ok = estado.tipo === "ok" && estado.saude.status === "ok";
  return (
    <button
      title="Atualizar saúde do sistema"
      onClick={recarregar}
      className="flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-[11px] text-muted-foreground"
    >
      <span
        className={`size-1.5 rounded-full ${ok ? "bg-primary" : "bg-risk-medium"}`}
      />
      {estado.tipo === "carregando"
        ? "Verificando sistema…"
        : ok
          ? "Sistema operacional"
          : estado.tipo === "erro"
            ? "API indisponível"
            : "Sistema degradado"}
    </button>
  );
}
