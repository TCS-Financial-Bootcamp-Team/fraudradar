"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  GitBranch,
  Search,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  CornerDownRight,
  CheckCheck,
  Flag,
  Network,
  List,
  Monitor,
  LogOut,
  SlidersHorizontal,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tema } from "@/components/providers";
import { useAuth } from "@/features/autenticacao/hooks/use-auth";
import { useRegistros, useFilhos, useDetalhe, useLista } from "../hooks/use-registros";
import { areas, tipos, rotulos, type Resumo, type Visao, type Filtros } from "../schemas";
import { Detalhe } from "./detalhe";
const icones = {
  prompt_humano: MessageSquare,
  prompt_ia: CornerDownRight,
  resposta: CheckCheck,
  marco: Flag,
};
export function IconeTipo({ tipo }: { tipo: Resumo["tipo"] }) {
  const Icone = icones[tipo];
  return (
    <span className={`tipo-icon tipo-${tipo}`}>
      <Icone size={15} />
    </span>
  );
}
export function Data({ valor }: { valor: string }) {
  return (
    <time dateTime={valor}>
      {new Date(valor).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      })}
    </time>
  );
}
type Contexto = {
  visao: Visao;
  selecionado: string | null;
  selecionar: (id: string) => void;
  filtrado: boolean;
  expandidos: Set<string>;
};
function Estado({ erro, recarregar }: { erro?: string; recarregar: () => void }) {
  return (
    <div className="p-6 text-sm text-muted-foreground">
      {erro ? (
        <>
          <p>{erro}</p>
          <Button variant="outline" className="mt-3" onClick={recarregar}>
            <RefreshCw size={14} />
            Tentar novamente
          </Button>
        </>
      ) : (
        "Carregando registros…"
      )}
    </div>
  );
}
function Ramo({ no, ctx, caminho = [] }: { no: Resumo; ctx: Contexto; caminho?: string[] }) {
  const [aberto, setAberto] = useState(false);
  const [fechado, setFechado] = useState(false);
  const filhos = ctx.visao.indice.filter((n) => n.pai_id === no.id);
  const expandido =
    aberto ||
    (!fechado &&
      (ctx.expandidos.has(no.id) ||
        (ctx.filtrado && filhos.some((n) => ctx.visao.visiveis.includes(n.id)))));
  const consulta = useFilhos(no.id, expandido && filhos.length > 0);
  const corresponde = ctx.visao.correspondencias.includes(no.id);
  if (caminho.includes(no.id)) return null;
  return (
    <li>
      <div
        className={`tree-row ${ctx.selecionado === no.id ? "selected" : ""} ${!corresponde ? "ancestor" : ""}`}
      >
        <button
          className="expand"
          aria-label={`${expandido ? "Recolher" : "Expandir"} ${no.titulo}`}
          aria-expanded={filhos.length ? expandido : undefined}
          disabled={!filhos.length}
          onClick={() => {
            setAberto(!expandido);
            setFechado(expandido);
          }}
        >
          {filhos.length ? (
            expandido ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span className={`area-dot area-${no.area}`} />
          )}
        </button>
        <button
          className="node-button"
          onClick={() => ctx.selecionar(no.id)}
          aria-current={ctx.selecionado === no.id ? "true" : undefined}
        >
          <div className="flex items-start gap-2">
            <IconeTipo tipo={no.tipo} />
            <span className="node-title">{no.titulo}</span>
          </div>
          <div className="node-meta">
            <span className={`area-label area-${no.area}`}>{rotulos[no.area]}</span>
            <span>{no.autor}</span>
            {filhos.length > 0 && <span className="count">{filhos.length}</span>}
          </div>
        </button>
      </div>
      {expandido && filhos.length > 0 && (
        <ul className="tree-children">
          {consulta.data ? (
            consulta.data
              .filter((n) => ctx.visao.visiveis.includes(n.id))
              .map((n) => <Ramo key={n.id} no={n} ctx={ctx} caminho={[...caminho, no.id]} />)
          ) : (
            <Estado erro={consulta.erro} recarregar={consulta.recarregar} />
          )}
        </ul>
      )}
    </li>
  );
}
function Arvore({ ctx }: { ctx: Contexto }) {
  const consulta = useFilhos(null, true);
  if (!consulta.data) return <Estado erro={consulta.erro} recarregar={consulta.recarregar} />;
  return (
    <ul className="tree" aria-label="Árvore de prompts">
      {consulta.data
        .filter((n) => ctx.visao.visiveis.includes(n.id))
        .map((n) => (
          <Ramo key={n.id} no={n} ctx={ctx} />
        ))}
    </ul>
  );
}
function LinhaTempo({ ctx }: { ctx: Contexto }) {
  const [pagina, setPagina] = useState(0);
  const ids = useMemo(
    () =>
      ctx.visao.indice
        .filter((n) => ctx.visao.correspondencias.includes(n.id))
        .sort((a, b) => a.criado_em.localeCompare(b.criado_em) || a.id.localeCompare(b.id))
        .map((n) => n.id),
    [ctx.visao],
  );
  const total = Math.ceil(ids.length / 50);
  const atual = Math.min(pagina, Math.max(0, total - 1));
  const consulta = useLista(ids.slice(atual * 50, atual * 50 + 50));
  return (
    <div className="p-4">
      <p className="eyebrow mb-4">DO PRIMEIRO AO MAIS RECENTE</p>
      {consulta.data ? (
        consulta.data.map((n) => (
          <button
            key={n.id}
            className={`timeline-row ${ctx.selecionado === n.id ? "selected" : ""}`}
            onClick={() => ctx.selecionar(n.id)}
          >
            <IconeTipo tipo={n.tipo} />
            <span className="min-w-0 flex-1">
              <strong className="block text-sm">{n.titulo}</strong>
              <span className="text-xs text-muted-foreground">
                {n.autor} · {rotulos[n.area]}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              <Data valor={n.criado_em} />
            </span>
          </button>
        ))
      ) : (
        <Estado erro={consulta.erro} recarregar={consulta.recarregar} />
      )}
      <div className="mt-4 flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          disabled={atual === 0}
          onClick={() => setPagina(atual - 1)}
        >
          Anterior
        </Button>
        <span className="text-xs">
          {total ? atual + 1 : 0} / {total}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={atual + 1 >= total}
          onClick={() => setPagina(atual + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
export function Explorador({ email }: { email: string }) {
  const r = useRegistros();
  const detalhe = useDetalhe(r.selecionado);
  const { logout } = useAuth();
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const autores = [...new Set(r.data?.indice.map((n) => n.autor) ?? [])].sort();
  const branches = [
    ...new Set(r.data?.indice.map((n) => n.branch).filter((b): b is string => !!b) ?? []),
  ].sort();
  const filtrado = Object.entries(r.filtros).some(([, v]) =>
    Array.isArray(v) ? v.length > 0 : !!v,
  );
  const prompts = r.data?.indice.filter((n) => n.tipo.startsWith("prompt_")) ?? [];
  const selecionar = (id: string) => r.mudar({ no: id });
  const expandidos = new Set(detalhe.data?.ancestrais.map((n) => n.id) ?? []);
  const ctx = r.data
    ? { visao: r.data, selecionado: r.selecionado, selecionar, filtrado, expandidos }
    : null;
  function alterar(chave: keyof Filtros, valor: string) {
    r.mudar({ [chave]: valor });
  }
  return (
    <div className={r.apresentacao ? "app apresentacao" : "app"}>
      <header className="topbar">
        <Link className="brand" href="/">
          <GitBranch size={24} /> VibeLog <span>/ FraudRadar</span>
        </Link>
        <div className="flex items-center gap-1">
          <span className="user-email">{email}</span>
          <Button
            variant={r.apresentacao ? "outline" : "ghost"}
            size="icon"
            aria-label="Modo apresentação"
            aria-pressed={r.apresentacao}
            onClick={() => r.mudar({ apresentacao: r.apresentacao ? "" : "1" })}
          >
            <Monitor size={18} />
          </Button>
          <Tema />
          <Button variant="ghost" size="icon" aria-label="Sair" onClick={logout}>
            <LogOut size={18} />
          </Button>
        </div>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">MEMÓRIA DE CONSTRUÇÃO · BOOTCAMP IA APLICADA</p>
          <h1>De ideia em ideia.</h1>
          <p>As pessoas, os agentes e as decisões por trás do FraudRadar.</p>
        </div>
        <div className="intro-total">
          <strong>{r.data?.indice.length ?? "—"}</strong>
          <span>registros conectados</span>
        </div>
      </section>
      <section className="area-strip" aria-label="Prompts por área">
        {areas.map((a) => {
          const quantidade = prompts.filter((n) => n.area === a).length;
          const ativo = r.filtros.area.includes(a);
          return (
            <button
              key={a}
              aria-pressed={ativo}
              className={`area-card ${ativo ? "active" : ""}`}
              onClick={() =>
                r.mudar({
                  area: ativo ? r.filtros.area.filter((v) => v !== a) : [...r.filtros.area, a],
                })
              }
            >
              <span className={`area-dot area-${a}`} />
              <span>{rotulos[a]}</span>
              <strong>{quantidade}</strong>
              <small>prompts</small>
            </button>
          );
        })}
      </section>
      <section className="author-strip" aria-label="Prompts por autor">
        <span>QUEM CONSTRÓI</span>
        {autores.map((a) => (
          <button
            key={a}
            aria-pressed={r.filtros.autor === a}
            className={r.filtros.autor === a ? "active" : ""}
            onClick={() => alterar("autor", r.filtros.autor === a ? "" : a)}
          >
            {a}
            <b>{prompts.filter((n) => n.autor === a).length}</b>
          </button>
        ))}
      </section>
      <div className="workspace">
        <section className="navigator">
          <div className="navigator-head">
            <div className="flex items-center gap-2">
              <Network size={17} />
              <h2>Registro de construção</h2>
            </div>
            <span className="count">{r.data?.correspondencias.length ?? 0}</span>
          </div>
          <div className="view-tabs" role="group" aria-label="Visualização">
            <Button
              variant={!r.linha ? "outline" : "ghost"}
              size="sm"
              onClick={() => r.mudar({ vista: "" })}
            >
              <GitBranch size={14} />
              Árvore de prompts
            </Button>
            <Button
              variant={r.linha ? "outline" : "ghost"}
              size="sm"
              onClick={() => r.mudar({ vista: "tempo" })}
            >
              <List size={14} />
              Linha do tempo
            </Button>
          </div>
          <form
            className="search-row"
            onSubmit={(e) => {
              e.preventDefault();
              alterar("q", String(new FormData(e.currentTarget).get("q") ?? ""));
            }}
          >
            <Search size={16} />
            <input
              key={r.filtros.q}
              name="q"
              defaultValue={r.filtros.q}
              placeholder="Buscar em títulos e conteúdo…"
              aria-label="Buscar em títulos e conteúdo"
              maxLength={200}
            />
            <Button size="sm" variant="ghost" type="submit">
              Buscar
            </Button>
            <Button
              type="button"
              size="icon"
              variant={filtrosAbertos ? "outline" : "ghost"}
              aria-label="Mostrar filtros"
              aria-expanded={filtrosAbertos}
              onClick={() => setFiltrosAbertos(!filtrosAbertos)}
            >
              <SlidersHorizontal size={16} />
            </Button>
          </form>
          {filtrosAbertos && (
            <div className="filter-grid">
              <label>
                Autor
                <select value={r.filtros.autor} onChange={(e) => alterar("autor", e.target.value)}>
                  <option value="">Todos</option>
                  {autores.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
              <label>
                Tipo
                <select value={r.filtros.tipo} onChange={(e) => alterar("tipo", e.target.value)}>
                  <option value="">Todos</option>
                  {tipos.map((t) => (
                    <option value={t} key={t}>
                      {rotulos[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2">
                Branch
                <select
                  value={r.filtros.branch}
                  onChange={(e) => alterar("branch", e.target.value)}
                >
                  <option value="">Todas</option>
                  {branches.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
              <label>
                De
                <input
                  type="date"
                  value={r.filtros.inicio}
                  onChange={(e) => alterar("inicio", e.target.value)}
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  min={r.filtros.inicio}
                  value={r.filtros.fim}
                  onChange={(e) => alterar("fim", e.target.value)}
                />
              </label>
            </div>
          )}
          {filtrado && (
            <div className="filter-note">
              <span>Ancestrais mantidos para dar contexto.</span>
              <button
                onClick={() =>
                  r.mudar({ area: [], autor: "", tipo: "", branch: "", inicio: "", fim: "", q: "" })
                }
              >
                Limpar filtros
              </button>
            </div>
          )}
          <div className="tree-scroll">
            {ctx ? (
              r.data!.correspondencias.length ? (
                r.linha ? (
                  <LinhaTempo ctx={ctx} />
                ) : (
                  <Arvore ctx={ctx} />
                )
              ) : (
                <div className="empty-small">
                  <Search size={24} />
                  <h3>{filtrado ? "Nenhum registro encontrado" : "A história começa aqui"}</h3>
                  <p>
                    {filtrado
                      ? "Ajuste os filtros para explorar outras conexões."
                      : "Os registros aparecerão aqui quando os agentes publicarem seus prompts e resultados."}
                  </p>
                </div>
              )
            ) : (
              <Estado erro={r.erro} recarregar={r.recarregar} />
            )}
          </div>
          <div className="legend">
            {tipos.map((t) => (
              <span key={t}>
                <IconeTipo tipo={t} />
                {rotulos[t]}
              </span>
            ))}
          </div>
        </section>
        <section className="detail-panel" aria-label="Detalhe do registro">
          {r.selecionado ? (
            detalhe.data ? (
              <Detalhe
                key={r.selecionado}
                data={detalhe.data}
                selecionar={selecionar}
                fechar={() => r.mudar({ no: "" })}
                atualizar={detalhe.recarregar}
              />
            ) : (
              <Estado erro={detalhe.erro} recarregar={detalhe.recarregar} />
            )
          ) : (
            <div className="empty-detail">
              <div className="graph-mark">
                <MessageSquare />
                <span />
                <CornerDownRight />
                <span />
                <CheckCheck />
              </div>
              <p className="eyebrow">CADA CONEXÃO CONTA</p>
              <h2>
                Explore o caminho
                <br />
                até a entrega.
              </h2>
              <p>
                Selecione um registro na árvore para ver o prompt completo, suas conexões e as
                evidências do resultado.
              </p>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <ArrowUpRight size={14} /> Comece por um prompt humano
              </span>
            </div>
          )}
        </section>
      </div>
      <footer>
        VibeLog <span>Uma construção humana, ampliada por IA.</span>
        <span>FraudRadar · 2026</span>
      </footer>
    </div>
  );
}
