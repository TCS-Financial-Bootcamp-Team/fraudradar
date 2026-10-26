"use client";
import { Carregando, ErroRecurso } from "@/components/ui/estados";
import { percentual } from "@/lib/formatacao";
import { useMonitoramento } from "../hooks/use-alertas";
import { Grafico } from "./graficos";
export function Monitoramento() {
  const r = useMonitoramento();
  if (r.carregando) return <Carregando />;
  if (r.erro || !r.dados)
    return (
      <ErroRecurso
        mensagem={r.erro ?? "Dados indisponíveis."}
        tentar={r.recarregar}
      />
    );
  const d = r.dados;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow !mt-0 mb-2">Qualidade do monitoramento</p>
          <h1>Performance sob observação</h1>
          <p>Acompanhe a cobertura da fila e a qualidade das sugestões.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            nome: "Recall da fila",
            valor: d.indicadores.recall,
            texto: "Cobertura dos casos conhecidos na avaliação.",
          },
          {
            nome: "Acerto de tipologia do LLM",
            valor: d.indicadores.acerto_tipologia,
            texto: "Concordância com as tipologias da avaliação.",
          },
          {
            nome: "Taxa de alerta",
            valor: d.indicadores.taxa_alerta,
            texto: "Proporção de transações que geraram alertas.",
          },
        ].map((k) => (
          <article className="panel p-6" key={k.nome}>
            <h2 className="text-sm text-muted-foreground">{k.nome}</h2>
            <p className="my-5 text-4xl font-semibold tracking-tight">
              {percentual(k.valor)}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {k.texto}
            </p>
          </article>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Grafico titulo="Taxa de alerta por país" dados={d.taxa_paises} taxa />
        <Grafico
          titulo="Taxa de alerta por meio de pagamento"
          dados={d.taxa_meios}
          taxa
        />
      </div>
      <p className="notice">
        Métricas de avaliação são calculadas pela API sobre a base de
        referência. Elas não alteram o score nem constituem uma confirmação de
        ilícito.
      </p>
    </>
  );
}
