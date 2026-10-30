"use client";
/* As imagens usam URLs assinadas temporárias do bucket privado. */
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  ChevronRight,
  GitBranch,
  GitCommitHorizontal,
  ExternalLink,
  ImageIcon,
  FileText,
  X,
  RefreshCw,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { NodeRecord, NodeSummary, Evidence } from "../schemas";
import { LABELS } from "../schemas";
import { repoUrl, safeUrl } from "../services/tree";
import { TypeIcon } from "./record-visual";
export function Detail({
  data,
  onSelect,
  onClose,
  onRefresh,
}: {
  data: { node: NodeRecord; ancestors: NodeSummary[]; evidence: Evidence[] };
  onSelect: (id: string) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { node, ancestors, evidence } = data;
  const [selectedImage, setSelectedImage] = useState<Evidence | null>(null);
  const repo = repoUrl(node.meta?.repo);
  const commit =
    repo && node.commit_sha ? `${repo}/commit/${encodeURIComponent(node.commit_sha)}` : null;
  const branch =
    repo && node.branch
      ? `${repo}/tree/${node.branch.split("/").map(encodeURIComponent).join("/")}`
      : null;
  return (
    <article className="detail">
      <nav className="breadcrumbs" aria-label="Caminho até a raiz">
        <button onClick={onClose}>Registros</button>
        {ancestors.map((n) => (
          <span key={n.id}>
            <ChevronRight size={12} />
            <button title={n.titulo} onClick={() => onSelect(n.id)}>
              {n.titulo}
            </button>
          </span>
        ))}
        <span>
          <ChevronRight size={12} />
          <b aria-current="page">Registro atual</b>
        </span>
      </nav>
      <div className="detail-heading">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">
            <TypeIcon type={node.tipo} />
            {LABELS[node.tipo]}
          </span>
          <span className={`chip area-label area-${node.area}`}>
            <span className={`area-dot area-${node.area}`} />
            {LABELS[node.area]}
          </span>
        </div>
        <Button variant="ghost" size="icon" aria-label="Fechar registro" onClick={onClose}>
          <X size={17} />
        </Button>
      </div>
      <h2>{node.titulo}</h2>
      <div className="byline">
        <span className="avatar">{node.autor.slice(0, 2).toUpperCase()}</span>
        <strong>{node.autor}</strong>
        {node.destino && (
          <>
            <span>→</span>
            <strong>{node.destino}</strong>
          </>
        )}
        <span>·</span>
        <time dateTime={node.criado_em}>
          {new Date(node.criado_em).toLocaleString("pt-BR", { timeZone: "UTC" })} UTC
        </time>
      </div>
      <div className="metadata">
        {node.modelo && <span className="chip">{node.modelo}</span>}
        {node.branch &&
          (branch ? (
            <a className="chip" href={branch} target="_blank" rel="noreferrer">
              <GitBranch size={13} />
              {node.branch}
              <ExternalLink size={11} />
            </a>
          ) : (
            <span className="chip">
              <GitBranch size={13} />
              {node.branch}
            </span>
          ))}
        {node.commit_sha &&
          (commit ? (
            <a className="chip" href={commit} target="_blank" rel="noreferrer">
              <GitCommitHorizontal size={14} />
              {node.commit_sha.slice(0, 8)}
              <ExternalLink size={11} />
            </a>
          ) : (
            <span className="chip">{node.commit_sha.slice(0, 8)}</span>
          ))}
      </div>
      {node.resumo && <blockquote className="summary">{node.resumo}</blockquote>}
      <div className="content-label">
        <span>CONTEÚDO DO REGISTRO</span>
        <span>Markdown</span>
      </div>
      <div className="markdown">
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          skipHtml
          components={{
            a: ({ href, children }) =>
              safeUrl(href) ? (
                <a href={safeUrl(href)!} target="_blank" rel="noreferrer">
                  {children}
                </a>
              ) : (
                <span>{children}</span>
              ),
            img: ({ alt }) => (
              <span className="chip">Imagem referenciada: {alt ?? "sem descrição"}</span>
            ),
          }}
        >
          {node.conteudo}
        </Markdown>
      </div>
      <section className="evidence">
        <div className="flex items-center justify-between">
          <h3>
            Evidências <span className="count">{evidence.length}</span>
          </h3>
          <Button size="sm" variant="ghost" onClick={onRefresh}>
            <RefreshCw size={13} />
            Atualizar links
          </Button>
        </div>
        {!evidence.length ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma evidência anexada a este registro.
          </p>
        ) : (
          <div className="evidence-grid">
            {evidence.map((e) => (
              <div key={e.id} className="evidence-card">
                {e.tipo === "print" && e.signedUrl ? (
                  <button
                    onClick={() => setSelectedImage(e)}
                    aria-label={`Ampliar ${e.legenda ?? "captura de tela"}`}
                  >
                    <img
                      loading="lazy"
                      src={e.signedUrl}
                      alt={e.legenda ?? "Captura de tela do resultado"}
                    />
                    <span>
                      <ImageIcon size={14} />
                      {e.legenda ?? "Captura de tela"}
                    </span>
                  </button>
                ) : (
                  <a
                    href={e.signedUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="file-evidence"
                  >
                    <FileText size={22} />
                    <span>{e.legenda ?? `Evidência: ${e.tipo}`}</span>
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <details className="provenance">
        <summary>Origem e identificadores</summary>
        <dl>
          <dt>ID</dt>
          <dd>{node.id}</dd>
          <dt>Arquivo de origem</dt>
          <dd>{node.origem ?? "Não informado"}</dd>
          <dt>Chave de origem</dt>
          <dd>{node.origem_id ?? "Não informada"}</dd>
        </dl>
        {node.meta && <pre>{JSON.stringify(node.meta, null, 2)}</pre>}
      </details>
      <Dialog
        open={!!selectedImage}
        onOpenChange={(open) => {
          if (!open) setSelectedImage(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="mb-2 pr-10 font-semibold">
            {selectedImage?.legenda ?? "Captura de tela"}
          </DialogTitle>
          <DialogDescription className="mb-4 text-sm text-muted-foreground">
            Evidência do resultado de construção.
          </DialogDescription>
          {selectedImage?.signedUrl && (
            <img
              className="w-full rounded"
              src={selectedImage.signedUrl}
              alt={selectedImage.legenda ?? "Captura ampliada"}
            />
          )}
        </DialogContent>
      </Dialog>
    </article>
  );
}
