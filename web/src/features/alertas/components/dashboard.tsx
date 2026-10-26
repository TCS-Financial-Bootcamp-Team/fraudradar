"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  FileCheck2,
  Radar,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Carregando, ErroRecurso } from "@/components/ui/estados";
import { BadgeSaude } from "@/features/saude/components/badge-saude";
import { moeda, numero, percentual } from "@/lib/formatacao";
import { useFila, useMonitoramento, useReplay } from "../hooks/use-alertas";
import { Grafico } from "./graficos";
import { TabelaAlertas } from "./tabela-alertas";

export function Dashboard() {
  const recurso = useMonitoramento();
  const fila = useFila();
  const replay = useReplay();
  if (recurso.carregando) return <Carregando />;
  if (recurso.erro || !recurso.dados)
    return (
      <ErroRecurso
        mensagem={recurso.erro ?? "Dados indisponíveis."}
        tentar={recurso.recarregar}
      />
    );
  const d = recurso.dados;
  const kpis = [
    {
      nome: "Alertas da semana",
      valor: numero(d.indicadores.alertas),
      apoio: "Casos para análise",
      icone: Radar,
    },
    {
      nome: "Alertas revisados",
      valor: numero(d.indicadores.revisados),
      apoio: "Com decisão registrada",
      icone: CircleCheck,
    },
    {
      nome: "Comunicados ao COAF",
      valor: numero(d.indicadores.comunicados),
      apoio: "Aprovações simuladas",
      icone: FileCheck2,
    },
    {
      nome: "Taxa de alerta",
      valor: percentual(d.indicadores.taxa_alerta),
      apoio: "Das transações processadas",
      icone: ArrowUpRight,
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow !mt-0 mb-2">Centro de operações</p>
          <h1>Visão geral</h1>
          <p>O que precisa da sua atenção, em um só lugar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BadgeSaude />
          <Button
            disabled={replay.ocupado}
            onClick={() => void replay.processar()}
          >
            <RefreshCw className={replay.ocupado ? "animate-spin" : ""} />
            {replay.ocupado ? "Processando…" : "Processar próxima semana"}
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ nome, valor, apoio, icone: Icone }) => (
          <article key={nome} className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-medium text-muted-foreground">
                {nome}
              </h2>
              <Icone className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-5 text-3xl font-semibold tracking-tight">
              {valor}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">{apoio}</p>
          </article>
        ))}
      </div>
      <section className="panel flex flex-wrap items-center justify-between gap-5 border-l-[3px] border-l-primary p-5">
        <div className="flex items-center gap-4">
          <span className="rounded-xl bg-accent p-3 text-primary">
            <Wallet className="size-5" />
          </span>
          <div>
            <h2 className="text-xs text-muted-foreground">
              Valor total sinalizado
            </h2>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {moeda(d.indicadores.valor_sinalizado)}
            </p>
          </div>
        </div>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Volume financeiro vinculado aos alertas. Um sinal para investigação,
          sem presunção de ilícito.
        </p>
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Grafico
          titulo="Evolução de alertas · últimas semanas"
          dados={d.semanas}
          tipo="area"
        />
        <Grafico
          titulo="Distribuição por tipologia"
          dados={d.tipologias}
          tipo="donut"
        />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_2fr]">
        <Grafico titulo="Países com mais alertas" dados={d.paises} />
        <section className="panel overflow-hidden">
          <div className="panel-title">
            <h2>Alertas recentes</h2>
            <Link
              className="flex items-center gap-2 text-xs text-primary"
              href="/alertas"
            >
              Ver fila
              <ArrowRight className="size-3" />
            </Link>
          </div>
          {fila.carregando ? (
            <p className="p-6 text-sm">Carregando alertas…</p>
          ) : fila.erro ? (
            <ErroRecurso mensagem={fila.erro} tentar={fila.recarregar} />
          ) : (
            <TabelaAlertas itens={fila.dados?.itens.slice(0, 5) ?? []} />
          )}
        </section>
      </div>
    </>
  );
}
