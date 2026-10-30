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
import { ThemeToggle } from "@/components/providers";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useRecords, useChildren, useDetail, useList } from "../hooks/use-records";
import { AREAS, NODE_TYPES, LABELS, type NodeSummary, type View, type Filters } from "../schemas";
import { Detail } from "./detail";
import { TypeIcon, ShortDate } from "./record-visual";
import { Board } from "./board";
type TreeContext = {
  view: View;
  selected: string | null;
  onSelect: (id: string) => void;
  isFiltered: boolean;
  expanded: Set<string>;
};
function QueryStatus({ error, onRetry }: { error?: string; onRetry: () => void }) {
  return (
    <div className="p-6 text-sm text-muted-foreground">
      {error ? (
        <>
          <p>{error}</p>
          <Button variant="outline" className="mt-3" onClick={onRetry}>
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
function TreeBranch({
  node,
  ctx,
  trail = [],
}: {
  node: NodeSummary;
  ctx: TreeContext;
  trail?: string[];
}) {
  const [opened, setOpened] = useState(false);
  const [closed, setClosed] = useState(false);
  const children = ctx.view.index.filter((n) => n.pai_id === node.id);
  const isExpanded =
    opened ||
    (!closed &&
      (ctx.expanded.has(node.id) ||
        (ctx.isFiltered && children.some((n) => ctx.view.visible.includes(n.id)))));
  const query = useChildren(node.id, isExpanded && children.length > 0);
  const isMatch = ctx.view.matches.includes(node.id);
  if (trail.includes(node.id)) return null;
  return (
    <li>
      <div
        className={`tree-row ${ctx.selected === node.id ? "selected" : ""} ${!isMatch ? "ancestor" : ""}`}
      >
        <button
          className="expand"
          aria-label={`${isExpanded ? "Recolher" : "Expandir"} ${node.titulo}`}
          aria-expanded={children.length ? isExpanded : undefined}
          disabled={!children.length}
          onClick={() => {
            setOpened(!isExpanded);
            setClosed(isExpanded);
          }}
        >
          {children.length ? (
            isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span className={`area-dot area-${node.area}`} />
          )}
        </button>
        <button
          className="node-button"
          onClick={() => ctx.onSelect(node.id)}
          aria-current={ctx.selected === node.id ? "true" : undefined}
        >
          <div className="flex items-start gap-2">
            <TypeIcon type={node.tipo} />
            <span className="node-title">{node.titulo}</span>
          </div>
          <div className="node-meta">
            <span className={`area-label area-${node.area}`}>{LABELS[node.area]}</span>
            <span>{node.autor}</span>
            {children.length > 0 && <span className="count">{children.length}</span>}
          </div>
        </button>
      </div>
      {isExpanded && children.length > 0 && (
        <ul className="tree-children">
          {query.data ? (
            query.data
              .filter((n) => ctx.view.visible.includes(n.id))
              .map((n) => <TreeBranch key={n.id} node={n} ctx={ctx} trail={[...trail, node.id]} />)
          ) : (
            <QueryStatus error={query.error} onRetry={query.reload} />
          )}
        </ul>
      )}
    </li>
  );
}
function PromptTree({ ctx }: { ctx: TreeContext }) {
  const query = useChildren(null, true);
  if (!query.data) return <QueryStatus error={query.error} onRetry={query.reload} />;
  return (
    <ul className="tree" aria-label="Árvore de prompts">
      {query.data
        .filter((n) => ctx.view.visible.includes(n.id))
        .map((n) => (
          <TreeBranch key={n.id} node={n} ctx={ctx} />
        ))}
    </ul>
  );
}
function Timeline({ ctx }: { ctx: TreeContext }) {
  const [page, setPage] = useState(0);
  const ids = useMemo(
    () =>
      ctx.view.index
        .filter((n) => ctx.view.matches.includes(n.id))
        .sort((a, b) => a.criado_em.localeCompare(b.criado_em) || a.id.localeCompare(b.id))
        .map((n) => n.id),
    [ctx.view],
  );
  const total = Math.ceil(ids.length / 50);
  const current = Math.min(page, Math.max(0, total - 1));
  const query = useList(ids.slice(current * 50, current * 50 + 50));
  return (
    <div className="p-4">
      <p className="eyebrow mb-4">DO PRIMEIRO AO MAIS RECENTE</p>
      {query.data ? (
        query.data.map((n) => (
          <button
            key={n.id}
            className={`timeline-row ${ctx.selected === n.id ? "selected" : ""}`}
            onClick={() => ctx.onSelect(n.id)}
          >
            <TypeIcon type={n.tipo} />
            <span className="min-w-0 flex-1">
              <strong className="block text-sm">{n.titulo}</strong>
              <span className="text-xs text-muted-foreground">
                {n.autor} · {LABELS[n.area]}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              <ShortDate value={n.criado_em} />
            </span>
          </button>
        ))
      ) : (
        <QueryStatus error={query.error} onRetry={query.reload} />
      )}
      <div className="mt-4 flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          Anterior
        </Button>
        <span className="text-xs">
          {total ? current + 1 : 0} / {total}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={current + 1 >= total}
          onClick={() => setPage(current + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
export function Explorer({ email }: { email: string }) {
  const r = useRecords();
  const detail = useDetail(r.selected);
  const { logout } = useAuth();
  const authors = [...new Set(r.data?.index.map((n) => n.autor) ?? [])].sort();
  const branches = [
    ...new Set(r.data?.index.map((n) => n.branch).filter((b): b is string => !!b) ?? []),
  ].sort();
  const isFiltered = Object.values(r.filters).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));
  const update = r.update;
  const onSelect = useCallback((id: string) => update({ node: id }), [update]);
  const expanded = new Set(detail.data?.ancestors.map((n) => n.id) ?? []);
  const ctx = r.data
    ? { view: r.data, selected: r.selected, onSelect, isFiltered, expanded }
    : null;
  function setFilter(field: keyof Filters, val: string) {
    update({ [field]: val });
  }
  return (
    <div className={r.presentation ? "app presentation" : "app"}>
      <header className="topbar">
        <Link className="brand" href="/">
          <GitBranch size={20} /> VibeLog <span>/ FraudRadar</span>
        </Link>
        <form
          className="search-row"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter("q", String(new FormData(e.currentTarget).get("q") ?? ""));
          }}
        >
          <Search size={15} />
          <input
            key={r.filters.q}
            name="q"
            defaultValue={r.filters.q}
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
            variant={r.presentation ? "outline" : "ghost"}
            size="icon"
            aria-label="Modo apresentação"
            aria-pressed={r.presentation}
            onClick={() => update({ presentation: r.presentation ? "" : "1" })}
          >
            <Monitor size={17} />
          </Button>
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Sair" onClick={logout}>
            <LogOut size={17} />
          </Button>
        </div>
      </header>
      <div className={`studio ${r.selected ? "has-detail" : ""}`}>
        <aside className="studio-sidebar" aria-label="Visualização e filtros">
          <div className="sidebar-heading">
            <Network size={15} />
            <h1>Registro de construção</h1>
          </div>
          <p className="eyebrow">VISUALIZAÇÃO</p>
          <nav className="view-tabs" aria-label="Visualização">
            {(
              [
                { mode: "board", label: "Quadro", Icon: LayoutDashboard },
                { mode: "tree", label: "Árvore", Icon: GitBranch },
                { mode: "timeline", label: "Linha do tempo", Icon: List },
              ] as const
            ).map(({ mode, label, Icon }) => (
              <Button
                key={mode}
                variant="ghost"
                aria-pressed={r.view === mode}
                className={r.view === mode ? "active" : ""}
                onClick={() => update({ view: mode })}
              >
                <Icon size={15} />
                {label}
              </Button>
            ))}
          </nav>
          <p className="eyebrow mt-6">ÁREAS</p>
          <div className="sidebar-areas">
            {AREAS.map((a) => {
              const active = r.filters.area.includes(a);
              return (
                <button
                  key={a}
                  aria-pressed={active}
                  className={active ? "active" : ""}
                  onClick={() =>
                    update({
                      area: active ? r.filters.area.filter((v) => v !== a) : [...r.filters.area, a],
                    })
                  }
                >
                  <span className={`area-dot area-${a}`} />
                  <span>{LABELS[a]}</span>
                  <span className="count">
                    {r.data?.index.filter((n) => n.area === a).length ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="eyebrow mt-6">FILTROS</p>
          <div className="filter-grid">
            <label>
              Autor
              <select
                value={r.filters.author}
                onChange={(e) => setFilter("author", e.target.value)}
              >
                <option value="">Todos os autores</option>
                {authors.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select value={r.filters.type} onChange={(e) => setFilter("type", e.target.value)}>
                <option value="">Todos os tipos</option>
                {NODE_TYPES.map((t) => (
                  <option value={t} key={t}>
                    {LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Branch
              <select
                className="font-mono"
                value={r.filters.branch}
                onChange={(e) => setFilter("branch", e.target.value)}
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
                  value={r.filters.start}
                  onChange={(e) => setFilter("start", e.target.value)}
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  min={r.filters.start}
                  value={r.filters.end}
                  onChange={(e) => setFilter("end", e.target.value)}
                />
              </label>
            </div>
          </div>
          {isFiltered && (
            <div className="filter-note">
              <span>Ancestrais mantidos para dar contexto.</span>
              <button
                onClick={() =>
                  update({
                    area: [],
                    author: "",
                    type: "",
                    branch: "",
                    start: "",
                    end: "",
                    q: "",
                  })
                }
              >
                Limpar filtros
              </button>
            </div>
          )}
          <div className="sidebar-footer">
            <span className="status-dot" />
            Somente leitura<span className="font-mono">{r.data?.index.length ?? "—"} nós</span>
          </div>
        </aside>
        <main className="studio-main">
          <div className="canvas-toolbar">
            <h2>
              {r.view === "board"
                ? "Quadro"
                : r.view === "tree"
                  ? "Árvore de prompts"
                  : "Linha do tempo"}
            </h2>
            <span>
              {r.data?.matches.length ?? 0} registros
              {isFiltered ? " encontrados" : " conectados"}
            </span>
          </div>
          {ctx ? (
            r.data!.matches.length ? (
              r.view === "board" ? (
                <Board
                  view={ctx.view}
                  selected={r.selected}
                  onSelect={onSelect}
                  presentation={r.presentation}
                />
              ) : (
                <div className="tree-scroll">
                  {r.isTimeline ? <Timeline ctx={ctx} /> : <PromptTree ctx={ctx} />}
                </div>
              )
            ) : (
              <div className="empty-small">
                <Search size={24} />
                <h3>{isFiltered ? "Nenhum registro encontrado" : "A história começa aqui"}</h3>
                <p>
                  {isFiltered
                    ? "Ajuste os filtros para explorar outras conexões."
                    : "Os registros aparecerão quando os agentes publicarem seus prompts e resultados."}
                </p>
              </div>
            )
          ) : (
            <QueryStatus error={r.error} onRetry={r.reload} />
          )}
          <div className="legend">
            {NODE_TYPES.map((t) => (
              <span key={t}>
                <TypeIcon type={t} />
                {LABELS[t]}
              </span>
            ))}
          </div>
        </main>
        {r.selected && (
          <section className="detail-panel" aria-label="Detalhe do registro">
            {detail.data ? (
              <Detail
                key={r.selected}
                data={detail.data}
                onSelect={onSelect}
                onClose={() => update({ node: "" })}
                onRefresh={detail.reload}
              />
            ) : (
              <>
                <Button variant="ghost" onClick={() => update({ node: "" })}>
                  Fechar detalhe
                </Button>
                <QueryStatus error={detail.error} onRetry={detail.reload} />
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
