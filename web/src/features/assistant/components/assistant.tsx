"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "cn";
import { LegalSourceItem } from "@/components/legal-source-item";
import { Markdown } from "@/components/markdown";
import { useDismiss } from "@/components/layout/use-dismiss";
import { Badge } from "@/components/ui/badge";
import { ActionTooltip, TooltipProvider } from "@/components/ui/tooltip";
import { getAlertIdFromPathname } from "@/lib/sidebar";
import {
  useAlertContextPreference,
  useAssistant,
} from "../hooks/use-assistant";
import { getAnswerBadge } from "../lib/answer-badge";
import {
  formatRelativeDate,
  getContextChipLabel,
  getSuggestionKeys,
  resolveEffectiveAlertId,
} from "../lib/context";
import {
  parseEvidenceStrength,
  type EvidenceStrength,
} from "../lib/decision-strength";
import { filterAllowedLinks } from "../lib/links";
import { getModelChipState } from "../lib/models-loader";
import {
  ASSISTANT_PANEL_DEFAULT_WIDTH,
  ASSISTANT_PANEL_MIN_WIDTH,
  ASSISTANT_PANEL_STEP_PX,
  clampPanelWidth,
  getMaxPanelWidth,
  isSmallViewport,
  readStoredPanelWidth,
  writeStoredPanelWidth,
} from "../lib/panel-width";
import type {
  AiModelOption,
  ChatKind,
  ChatLink,
  Source,
} from "../schemas/assistant";

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

function AssistantKindBadge({
  kind,
  sources,
  grounded,
}: {
  kind?: ChatKind;
  sources?: Source[];
  grounded?: boolean | null;
}) {
  const t = useTranslations("assistant");
  const badge = getAnswerBadge(kind, sources, grounded);
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

function AssistantLinks({ links }: { links?: ChatLink[] }) {
  const safeLinks = filterAllowedLinks(links);
  if (safeLinks.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {safeLinks.map((link, idx) => (
        <Link
          key={`${link.href}-${idx}`}
          href={link.href}
          className="inline-flex min-h-7 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>{link.label}</span>
          <ArrowUpRight
            className="size-3.5 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </Link>
      ))}
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
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

function AssistantAnswerMeta({
  kind,
  content,
  sources,
  grounded,
  links,
  model,
  modelLabel,
  className,
  withDivider = false,
}: {
  kind?: ChatKind;
  content?: string;
  sources?: Source[];
  grounded?: boolean | null;
  links?: ChatLink[];
  model?: string | null;
  modelLabel?: string | null;
  className?: string;
  withDivider?: boolean;
}) {
  const visibleSources = grounded === false ? undefined : sources;
  const badge = getAnswerBadge(kind, visibleSources, grounded);
  const strength =
    (!kind || kind === "decision") && content
      ? parseEvidenceStrength(content)
      : null;
  const hasSources = Boolean(visibleSources && visibleSources.length > 0);
  const safeLinks = filterAllowedLinks(links);
  const displayModel = modelLabel || model || null;
  if (!badge && !strength && !hasSources && safeLinks.length === 0 && !displayModel) {
    return null;
  }

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
          <AssistantKindBadge
            kind={kind}
            sources={visibleSources}
            grounded={grounded}
          />
          {strength && <EvidenceStrengthPill strength={strength} />}
        </div>
      )}
      <AssistantLinks links={safeLinks} />
      <AssistantSources sources={visibleSources} className="w-full" />
      {displayModel && (
        <span className="text-[11px] leading-tight text-muted-foreground">
          {displayModel}
        </span>
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
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-soft/50 px-4 py-2 text-xs">
          <span
            title={t("alertContextTooltip")}
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs",
              shareAlertContext
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
            aria-pressed={shareAlertContext}
            onClick={toggleAlertContext}
            className="inline-flex min-h-7 shrink-0 items-center rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {shareAlertContext
              ? t("disableAlertContext")
              : t("enableAlertContext")}
          </button>
        </div>
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
                grounded={m.grounded}
                links={m.links}
                model={m.model}
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
 * Painel lateral direito do Assistente IA (largura ajustável a partir de 400px, altura total, sobreposto).
 * Concentra seleção de modelo, contexto da página, histórico e novo chat no compositor.
 */
export function AssistantDrawer({ isOpen, onClose }: AssistantDrawerProps) {
  const t = useTranslations("assistant");
  const locale = useLocale();
  const pathname = usePathname();
  const alertId = getAlertIdFromPathname(pathname);
  const { enabled: shareContext, toggle: toggleShareContext } =
    useAlertContextPreference();
  const effectiveAlertId = resolveEffectiveAlertId(alertId, shareContext);

  const {
    messages,
    busy,
    send,
    conversationId,
    notice,
    clearNotice,
    startNewChat,
    modelsCatalog,
    selectedModel,
    modelsLoading,
    modelsError,
    modelsAttempted,
    loadModels,
    selectModel,
    conversations,
    conversationsLoading,
    conversationsError,
    openingConversation,
    deletingConversationId,
    loadConversations,
    openConversation,
    removeConversation,
    visibleCount,
  } = useAssistant(alertId, shareContext);

  const [draft, setDraft] = useState("");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>(
    ASSISTANT_PANEL_DEFAULT_WIDTH,
  );
  const [viewportWidth, setViewportWidth] = useState<number | undefined>(
    undefined,
  );
  const [isResizing, setIsResizing] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuContainerRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const panelWidthRef = useRef<number>(ASSISTANT_PANEL_DEFAULT_WIDTH);
  const hasLoadedPanelWidthRef = useRef(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Carrega a largura salva e acompanha o redimensionamento da janela.
  useEffect(() => {
    const syncViewport = () => {
      const vw = window.innerWidth;
      setViewportWidth(vw);
      setPanelWidth((prev) => {
        const next = hasLoadedPanelWidthRef.current
          ? clampPanelWidth(prev, vw)
          : readStoredPanelWidth(undefined, vw);
        hasLoadedPanelWidthRef.current = true;
        panelWidthRef.current = next;
        return next;
      });
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    panelWidthRef.current = panelWidth;
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty(
        "--assistant-panel-width",
        `${panelWidth}px`,
      );
    }
  }, [panelWidth]);

  useEffect(() => {
    if (!isOpen) {
      dragStateRef.current = null;
    }
  }, [isOpen]);

  // Carrega catálogo de modelos uma vez por montagem, sem repetir após falha.
  useEffect(() => {
    if (
      isOpen &&
      !modelsAttempted &&
      !modelsCatalog &&
      !modelsLoading &&
      !modelsError
    ) {
      void loadModels();
    }
  }, [
    isOpen,
    modelsAttempted,
    modelsCatalog,
    modelsLoading,
    modelsError,
    loadModels,
  ]);

  // Ajusta altura automática da textarea ao digitar ou limpar.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft, isOpen]);

  // Fecha o menu de modelos ao clicar fora ou apertar Escape.
  useDismiss(isModelMenuOpen, modelMenuContainerRef, (reason) => {
    setIsModelMenuOpen(false);
    if (reason === "escape") {
      modelTriggerRef.current?.focus();
    }
  });

  // Foco e hierarquia do Escape: menu de modelos -> painel de histórico -> drawer.
  useEffect(() => {
    if (!isOpen) return;
    textareaRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isModelMenuOpen) return;
      if (isHistoryOpen) {
        setIsHistoryOpen(false);
        setConfirmDeleteId(null);
        historyButtonRef.current?.focus();
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isModelMenuOpen, isHistoryOpen, onClose]);

  // Rola até o final ao receber mensagens.
  useEffect(() => {
    if (isOpen && !isHistoryOpen) {
      endRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [messages, busy, isOpen, isHistoryOpen]);

  const handleToggleHistory = () => {
    setIsModelMenuOpen(false);
    setConfirmDeleteId(null);
    setIsHistoryOpen((prev) => {
      const next = !prev;
      if (next) {
        void loadConversations();
      }
      return next;
    });
  };

  const handleNewChat = () => {
    setIsHistoryOpen(false);
    setConfirmDeleteId(null);
    setIsModelMenuOpen(false);
    startNewChat();
    textareaRef.current?.focus();
  };

  const handleOpenModelMenu = () => {
    if (!modelsAttempted && !modelsCatalog && !modelsLoading && !modelsError) {
      void loadModels();
    }
    setIsModelMenuOpen(true);
    modelTriggerRef.current?.focus();
  };

  if (!isOpen) return null;

  const smallScreen = isSmallViewport(viewportWidth);
  const maxPanelWidth = getMaxPanelWidth(viewportWidth);
  const effectiveIsResizing = isOpen && isResizing;

  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (smallScreen) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignora ambientes sem suporte a pointer capture.
    }
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: panelWidthRef.current,
    };
    setIsResizing(true);
  };

  const handleResizePointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId || smallScreen) return;
    const vw = typeof window !== "undefined" ? window.innerWidth : viewportWidth;
    const next = clampPanelWidth(drag.startWidth + (drag.startX - event.clientX), vw);
    panelWidthRef.current = next;
    setPanelWidth(next);
  };

  const finishResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignora ambientes sem suporte a pointer capture.
    }
    dragStateRef.current = null;
    setIsResizing(false);
    const vw = typeof window !== "undefined" ? window.innerWidth : viewportWidth;
    writeStoredPanelWidth(panelWidthRef.current, undefined, vw);
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (smallScreen) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta =
      event.key === "ArrowLeft"
        ? ASSISTANT_PANEL_STEP_PX
        : -ASSISTANT_PANEL_STEP_PX;
    const vw = typeof window !== "undefined" ? window.innerWidth : viewportWidth;
    const next = clampPanelWidth(panelWidthRef.current + delta, vw);
    panelWidthRef.current = next;
    setPanelWidth(next);
    writeStoredPanelWidth(next, undefined, vw);
  };

  const handleResizeDoubleClick = () => {
    if (smallScreen) return;
    const vw = typeof window !== "undefined" ? window.innerWidth : viewportWidth;
    const next = clampPanelWidth(ASSISTANT_PANEL_DEFAULT_WIDTH, vw);
    panelWidthRef.current = next;
    setPanelWidth(next);
    writeStoredPanelWidth(next, undefined, vw);
  };

  const models: AiModelOption[] = modelsCatalog?.models ?? [];
  const chipState = getModelChipState(
    {
      loading: modelsLoading,
      catalog: modelsCatalog,
      selectedModel,
    },
    t("modelPicker.label"),
  );
  const modelButtonLabel =
    chipState.mode === "selected" ? chipState.label : t(chipState.labelKey);

  const resolveModelLabel = (modelId?: string | null) => {
    if (!modelId) return null;
    return models.find((item) => item.id === modelId)?.label ?? modelId;
  };

  const contextChipLabel = getContextChipLabel({
    pathname,
    alertId,
    visibleCount,
    locale,
  });

  const suggestionKeys = getSuggestionKeys(effectiveAlertId, pathname);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setIsHistoryOpen(false);
    setIsModelMenuOpen(false);
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
    <TooltipProvider delay={300}>
      <aside
        role="dialog"
        aria-label={t("title")}
        aria-modal={false}
        data-assistant-drawer="open"
        style={
          smallScreen
            ? undefined
            : ({ "--assistant-panel-width": `${panelWidth}px` } as CSSProperties)
        }
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex h-screen w-full max-w-full flex-col border-l border-border bg-card text-foreground shadow-xl [animation:assistant-drawer-in_0.2s_ease-out] sm:w-[var(--assistant-panel-width,400px)]",
          effectiveIsResizing && "select-none",
        )}
      >
        {!smallScreen && (
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={t("resizeHandle")}
            aria-valuenow={panelWidth}
            aria-valuemin={ASSISTANT_PANEL_MIN_WIDTH}
            aria-valuemax={maxPanelWidth}
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
            onKeyDown={handleResizeKeyDown}
            onDoubleClick={handleResizeDoubleClick}
            className="group absolute inset-y-0 -left-1.5 z-20 hidden w-3 cursor-col-resize touch-none select-none items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-10 w-1 rounded-full transition-colors",
                effectiveIsResizing
                  ? "bg-foreground/60"
                  : "bg-border group-hover:bg-muted-foreground/60",
              )}
            />
          </div>
        )}
        {/* Topo enxuto do drawer: apenas título e fechar */}
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-border px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Sparkles
              className="size-4 shrink-0 text-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="truncate text-sm font-semibold text-foreground">
              {t("title")}
            </span>
          </div>
          <ActionTooltip label={t("close")} side="left">
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" strokeWidth={1.5} />
            </button>
          </ActionTooltip>
        </div>

        {/* Painel de histórico dentro do drawer OU conversa ativa */}
        {isHistoryOpen ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-soft px-4 py-2.5 sm:px-5">
              <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("history.title")}
              </h2>
              <ActionTooltip label={t("history.close")} side="left">
                <button
                  type="button"
                  onClick={() => {
                    setIsHistoryOpen(false);
                    setConfirmDeleteId(null);
                    historyButtonRef.current?.focus();
                  }}
                  aria-label={t("history.close")}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" strokeWidth={1.5} />
                </button>
              </ActionTooltip>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3 sm:p-4">
              {conversationsLoading ? (
                <p
                  role="status"
                  className="py-8 text-center text-xs text-muted-foreground"
                >
                  {t("history.loading")}
                </p>
              ) : conversationsError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-border bg-soft/40 p-4 text-xs"
                >
                  <p className="m-0 text-foreground">{conversationsError}</p>
                  <button
                    type="button"
                    onClick={() => void loadConversations()}
                    className="mt-2 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t("history.retry")}
                  </button>
                </div>
              ) : conversations.length === 0 ? (
                <p className="py-10 text-center text-xs text-muted-foreground">
                  {t("history.empty")}
                </p>
              ) : (
                conversations.map((conv) => {
                  const isActive = conv.id === conversationId;
                  const isConfirming = confirmDeleteId === conv.id;
                  const isDeleting = deletingConversationId === conv.id;

                  return (
                    <div
                      key={conv.id}
                      className={cn(
                        "flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                        isActive
                          ? "border-foreground/30 bg-soft/70"
                          : "border-border bg-card hover:bg-soft/40",
                      )}
                    >
                      <button
                        type="button"
                        disabled={openingConversation || isDeleting}
                        onClick={async () => {
                          const ok = await openConversation(conv.id);
                          if (ok) {
                            setIsHistoryOpen(false);
                            setConfirmDeleteId(null);
                          }
                        }}
                        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                      >
                        <span className="w-full truncate text-xs font-medium text-foreground">
                          {conv.title}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatRelativeDate(conv.updated_at, locale)}
                        </span>
                      </button>

                      {isConfirming ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => {
                              setConfirmDeleteId(null);
                              void removeConversation(conv.id);
                            }}
                            className="inline-flex min-h-7 items-center rounded-md bg-signal px-2 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {t("history.confirmDelete")}
                          </button>
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => setConfirmDeleteId(null)}
                            className="inline-flex min-h-7 items-center rounded-md border border-border bg-card px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {t("history.cancelDelete")}
                          </button>
                        </div>
                      ) : (
                        <ActionTooltip label={t("history.delete")} side="left">
                          <button
                            type="button"
                            aria-label={t("history.delete")}
                            disabled={isDeleting}
                            onClick={() => setConfirmDeleteId(conv.id)}
                            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Trash2 className="size-3.5" strokeWidth={1.5} />
                          </button>
                        </ActionTooltip>
                      )}
                    </div>
                  );
                })
              )}
              {openingConversation && (
                <p
                  role="status"
                  className="py-2 text-center text-xs text-muted-foreground animate-pulse"
                >
                  {t("history.openingConversation")}
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Histórico de mensagens / estado vazio */
          <div
            role="log"
            aria-label={t("log")}
            aria-live="polite"
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5"
          >
            {notice && (
              <div
                role="status"
                className="flex items-start justify-between gap-2 rounded-xl border border-border bg-soft/70 px-3 py-2.5 text-xs text-foreground"
              >
                <span>{notice}</span>
                <button
                  type="button"
                  onClick={clearNotice}
                  aria-label={t("close")}
                  className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" strokeWidth={1.5} />
                </button>
              </div>
            )}

            {messages.length === 0 ? (
              <div className="flex flex-col gap-2.5 pt-4">
                <h3 className="m-0 text-lg font-semibold tracking-tight text-foreground">
                  {t("emptyTitle")}
                </h3>
                <p className="m-0 text-xs leading-relaxed text-muted-foreground">
                  {t("emptyLong")}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {suggestionKeys.map((key) => {
                    const suggestion = t(`suggestions.${key}`);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => void handleSend(suggestion)}
                        className="min-h-10 rounded-xl border border-border bg-card p-3 text-left text-xs text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {suggestion}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex min-w-0 flex-col gap-1.5",
                    m.role === "user" ? "items-end" : "items-start",
                  )}
                >
                  {m.errorCode ? (
                    <div
                      role="alert"
                      className="flex max-w-[92%] flex-col items-start gap-2 rounded-xl border border-signal/40 bg-signal/5 px-3.5 py-2.5 text-xs leading-relaxed text-foreground sm:text-sm"
                    >
                      <p className="m-0">{m.content}</p>
                      <button
                        type="button"
                        onClick={handleOpenModelMenu}
                        className="inline-flex min-h-7 items-center rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {t("modelPicker.switchModel")}
                      </button>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "min-w-0 break-words [overflow-wrap:anywhere] text-xs leading-relaxed sm:text-sm",
                        m.role === "user"
                          ? "max-w-[88%] rounded-xl bg-primary px-3.5 py-2.5 text-primary-foreground"
                          : "max-w-[92%] text-foreground",
                      )}
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
                  )}

                  {m.role === "assistant" && !m.errorCode && (
                    <AssistantAnswerMeta
                      kind={m.kind}
                      content={m.content}
                      sources={m.sources}
                      grounded={m.grounded}
                      links={m.links}
                      model={m.model}
                      modelLabel={resolveModelLabel(m.model)}
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
        )}

        {/* Compositor único com barra de controles embaixo (estilo Cursor) */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3 sm:p-4">
          <div className="rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-ring">
            <label className="block px-3 pt-2.5">
              <span className="sr-only">{t("question")}</span>
              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onTextareaKeyDown}
                placeholder={t("placeholder")}
                maxLength={2000}
                className="max-h-40 min-h-[36px] w-full resize-none border-0 bg-transparent p-0 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground outline-none sm:text-sm"
              />
            </label>

            {/* Barra inferior interna do compositor */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 px-2 pb-2 pt-1.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {/* Seletor de modelo */}
                <div ref={modelMenuContainerRef} className="relative min-w-0">
                  <ActionTooltip label={t("modelPicker.label")} side="top">
                    <button
                      ref={modelTriggerRef}
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={isModelMenuOpen}
                      aria-label={t("modelPicker.label")}
                      onClick={() => {
                        if (
                          !modelsAttempted &&
                          !modelsCatalog &&
                          !modelsLoading &&
                          !modelsError
                        ) {
                          void loadModels();
                        }
                        setIsModelMenuOpen((prev) => !prev);
                      }}
                      className="inline-flex h-7 max-w-[140px] items-center gap-1 rounded-lg border border-border bg-soft/60 px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[165px]"
                    >
                      <span className="truncate">{modelButtonLabel}</span>
                      <ChevronDown
                        className={cn(
                          "size-3 shrink-0 text-muted-foreground transition-transform duration-150",
                          isModelMenuOpen && "rotate-180",
                        )}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </button>
                  </ActionTooltip>

                  {isModelMenuOpen && (
                    <div
                      role="menu"
                      aria-label={t("modelPicker.label")}
                      className="absolute bottom-full left-0 z-30 mb-1.5 min-w-[200px] max-w-[260px] rounded-xl border border-border bg-card p-1 shadow-lg"
                    >
                      {modelsLoading ? (
                        <p className="m-0 px-2.5 py-2 text-xs text-muted-foreground">
                          {t("modelPicker.loading")}
                        </p>
                      ) : models.length === 0 ? (
                        <div className="px-2.5 py-2 text-xs text-muted-foreground">
                          <p className="m-0">{t("modelPicker.unavailable")}</p>
                          <button
                            type="button"
                            onClick={() => void loadModels(true)}
                            className="mt-1 font-medium text-foreground underline underline-offset-4"
                          >
                            {t("history.retry")}
                          </button>
                        </div>
                      ) : (
                        models.map((opt) => {
                          const isSelected = opt.id === selectedModel;
                          const isDefault = opt.id === modelsCatalog?.default;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              role="menuitemradio"
                              aria-checked={isSelected}
                              onClick={() => {
                                selectModel(opt.id);
                                setIsModelMenuOpen(false);
                                modelTriggerRef.current?.focus();
                              }}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isSelected
                                  ? "bg-soft font-medium text-foreground"
                                  : "text-foreground",
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {opt.label}
                              </span>
                              <span className="flex shrink-0 items-center gap-1">
                                {isDefault && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {t("modelPicker.defaultTag")}
                                  </span>
                                )}
                                {isSelected && (
                                  <Check
                                    className="size-3.5 text-foreground"
                                    strokeWidth={1.5}
                                    aria-hidden="true"
                                  />
                                )}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Chip de contexto da página (alterna compartilhamento) */}
                <ActionTooltip
                  label={
                    shareContext
                      ? t("contextChip.enabledTooltip")
                      : t("contextChip.disabledTooltip")
                  }
                  side="top"
                >
                  <button
                    type="button"
                    aria-pressed={shareContext}
                    onClick={toggleShareContext}
                    className={cn(
                      "inline-flex h-7 max-w-[155px] items-center gap-1 rounded-lg border border-border px-2 text-[11px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[180px]",
                      shareContext
                        ? "bg-soft/60 text-foreground"
                        : "bg-card text-muted-foreground line-through opacity-70",
                    )}
                  >
                    {shareContext ? (
                      <ShieldCheck
                        className="size-3 shrink-0 text-muted-foreground"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    ) : (
                      <ShieldOff
                        className="size-3 shrink-0 text-muted-foreground"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate tabular-nums">
                      {contextChipLabel}
                    </span>
                  </button>
                </ActionTooltip>
              </div>

              {/* Ações à direita: histórico, nova conversa e enviar */}
              <div className="flex shrink-0 items-center gap-1">
                <ActionTooltip label={t("history.open")} side="top">
                  <button
                    ref={historyButtonRef}
                    type="button"
                    aria-label={t("history.open")}
                    aria-expanded={isHistoryOpen}
                    onClick={handleToggleHistory}
                    className={cn(
                      "grid size-7 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isHistoryOpen
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Clock className="size-3.5" strokeWidth={1.5} />
                  </button>
                </ActionTooltip>

                <ActionTooltip label={t("history.newChat")} side="top">
                  <button
                    type="button"
                    aria-label={t("history.newChat")}
                    onClick={handleNewChat}
                    className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="size-3.5" strokeWidth={1.5} />
                  </button>
                </ActionTooltip>

                <ActionTooltip label={t("send")} side="top">
                  <button
                    type="button"
                    onClick={() => void handleSend(draft)}
                    aria-label={t("send")}
                    disabled={busy || !draft.trim()}
                    className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ArrowUp className="size-3.5" strokeWidth={1.5} />
                  </button>
                </ActionTooltip>
              </div>
            </div>
          </div>
          <p className="m-0 text-center text-[11px] leading-normal text-muted-foreground sm:text-left">
            {t("disclaimer")}
          </p>
        </div>
      </aside>
    </TooltipProvider>
  );
}
