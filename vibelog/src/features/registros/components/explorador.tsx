"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  GitBranch,
  Search,
  ChevronRight,
  ChevronDown,
  Network,
  LayoutDashboard,
  List,
  Monitor,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tema } from "@/components/providers";
import { useAuth } from "@/features/autenticacao/hooks/use-auth";
import { useRegistros, useFilhos, useDetalhe, useLista } from "../hooks/use-registros";
import { areas, tipos, rotulos, type Resumo, type Visao, type Filtros } from "../schemas";
import { Detalhe } from "./detalhe";
import { IconeTipo, Data } from "./registro-visual";
import { Quadro } from "./quadro";
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
  const autores = [...new Set(r.data?.indice.map((n) => n.autor) ?? [])].sort();
  const branches = [
    ...new Set(r.data?.indice.map((n) => n.branch).filter((b): b is string => !!b) ?? []),
  ].sort();
  const filtrado = Object.values(r.filtros).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));
  const mudar = r.mudar;
  const selecionar = useCallback((id: string) => mudar({ no: id }), [mudar]);
  const expandidos = new Set(detalhe.data?.ancestrais.map((n) => n.id) ?? []);
  const ctx = r.data
    ? { visao: r.data, selecionado: r.selecionado, selecionar, filtrado, expandidos }
    : null;
  function alterar(chave: keyof Filtros, valor: string) {
    mudar({ [chave]: valor });
  }
  return (
    <div className={r.apresentacao ? "app apresentacao" : "app"}>
      <header className="topbar">
        <Link className="brand" href="/">
          <GitBranch size={20} /> VibeLog <span>/ FraudRadar</span>
        </Link>
        <form
          className="search-row"
          onSubmit={(e) => {
            e.preventDefault();
            alterar("q", String(new FormData(e.currentTarget).get("q") ?? ""));
          }}
        >
          <Search size={15} />
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
        </form>
        <div className="flex items-center gap-1">
          <span className="user-email">{email}</span>
          <Button
            variant={r.apresentacao ? "outline" : "ghost"}
            size="icon"
            aria-label="Modo apresentação"
            aria-pressed={r.apresentacao}
            onClick={() => mudar({ apresentacao: r.apresentacao ? "" : "1" })}
          >
            <Monitor size={17} />
          </Button>
          <Tema />
          <Button variant="ghost" size="icon" aria-label="Sair" onClick={logout}>
            <LogOut size={17} />
          </Button>
        </div>
      </header>
      <div className={`studio ${r.selecionado ? "has-detail" : ""}`}>
        <aside className="studio-sidebar" aria-label="Visualização e filtros">
          <div className="sidebar-heading">
            <Network size={15} />
            <h1>Registro de construção</h1>
          </div>
          <p className="eyebrow">VISUALIZAÇÃO</p>
          <nav className="view-tabs" aria-label="Visualização">
            {(
              [
                { valor: "quadro", nome: "Quadro", Icone: LayoutDashboard },
                { valor: "arvore", nome: "Árvore", Icone: GitBranch },
                { valor: "tempo", nome: "Linha do tempo", Icone: List },
              ] as const
            ).map(({ valor, nome, Icone }) => (
              <Button
                key={valor}
                variant="ghost"
                aria-pressed={r.vista === valor}
                className={r.vista === valor ? "active" : ""}
                onClick={() => mudar({ vista: valor })}
              >
                <Icone size={15} />
                {nome}
              </Button>
            ))}
          </nav>
          <p className="eyebrow mt-6">ÁREAS</p>
          <div className="sidebar-areas">
            {areas.map((a) => {
              const ativo = r.filtros.area.includes(a);
              return (
                <button
                  key={a}
                  aria-pressed={ativo}
                  className={ativo ? "active" : ""}
                  onClick={() =>
                    mudar({
                      area: ativo ? r.filtros.area.filter((v) => v !== a) : [...r.filtros.area, a],
                    })
                  }
                >
                  <span className={`area-dot area-${a}`} />
                  <span>{rotulos[a]}</span>
                  <span className="count">
                    {r.data?.indice.filter((n) => n.area === a).length ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="eyebrow mt-6">FILTROS</p>
          <div className="filter-grid">
            <label>
              Autor
              <select value={r.filtros.autor} onChange={(e) => alterar("autor", e.target.value)}>
                <option value="">Todos os autores</option>
                {autores.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select value={r.filtros.tipo} onChange={(e) => alterar("tipo", e.target.value)}>
                <option value="">Todos os tipos</option>
                {tipos.map((t) => (
                  <option value={t} key={t}>
                    {rotulos[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Branch
              <select
                className="font-mono"
                value={r.filtros.branch}
                onChange={(e) => alterar("branch", e.target.value)}
              >
                <option value="">Todas as branches</option>
                {branches.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <div className="date-filters">
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
          </div>
          {filtrado && (
            <div className="filter-note">
              <span>Ancestrais mantidos para dar contexto.</span>
              <button
                onClick={() =>
                  mudar({ area: [], autor: "", tipo: "", branch: "", inicio: "", fim: "", q: "" })
                }
              >
                Limpar filtros
              </button>
            </div>
          )}
          <div className="sidebar-footer">
            <span className="status-dot" />
            Somente leitura<span className="font-mono">{r.data?.indice.length ?? "—"} nós</span>
          </div>
        </aside>
        <main className="studio-main">
          <div className="canvas-toolbar">
            <h2>
              {r.vista === "quadro"
                ? "Quadro"
                : r.vista === "arvore"
                  ? "Árvore de prompts"
                  : "Linha do tempo"}
            </h2>
            <span>
              {r.data?.correspondencias.length ?? 0} registros
              {filtrado ? " encontrados" : " conectados"}
            </span>
          </div>
          {ctx ? (
            r.data!.correspondencias.length ? (
              r.vista === "quadro" ? (
                <Quadro
                  visao={ctx.visao}
                  selecionado={r.selecionado}
                  selecionar={selecionar}
                  apresentacao={r.apresentacao}
                />
              ) : (
                <div className="tree-scroll">
                  {r.linha ? <LinhaTempo ctx={ctx} /> : <Arvore ctx={ctx} />}
                </div>
              )
            ) : (
              <div className="empty-small">
                <Search size={24} />
                <h3>{filtrado ? "Nenhum registro encontrado" : "A história começa aqui"}</h3>
                <p>
                  {filtrado
                    ? "Ajuste os filtros para explorar outras conexões."
                    : "Os registros aparecerão quando os agentes publicarem seus prompts e resultados."}
                </p>
              </div>
            )
          ) : (
            <Estado erro={r.erro} recarregar={r.recarregar} />
          )}
          <div className="legend">
            {tipos.map((t) => (
              <span key={t}>
                <IconeTipo tipo={t} />
                {rotulos[t]}
              </span>
            ))}
          </div>
        </main>
        {r.selecionado && (
          <section className="detail-panel" aria-label="Detalhe do registro">
            {detalhe.data ? (
              <Detalhe
                key={r.selecionado}
                data={detalhe.data}
                selecionar={selecionar}
                fechar={() => mudar({ no: "" })}
                atualizar={detalhe.recarregar}
              />
            ) : (
              <>
                <Button variant="ghost" onClick={() => mudar({ no: "" })}>
                  Fechar detalhe
                </Button>
                <Estado erro={detalhe.erro} recarregar={detalhe.recarregar} />
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
