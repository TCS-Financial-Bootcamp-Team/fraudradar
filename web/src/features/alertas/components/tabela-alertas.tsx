import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { moeda } from "@/lib/formatacao";
import { Vazio } from "@/components/ui/estados";
import type { Alerta } from "../schemas/alertas";

export const rotulosStatus = {
  pendente: "Pendente",
  aprofundar: "Em investigação",
  arquivado: "Arquivado",
  comunicar: "Para comunicação",
};
export function Score({ valor }: { valor: number }) {
  const risco =
    valor >= 90
      ? "critical"
      : valor >= 70
        ? "high"
        : valor >= 45
          ? "medium"
          : "low";
  const rotulo = {
    critical: "Crítico",
    high: "Alto",
    medium: "Médio",
    low: "Baixo",
  }[risco];
  return (
    <div
      className="flex min-w-28 items-center gap-3"
      style={{ color: `var(--risk-${risco})` }}
    >
      <span className="w-7 font-mono text-sm font-semibold">{valor}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-current"
          style={{ width: valor + "%" }}
        />
      </div>
      <span className="sr-only">{rotulo}</span>
    </div>
  );
}
export function TabelaAlertas({ itens }: { itens: Alerta[] }) {
  if (!itens.length) return <Vazio titulo="Nenhum alerta nesta seleção" />;
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <caption className="sr-only">
          Alertas ordenados por score de risco
        </caption>
        <thead>
          <tr>
            <th>Alerta / conta</th>
            <th>Score de risco</th>
            <th>Tipologia sugerida</th>
            <th>País</th>
            <th>Valor sinalizado</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Ação</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((a) => (
            <tr key={a.id}>
              <td>
                <Link
                  href={"/alertas/" + a.id}
                  className="font-semibold text-primary hover:underline"
                >
                  {a.id}
                </Link>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {a.conta}
                </p>
              </td>
              <td>
                <Score valor={a.score} />
              </td>
              <td>{a.tipologia}</td>
              <td>{a.pais}</td>
              <td className="font-medium">{moeda(a.valor)}</td>
              <td>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${a.status === "pendente" ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground"}`}
                >
                  {rotulosStatus[a.status]}
                </span>
              </td>
              <td>
                <Link
                  href={"/alertas/" + a.id}
                  aria-label={"Abrir alerta " + a.id}
                >
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
