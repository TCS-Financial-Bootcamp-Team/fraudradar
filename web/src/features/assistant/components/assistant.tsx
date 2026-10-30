"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { SidePanel } from "@/components/ui/side-panel";
import { useAssistant } from "../hooks/use-assistant";

function FormattedContent({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {content.split("\n").map((paragraph, i) => (
        <p key={i}>
          {paragraph
            .split(/(\*\*.*?\*\*)/g)
            .map((segment, j) =>
              segment.startsWith("**") ? (
                <strong key={j}>{segment.slice(2, -2)}</strong>
              ) : (
                segment
              ),
            )}
        </p>
      ))}
    </div>
  );
}
export function Chat({ alertId }: { alertId?: string }) {
  const { messages, busy, send } = useAssistant(alertId);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="border-b bg-muted/40 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        Contas são pseudonimizadas. Não informe dados pessoais. A IA auxilia a
        análise; a decisão é humana.
      </p>
      <div
        role="log"
        aria-label="Mensagens do assistente"
        aria-live="polite"
        className="min-h-40 flex-1 space-y-4 overflow-y-auto p-5"
      >
        {messages.length === 0 && (
          <div className="py-6">
            <Sparkles className="mb-4 text-primary" />
            <h3 className="font-medium">
              Uma segunda leitura para sua análise.
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Explore padrões, evidências e próximos passos.
            </p>
            <div className="mt-6 grid gap-2">
              {[
                "Resuma os alertas da semana",
                "Explique a tipologia fan-out",
              ].map((prompt) => (
                <button
                  className="rounded-lg border p-3 text-left text-xs hover:bg-muted"
                  key={prompt}
                  onClick={() => void send(prompt)}
                >
                  {prompt}
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
                ? "ml-8 rounded-xl bg-accent p-4"
                : "mr-3 rounded-xl border p-4"
            }
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {m.role === "user" ? "Você" : "FraudRadar IA"}
            </p>
            <FormattedContent content={m.content} />
          </div>
        ))}
        {busy && (
          <p
            role="status"
            className="animate-pulse text-sm text-muted-foreground"
          >
            Analisando o contexto…
          </p>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-end gap-2 border-t p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const current = draft;
          setDraft("");
          if (!(await send(current))) setDraft(current);
        }}
      >
        <Textarea
          aria-label="Sua pergunta ao assistente"
          className="min-h-20 resize-none"
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Pergunte sobre sua análise…"
        />
        <Button
          size="icon"
          type="submit"
          aria-label="Enviar pergunta"
          disabled={busy || !draft.trim()}
        >
          <Send />
        </Button>
      </form>
    </div>
  );
}
export function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        className="fixed bottom-6 right-6 z-40 h-12 gap-2 rounded-full px-5 shadow-md"
        onClick={() => setOpen(true)}
      >
        <Bot />
        <span>Assistente IA</span>
      </Button>
      {open && (
        <SidePanel
          title="Assistente de análise"
          onClose={() => setOpen(false)}
        >
          <Chat />
        </SidePanel>
      )}
    </>
  );
}
