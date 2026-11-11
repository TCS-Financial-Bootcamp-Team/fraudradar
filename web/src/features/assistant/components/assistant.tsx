"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, Sparkles, X } from "lucide-react";
import { useAppContext } from "@/components/app-context";
import { formatShortDate } from "@/lib/format";
import { getAlertIdFromPathname } from "@/lib/sidebar";
import { useAssistant } from "../hooks/use-assistant";

function FormattedContent({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-xs sm:text-sm leading-relaxed">
      {content.split("\n").map((paragraph, i) => {
        if (!paragraph.trim()) return <div key={i} className="h-1.5" />;
        const isBullet =
          paragraph.trim().startsWith("- ") ||
          paragraph.trim().startsWith("• ");
        const text = isBullet
          ? paragraph.trim().replace(/^[-•]\s*/, "")
          : paragraph;
        const formatted = text
          .split(/(\*\*.*?\*\*)/g)
          .map((segment, j) =>
            segment.startsWith("**") && segment.endsWith("**") ? (
              <strong key={j} className="font-semibold">
                {segment.slice(2, -2)}
              </strong>
            ) : (
              segment
            ),
          );
        if (isBullet) {
          return (
            <div key={i} className="flex items-start gap-2 pl-1.5">
              <span className="text-muted-foreground select-none">•</span>
              <span>{formatted}</span>
            </div>
          );
        }
        return (
          <p key={i} className="m-0">
            {formatted}
          </p>
        );
      })}
    </div>
  );
}

const DEFAULT_SUGGESTIONS = [
  "Resuma os alertas da semana",
  "Explique a tipologia fan-out",
  "Quais regras têm maior taxa de alerta?",
];

/**
 * Componente Chat inline preservado para compatibilidade enquanto
 * alert-detail.tsx não for atualizado pelo agente responsável pela tela.
 */
export function Chat({ alertId }: { alertId?: string }) {
  const { messages, busy, send } = useAssistant(alertId);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setDraft("");
    const ok = await send(trimmed);
    if (!ok) setDraft(trimmed);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="border-b border-border bg-soft px-4 py-2.5 text-xs text-muted-foreground">
        Contas pseudonimizadas. A IA auxilia a análise; a decisão é humana.
      </p>
      <div
        role="log"
        aria-label="Mensagens do assistente"
        aria-live="polite"
        className="flex-1 space-y-4 overflow-y-auto p-4"
      >
        {messages.length === 0 && (
          <div className="py-4">
            <h3 className="text-base font-semibold text-foreground">
              Uma segunda leitura para sua análise.
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Pergunte sobre padrões, tipologias e próximos passos.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {DEFAULT_SUGGESTIONS.slice(0, 2).map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => void handleSend(sug)}
                  className="rounded-lg border border-border bg-card p-3 text-left text-xs text-foreground transition-colors hover:bg-muted/60"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-8 rounded-xl bg-primary px-3.5 py-2.5 text-xs text-primary-foreground sm:text-sm"
                : "mr-3 rounded-xl border border-border bg-card p-3.5 text-xs text-foreground sm:text-sm"
            }
          >
            <FormattedContent content={m.content} />
            {m.sources && m.sources.length > 0 && (
              <div className="mt-2.5 flex flex-col gap-1 border-t border-soft pt-2">
                {m.sources.map((src, idx) => (
                  <span
                    key={idx}
                    className="rounded-md bg-soft px-2 py-1 text-xs text-muted-foreground"
                  >
                    <strong className="font-medium text-foreground">
                      {src.title}
                    </strong>{" "}
                    · {src.excerpt}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <p
            role="status"
            className="animate-pulse text-xs text-muted-foreground"
          >
            Consultando as fontes…
          </p>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend(draft);
        }}
      >
        <textarea
          rows={2}
          aria-label="Sua pergunta ao assistente"
          className="min-h-16 flex-1 resize-none rounded-lg border border-border bg-background p-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Pergunte sobre sua análise…"
        />
        <button
          type="submit"
          aria-label="Enviar pergunta"
          disabled={busy || !draft.trim()}
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="size-4" strokeWidth={1.5} />
        </button>
      </form>
    </div>
  );
}

export interface AssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Painel lateral direito do Assistente IA (400px, altura total, sobreposto).
 * Alinha o contexto automaticamente a partir da rota (/alerts/[id] ou semana ativa).
 */
export function AssistantDrawer({ isOpen, onClose }: AssistantDrawerProps) {
  const pathname = usePathname();
  const alertId = getAlertIdFromPathname(pathname);
  const { week } = useAppContext();
  const { messages, busy, send } = useAssistant(alertId);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Foco e Escape para acessibilidade
  useEffect(() => {
    if (!isOpen) return;
    textareaRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Rola até o final ao receber mensagens
  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [messages, busy, isOpen]);

  if (!isOpen) return null;

  const contextChip = alertId
    ? `Alerta ${alertId}`
    : week
      ? `Semana de ${formatShortDate(week)}`
      : "Geral";
  const suggestions = alertId
    ? [
        DEFAULT_SUGGESTIONS[0],
        DEFAULT_SUGGESTIONS[1],
        `Por que o alerta ${alertId} entrou na fila?`,
      ]
    : DEFAULT_SUGGESTIONS;

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setDraft("");
    const ok = await send(trimmed);
    if (!ok) setDraft(trimmed);
  };

  const onTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend(draft);
    }
  };

  return (
    <aside
      role="dialog"
      aria-label="Assistente"
      aria-modal={false}
      data-assistant-drawer="open"
      className="fixed inset-y-0 right-0 z-40 flex h-screen w-[400px] max-w-full flex-col border-l border-border bg-card text-foreground shadow-xl [animation:assistant-drawer-in_0.2s_ease-out]"
    >
      {/* Topo do drawer: 60px com ícone, título, chip de contexto e fechar */}
      <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-border px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Sparkles className="size-4 shrink-0 text-foreground" strokeWidth={1.5} />
          <span className="text-sm font-semibold text-foreground">
            Assistente
          </span>
          <span className="truncate rounded-full bg-soft px-2 py-0.5 text-xs font-normal text-muted-foreground">
            {contextChip}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar assistente"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Histórico de mensagens / estado vazio */}
      <div
        role="log"
        aria-label="Mensagens"
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2.5 pt-6">
            <h3 className="m-0 text-lg font-semibold tracking-tight text-foreground">
              Uma segunda leitura para sua análise.
            </h3>
            <p className="m-0 text-xs leading-relaxed text-muted-foreground">
              Pergunte sobre padrões, tipologias e próximos passos. As contas
              chegam pseudonimizadas e a decisão continua sua.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void handleSend(suggestion)}
                  className="min-h-10 rounded-xl border border-border bg-card p-3 text-left text-xs text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col gap-1.5 ${
                m.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`text-xs leading-relaxed sm:text-sm ${
                  m.role === "user"
                    ? "max-w-[88%] rounded-xl bg-primary px-3.5 py-2.5 text-primary-foreground"
                    : "max-w-[92%] text-foreground"
                }`}
              >
                <FormattedContent content={m.content} />
              </div>
              {m.sources && m.sources.length > 0 && (
                <div className="flex w-full max-w-[92%] flex-col gap-1">
                  {m.sources.map((src, sIdx) => (
                    <span
                      key={sIdx}
                      className="rounded-md bg-soft px-2.5 py-1 text-xs text-muted-foreground leading-snug"
                    >
                      <strong className="font-medium text-foreground">
                        {src.title}
                      </strong>{" "}
                      · {src.excerpt}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {busy && (
          <p
            role="status"
            className="m-0 flex items-center gap-1 text-xs text-muted-foreground animate-pulse"
          >
            Consultando as fontes…
          </p>
        )}
        <div ref={endRef} />
      </div>

      {/* Caixa de entrada com textarea e rodapé explicativo */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3.5 sm:p-4">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-1.5 pl-3 focus-within:ring-2 focus-within:ring-ring">
          <label className="flex flex-1">
            <span className="sr-only">Sua pergunta</span>
            <textarea
              ref={textareaRef}
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onTextareaKeyDown}
              placeholder="Pergunte sobre a análise…"
              maxLength={2000}
              className="w-full resize-none border-0 bg-transparent py-1 text-xs text-foreground placeholder:text-muted-foreground outline-none sm:text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSend(draft)}
            aria-label="Enviar pergunta"
            disabled={busy || !draft.trim()}
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp className="size-4" strokeWidth={1.5} />
          </button>
        </div>
        <p className="m-0 text-[11px] leading-normal text-muted-foreground text-center sm:text-left">
          A IA auxilia a análise; a decisão é humana.
        </p>
      </div>
    </aside>
  );
}
