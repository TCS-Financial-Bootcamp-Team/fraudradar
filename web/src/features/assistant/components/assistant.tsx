"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUp, ChevronRight, ShieldCheck, Sparkles, X } from "lucide-react";
import { cn } from "cn";
import { useAppContext } from "@/components/app-context";
import { LegalSourceItem } from "@/components/legal-source-item";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { useFormatters } from "@/i18n/use-formatters";
import { getAlertIdFromPathname } from "@/lib/sidebar";
import { useAlertContextPreference, useAssistant } from "../hooks/use-assistant";
import { getAnswerBadge } from "../lib/answer-badge";
import { getSuggestionKeys, resolveEffectiveAlertId } from "../lib/context";
import {
  parseEvidenceStrength,
  type EvidenceStrength,
} from "../lib/decision-strength";
import type { ChatKind, Source } from "../schemas/assistant";

const STRENGTH_STYLES: Record<
  EvidenceStrength,
  { pill: string; dot: string }
> = {
  weak: {
    pill: "border-border bg-soft/60 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  moderate: {
    pill: "border-warning/40 bg-warning/10 text-foreground",
    dot: "bg-warning",
  },
  strong: {
    pill: "border-signal/40 bg-signal/10 text-foreground",
    dot: "bg-signal",
  },
};

function EvidenceStrengthPill({ strength }: { strength: EvidenceStrength }) {
  const t = useTranslations("assistant");
  const styles = STRENGTH_STYLES[strength];

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-auto max-w-full gap-1.5 whitespace-normal px-2 py-0.5 text-[11px] font-medium",
        styles.pill,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", styles.dot)}
      />
      <span>{t(`strength.${strength}`)}</span>
    </Badge>
  );
}

function AlertContextControl({
  alertId,
  enabled,
  onToggle,
  className,
}: {
  alertId: string;
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const t = useTranslations("assistant");

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-soft/50 px-4 py-2 text-xs",
        className,
      )}
    >
      <span
        title={t("alertContextTooltip")}
        tabIndex={0}
        className={cn(
          "inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          enabled
            ? "text-foreground"
            : "text-muted-foreground line-through opacity-65",
        )}
      >
        <ShieldCheck
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="truncate tabular-nums">
          {t("alertContext", { id: alertId })}
        </span>
      </span>
      <button
        type="button"
        aria-pressed={enabled}
        onClick={onToggle}
        className="inline-flex min-h-7 shrink-0 items-center rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {enabled ? t("disableAlertContext") : t("enableAlertContext")}
      </button>
    </div>
  );
}

function AssistantKindBadge({
  kind,
  sources,
}: {
  kind?: ChatKind;
  sources?: Source[];
}) {
  const t = useTranslations("assistant");
  const badge = getAnswerBadge(kind, sources);
  if (!badge) return null;

  return (
    <Badge
      variant="outline"
      title={badge.tooltipKey ? t(badge.tooltipKey) : undefined}
      className="h-auto max-w-full whitespace-normal border-border bg-soft/60 px-2 py-0.5 text-[11px] font-normal text-muted-foreground"
    >
      {t(badge.labelKey)}
    </Badge>
  );
}

function AssistantAnswerMeta({
  kind,
  content,
  sources,
  className,
  withDivider = false,
}: {
  kind?: ChatKind;
  content?: string;
  sources?: Source[];
  className?: string;
  withDivider?: boolean;
}) {
  const badge = getAnswerBadge(kind, sources);
  const strength =
    (!kind || kind === "decision") && content
      ? parseEvidenceStrength(content)
      : null;
  const hasSources = Boolean(sources && sources.length > 0);
  if (!badge && !strength && !hasSources) return null;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-start gap-1.5",
        withDivider && "mt-2 border-t border-soft pt-2",
        className,
      )}
    >
      {(badge || strength) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <AssistantKindBadge kind={kind} sources={sources} />
          {strength && <EvidenceStrengthPill strength={strength} />}
        </div>
      )}
      <AssistantSources sources={sources} className="w-full" />
    </div>
  );
}

function AssistantSources({
  sources,
  className,
}: {
  sources?: Source[];
  className?: string;
}) {
  const t = useTranslations("assistant");
  const [open, setOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-90",
          )}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span>{t("sourcesToggle", { count: sources.length })}</span>
      </button>
      {open && (
        <div className="mt-1.5 flex min-w-0 flex-col gap-1.5">
          {sources.map((src, idx) => (
            <LegalSourceItem key={`${src.title}-${idx}`} source={src} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Componente Chat inline preservado para compatibilidade enquanto
 * alert-detail.tsx não for atualizado pelo agente responsável pela tela.
 */
export function Chat({ alertId }: { alertId?: string }) {
  const t = useTranslations("assistant");
  const { enabled: shareAlertContext, toggle: toggleAlertContext } =
    useAlertContextPreference();
  const effectiveAlertId = resolveEffectiveAlertId(alertId, shareAlertContext);
  const { messages, busy, send } = useAssistant(alertId, shareAlertContext);
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
        {t("pseudonymized")}
      </p>
      {alertId && (
        <AlertContextControl
          alertId={alertId}
          enabled={shareAlertContext}
          onToggle={toggleAlertContext}
        />
      )}
      <div
        role="log"
        aria-label={t("logAssistant")}
        aria-live="polite"
        className="flex-1 space-y-4 overflow-y-auto p-4"
      >
        {messages.length === 0 && (
          <div className="py-4">
            <h3 className="text-base font-semibold text-foreground">
              {t("emptyTitle")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("emptyShort")}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {getSuggestionKeys(effectiveAlertId).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void handleSend(t(`suggestions.${key}`))}
                  className="rounded-lg border border-border bg-card p-3 text-left text-xs text-foreground transition-colors hover:bg-muted/60"
                >
                  {t(`suggestions.${key}`)}
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
                ? "ml-8 min-w-0 rounded-xl bg-primary px-3.5 py-2.5 text-xs text-primary-foreground break-words [overflow-wrap:anywhere] sm:text-sm"
                : "mr-3 min-w-0 rounded-xl border border-border bg-card p-3.5 text-xs text-foreground break-words [overflow-wrap:anywhere] sm:text-sm"
            }
          >
            {m.role === "user" ? (
              <p className="m-0 whitespace-pre-wrap leading-relaxed">
                {m.content}
              </p>
            ) : (
              <Markdown
                content={m.content}
                className="text-xs leading-relaxed sm:text-sm"
              />
            )}
            {m.role === "assistant" && (
              <AssistantAnswerMeta
                kind={m.kind}
                content={m.content}
                sources={m.sources}
                withDivider
              />
            )}
          </div>
        ))}
        {busy && (
          <p
            role="status"
            className="animate-pulse text-xs text-muted-foreground"
          >
            {t("consulting")}
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
          aria-label={t("questionToAssistant")}
          className="min-h-16 flex-1 resize-none rounded-lg border border-border bg-background p-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("placeholderShort")}
        />
        <button
          type="submit"
          aria-label={t("send")}
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
  const t = useTranslations("assistant");
  const format = useFormatters();
  const pathname = usePathname();
  const alertId = getAlertIdFromPathname(pathname);
  const { enabled: shareAlertContext, toggle: toggleAlertContext } =
    useAlertContextPreference();
  const effectiveAlertId = resolveEffectiveAlertId(alertId, shareAlertContext);
  const { week } = useAppContext();
  const { messages, busy, send } = useAssistant(alertId, shareAlertContext);
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

  const nonAlertChip = week
    ? t("weekContext", { week: format.shortDate(week) })
    : t("general");
  const headerChip = alertId
    ? shareAlertContext
      ? null
      : t("general")
    : nonAlertChip;
  const suggestions = getSuggestionKeys(effectiveAlertId).map((key) =>
    t(`suggestions.${key}`),
  );

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
      aria-label={t("title")}
      aria-modal={false}
      data-assistant-drawer="open"
      className="fixed inset-y-0 right-0 z-40 flex h-screen w-[400px] max-w-full flex-col border-l border-border bg-card text-foreground shadow-xl [animation:assistant-drawer-in_0.2s_ease-out]"
    >
      {/* Topo do drawer: 60px com ícone, título, chip de contexto geral e fechar */}
      <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-border px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Sparkles className="size-4 shrink-0 text-foreground" strokeWidth={1.5} />
          <span className="text-sm font-semibold text-foreground">
            {t("title")}
          </span>
          {headerChip && (
            <span className="truncate rounded-full bg-soft px-2 py-0.5 text-xs font-normal text-muted-foreground">
              {headerChip}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </div>

      {alertId && (
        <AlertContextControl
          alertId={alertId}
          enabled={shareAlertContext}
          onToggle={toggleAlertContext}
          className="sm:px-5"
        />
      )}

      {/* Histórico de mensagens / estado vazio */}
      <div
        role="log"
        aria-label={t("log")}
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2.5 pt-6">
            <h3 className="m-0 text-lg font-semibold tracking-tight text-foreground">
              {t("emptyTitle")}
            </h3>
            <p className="m-0 text-xs leading-relaxed text-muted-foreground">
              {t("emptyLong")}
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
              className={`flex min-w-0 flex-col gap-1.5 ${
                m.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`min-w-0 break-words [overflow-wrap:anywhere] text-xs leading-relaxed sm:text-sm ${
                  m.role === "user"
                    ? "max-w-[88%] rounded-xl bg-primary px-3.5 py-2.5 text-primary-foreground"
                    : "max-w-[92%] text-foreground"
                }`}
              >
                {m.role === "user" ? (
                  <p className="m-0 whitespace-pre-wrap leading-relaxed">
                    {m.content}
                  </p>
                ) : (
                  <Markdown
                    content={m.content}
                    className="text-xs leading-relaxed sm:text-sm"
                  />
                )}
              </div>
              {m.role === "assistant" && (
                <AssistantAnswerMeta
                  kind={m.kind}
                  content={m.content}
                  sources={m.sources}
                  className="w-full max-w-[92%]"
                />
              )}
            </div>
          ))
        )}

        {busy && (
          <p
            role="status"
            className="m-0 flex items-center gap-1 text-xs text-muted-foreground animate-pulse"
          >
            {t("consulting")}
          </p>
        )}
        <div ref={endRef} />
      </div>

      {/* Caixa de entrada com textarea e rodapé explicativo */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3.5 sm:p-4">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-1.5 pl-3 focus-within:ring-2 focus-within:ring-ring">
          <label className="flex flex-1">
            <span className="sr-only">{t("question")}</span>
            <textarea
              ref={textareaRef}
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onTextareaKeyDown}
              placeholder={t("placeholder")}
              maxLength={2000}
              className="w-full resize-none border-0 bg-transparent py-1 text-xs text-foreground placeholder:text-muted-foreground outline-none sm:text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSend(draft)}
            aria-label={t("send")}
            disabled={busy || !draft.trim()}
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp className="size-4" strokeWidth={1.5} />
          </button>
        </div>
        <p className="m-0 text-[11px] leading-normal text-muted-foreground text-center sm:text-left">
          {t("disclaimer")}
        </p>
      </div>
    </aside>
  );
}

