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
import type { No, Resumo, Evidencia } from "../schemas";
import { rotulos } from "../schemas";
import { repoUrl, urlSegura } from "../services/arvore";
import { IconeTipo } from "./registro-visual";
export function Detalhe({
  data,
  selecionar,
  fechar,
  atualizar,
}: {
  data: { no: No; ancestrais: Resumo[]; evidencias: Evidencia[] };
  selecionar: (id: string) => void;
  fechar: () => void;
  atualizar: () => void;
}) {
  const { no, ancestrais, evidencias } = data;
  const [imagem, setImagem] = useState<Evidencia | null>(null);
  const repo = repoUrl(no.meta?.repo);
  const commit =
    repo && no.commit_sha ? `${repo}/commit/${encodeURIComponent(no.commit_sha)}` : null;
  const branch =
    repo && no.branch
      ? `${repo}/tree/${no.branch.split("/").map(encodeURIComponent).join("/")}`
      : null;
  return (
    <article className="detail">
      <nav className="breadcrumbs" aria-label="Caminho até a raiz">
        <button onClick={fechar}>Registros</button>
        {ancestrais.map((n) => (
          <span key={n.id}>
            <ChevronRight size={12} />
            <button title={n.titulo} onClick={() => selecionar(n.id)}>
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
            <IconeTipo tipo={no.tipo} />
            {rotulos[no.tipo]}
          </span>
          <span className={`chip area-label area-${no.area}`}>
            <span className={`area-dot area-${no.area}`} />
            {rotulos[no.area]}
          </span>
        </div>
        <Button variant="ghost" size="icon" aria-label="Fechar registro" onClick={fechar}>
          <X size={17} />
        </Button>
      </div>
      <h2>{no.titulo}</h2>
      <div className="byline">
        <span className="avatar">{no.autor.slice(0, 2).toUpperCase()}</span>
        <strong>{no.autor}</strong>
        {no.destino && (
          <>
            <span>→</span>
            <strong>{no.destino}</strong>
          </>
        )}
        <span>·</span>
        <time dateTime={no.criado_em}>
          {new Date(no.criado_em).toLocaleString("pt-BR", { timeZone: "UTC" })} UTC
        </time>
      </div>
      <div className="metadata">
        {no.modelo && <span className="chip">{no.modelo}</span>}
        {no.branch &&
          (branch ? (
            <a className="chip" href={branch} target="_blank" rel="noreferrer">
              <GitBranch size={13} />
              {no.branch}
              <ExternalLink size={11} />
            </a>
          ) : (
            <span className="chip">
              <GitBranch size={13} />
              {no.branch}
            </span>
          ))}
        {no.commit_sha &&
          (commit ? (
            <a className="chip" href={commit} target="_blank" rel="noreferrer">
              <GitCommitHorizontal size={14} />
              {no.commit_sha.slice(0, 8)}
              <ExternalLink size={11} />
            </a>
          ) : (
            <span className="chip">{no.commit_sha.slice(0, 8)}</span>
          ))}
      </div>
      {no.resumo && <blockquote className="summary">{no.resumo}</blockquote>}
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
              urlSegura(href) ? (
                <a href={urlSegura(href)!} target="_blank" rel="noreferrer">
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
          {no.conteudo}
        </Markdown>
      </div>
      <section className="evidence">
        <div className="flex items-center justify-between">
          <h3>
            Evidências <span className="count">{evidencias.length}</span>
          </h3>
          <Button size="sm" variant="ghost" onClick={atualizar}>
            <RefreshCw size={13} />
            Atualizar links
          </Button>
        </div>
        {!evidencias.length ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma evidência anexada a este registro.
          </p>
        ) : (
          <div className="evidence-grid">
            {evidencias.map((e) => (
              <div key={e.id} className="evidence-card">
                {e.tipo === "print" && e.assinada ? (
                  <button
                    onClick={() => setImagem(e)}
                    aria-label={`Ampliar ${e.legenda ?? "captura de tela"}`}
                  >
                    <img
                      loading="lazy"
                      src={e.assinada}
                      alt={e.legenda ?? "Captura de tela do resultado"}
                    />
                    <span>
                      <ImageIcon size={14} />
                      {e.legenda ?? "Captura de tela"}
                    </span>
                  </button>
                ) : (
                  <a
                    href={e.assinada ?? undefined}
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
          <dd>{no.id}</dd>
          <dt>Arquivo de origem</dt>
          <dd>{no.origem ?? "Não informado"}</dd>
          <dt>Chave de origem</dt>
          <dd>{no.origem_id ?? "Não informada"}</dd>
        </dl>
        {no.meta && <pre>{JSON.stringify(no.meta, null, 2)}</pre>}
      </details>
      <Dialog
        open={!!imagem}
        onOpenChange={(aberto) => {
          if (!aberto) setImagem(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="mb-2 pr-10 font-semibold">
            {imagem?.legenda ?? "Captura de tela"}
          </DialogTitle>
          <DialogDescription className="mb-4 text-sm text-muted-foreground">
            Evidência do resultado de construção.
          </DialogDescription>
          {imagem?.assinada && (
            <img
              className="w-full rounded"
              src={imagem.assinada}
              alt={imagem.legenda ?? "Captura ampliada"}
            />
          )}
        </DialogContent>
      </Dialog>
    </article>
  );
}
