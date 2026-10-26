"use client";
import { useState } from "react";
import { CheckCheck, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Campo, Textarea } from "@/components/ui/campo";
import { Carregando, ErroRecurso, Vazio } from "@/components/ui/estados";
import { useComunicacoes } from "../hooks/use-alertas";
import { aprovacaoSchema, type Comunicacao } from "../schemas/alertas";
import { dataCurta } from "@/lib/formatacao";

function Editor({
  item,
  aprovar,
  ocupado,
}: {
  item: Comunicacao;
  aprovar: (id: string, texto: string) => Promise<void>;
  ocupado: boolean;
}) {
  const [texto, setTexto] = useState(item.texto);
  const [erro, setErro] = useState("");
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>{item.alerta_id}</h2>
        <span className="text-xs font-normal text-muted-foreground">
          {item.status === "aprovada" ? "Aprovada" : "Rascunho"}
        </span>
      </div>
      <form
        className="grid gap-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const validacao = aprovacaoSchema.safeParse({ texto });
          if (!validacao.success) {
            setErro(validacao.error.issues[0].message);
            return;
          }
          setErro("");
          void aprovar(item.alerta_id, texto);
        }}
      >
        <Campo nome="Relato da comunicação" erro={erro}>
          <Textarea
            className="min-h-[400px] font-mono text-xs leading-loose"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={item.status === "aprovada"}
            maxLength={20000}
          />
        </Campo>
        <p className="text-xs text-muted-foreground">
          Revise fatos, evidências e justificativa. Aprovar apenas registra sua
          revisão neste ambiente.
        </p>
        <Button
          type="submit"
          className="justify-self-start"
          disabled={ocupado || item.status === "aprovada"}
        >
          <CheckCheck />
          {ocupado
            ? "Aprovando…"
            : item.status === "aprovada"
              ? "Revisão aprovada"
              : "Aprovar rascunho"}
        </Button>
      </form>
    </section>
  );
}
export function Comunicacoes() {
  const r = useComunicacoes();
  const [selecionado, setSelecionado] = useState("");
  if (r.carregando) return <Carregando />;
  if (r.erro || !r.dados)
    return (
      <ErroRecurso
        mensagem={r.erro ?? "Dados indisponíveis."}
        tentar={r.recarregar}
      />
    );
  const atual = r.dados.find((c) => c.alerta_id === selecionado) ?? r.dados[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow !mt-0 mb-2">Revisão e aprovação</p>
          <h1>Comunicações ao COAF</h1>
          <p>Rascunhos fundamentados, sob responsabilidade de quem revisa.</p>
        </div>
      </div>
      <p className="notice border-primary/30 bg-accent text-accent-foreground">
        <strong>Ambiente acadêmico: nada é enviado de verdade.</strong> A
        aprovação é uma simulação e não comunica operações ao COAF.
      </p>
      {!atual ? (
        <section className="panel">
          <Vazio
            titulo="Nenhuma comunicação nesta semana"
            descricao="Encaminhe um alerta para comunicação e revise o rascunho aqui."
          />
        </section>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <section className="panel overflow-hidden">
            <h2 className="panel-title">Documentos · {r.dados.length}</h2>
            <div className="grid p-2">
              {r.dados.map((c) => (
                <button
                  aria-pressed={atual.alerta_id === c.alerta_id}
                  key={c.alerta_id}
                  onClick={() => setSelecionado(c.alerta_id)}
                  className={`flex gap-3 rounded-lg p-4 text-left hover:bg-muted ${atual.alerta_id === c.alerta_id ? "bg-accent" : ""}`}
                >
                  <FileText className="mt-1 size-4 shrink-0 text-primary" />
                  <span>
                    <strong className="text-sm">{c.alerta_id}</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {c.status === "aprovada"
                        ? "Aprovada"
                        : "Aguardando revisão"}{" "}
                      · {dataCurta(c.atualizado_em)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <Editor
            key={atual.alerta_id + atual.status}
            item={atual}
            aprovar={r.aprovar}
            ocupado={r.ocupado}
          />
        </div>
      )}
    </>
  );
}
