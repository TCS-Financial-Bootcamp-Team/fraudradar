"use client";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Campo, Select, Textarea } from "@/components/ui/campo";
import { Carregando, ErroRecurso } from "@/components/ui/estados";
import { Chat } from "@/features/assistente/components/assistente";
import { moeda, dataCurta } from "@/lib/formatacao";
import { useDetalhe } from "../hooks/use-alertas";
import { decisaoSchema, type Decisao } from "../schemas/alertas";
import { Score, rotulosStatus } from "./tabela-alertas";
import { GrafoContas } from "./grafo-contas";

export function DetalheAlerta({ id }: { id: string }) {
  const recurso = useDetalhe(id);
  const form = useForm<Decisao>({
    resolver: zodResolver(decisaoSchema),
    defaultValues: { decisao: "aprofundar", justificativa: "" },
  });
  if (recurso.carregando) return <Carregando />;
  if (recurso.erro || !recurso.dados)
    return (
      <ErroRecurso
        mensagem={recurso.erro ?? "Alerta não encontrado."}
        tentar={recurso.recarregar}
      />
    );
  const { detalhe: a, grafo } = recurso.dados;
  return (
    <>
      <Link
        className="flex w-fit items-center gap-2 text-xs text-muted-foreground hover:text-primary"
        href="/alertas"
      >
        <ArrowLeft className="size-3" />
        Voltar para a fila
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow !mt-0 mb-2">Dossiê de investigação</p>
          <h1>
            {a.id}{" "}
            <span className="font-normal text-muted-foreground">
              / {a.conta}
            </span>
          </h1>
          <p>
            {a.pais} · Semana de {dataCurta(a.semana)} ·{" "}
            {rotulosStatus[a.status]}
          </p>
        </div>
        <Link
          className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-xs text-primary"
          href="/comunicacoes"
        >
          <FileText className="size-4" />
          Comunicações
        </Link>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-6">
          <section className="panel grid gap-6 p-6 sm:grid-cols-3">
            <div>
              <p className="eyebrow mb-3">Score de risco</p>
              <Score valor={a.score} />
              <p className="mt-2 text-xs text-muted-foreground">
                {a.tipologia}
              </p>
            </div>
            <div>
              <p className="eyebrow mb-3">Volume sinalizado</p>
              <p className="text-xl font-semibold">{moeda(a.valor)}</p>
            </div>
            <div>
              <p className="eyebrow mb-3">Movimentações</p>
              <p className="text-xl font-semibold">{a.transacoes}</p>
            </div>
          </section>
          <section className="panel">
            <h2 className="panel-title">O que contribuiu para o score</h2>
            <div className="grid gap-5 p-6">
              {a.contribuicoes.map((c) => (
                <div key={c.nome}>
                  <div className="mb-2 flex justify-between gap-4 text-xs">
                    <span>{c.nome}</span>
                    <strong>{c.valor}%</strong>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: c.valor + "%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2 className="panel-title">Regras acionadas</h2>
            <ul className="divide-y px-6">
              {a.regras.map((r) => (
                <li key={r.codigo} className="flex gap-4 py-4 text-sm">
                  <span className="font-mono text-xs text-primary">
                    {r.codigo}
                  </span>
                  <span>{r.descricao}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel overflow-hidden">
            <div className="panel-title">
              <h2>Conexões da conta</h2>
              <span className="text-xs font-normal text-muted-foreground">
                Até 2 saltos · pseudonimizado
              </span>
            </div>
            <GrafoContas grafo={grafo} />
          </section>
          <section className="panel overflow-hidden">
            <h2 className="panel-title">Transações vinculadas</h2>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Origem → destino</th>
                    <th>Valor</th>
                    <th>Meio</th>
                  </tr>
                </thead>
                <tbody>
                  {a.movimentacoes.map((m) => (
                    <tr key={m.id}>
                      <td>{dataCurta(m.data)}</td>
                      <td className="font-mono text-xs">
                        {m.origem} → {m.destino}
                      </td>
                      <td>
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: m.moeda,
                        }).format(m.valor)}
                      </td>
                      <td>{m.meio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>Parecer assistido por IA</h2>
              <Button
                size="sm"
                variant="outline"
                disabled={recurso.ocupado}
                onClick={() => void recurso.gerarParecer()}
              >
                <Sparkles />
                {recurso.ocupado
                  ? "Aguarde…"
                  : a.parecer
                    ? "Gerar novamente"
                    : "Gerar parecer"}
              </Button>
            </div>
            <div className="p-6">
              {a.parecer ? (
                <>
                  <p className="whitespace-pre-line text-sm leading-relaxed">
                    {a.parecer.texto}
                  </p>
                  <ul className="mt-6 space-y-4 border-t pt-5">
                    {a.parecer.fontes.map((f) => (
                      <li key={f.titulo} className="text-xs">
                        <strong>{f.titulo}</strong>
                        <p className="mt-1 leading-relaxed text-muted-foreground">
                          {f.trecho}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Gere uma síntese das evidências com fontes para apoiar sua
                  revisão.
                </p>
              )}
            </div>
          </section>
          <section className="panel">
            <h2 className="panel-title">Registrar decisão</h2>
            <form
              className="grid gap-5 p-6"
              onSubmit={form.handleSubmit(recurso.decidir)}
            >
              <Campo
                nome="Encaminhamento"
                erro={form.formState.errors.decisao?.message}
              >
                <Select {...form.register("decisao")}>
                  <option value="aprofundar">Aprofundar investigação</option>
                  <option value="arquivar">Arquivar alerta</option>
                  <option value="comunicar">
                    Preparar comunicação ao COAF
                  </option>
                </Select>
              </Campo>
              <Campo
                nome="Justificativa obrigatória"
                erro={form.formState.errors.justificativa?.message}
              >
                <Textarea
                  maxLength={4000}
                  placeholder="Descreva as evidências e o motivo da decisão…"
                  {...form.register("justificativa")}
                />
              </Campo>
              <p className="text-xs text-muted-foreground">
                Comunicar prepara um rascunho para aprovação. Nada é enviado de
                verdade.
              </p>
              <Button
                type="submit"
                className="justify-self-start"
                disabled={recurso.ocupado}
              >
                {recurso.ocupado ? "Registrando…" : "Registrar decisão"}
              </Button>
            </form>
          </section>
        </div>
        <section className="panel flex h-[640px] flex-col overflow-hidden xl:sticky xl:top-24">
          <h2 className="panel-title">
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Converse sobre este caso
            </span>
          </h2>
          <Chat key={id} alertaId={id} />
        </section>
      </div>
    </>
  );
}
