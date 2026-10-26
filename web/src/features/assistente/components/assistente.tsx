"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/campo";
import { PainelLateral } from "@/components/ui/painel-lateral";
import { useAssistente } from "../hooks/use-assistente";

function Texto({ texto }: { texto: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {texto.split("\n").map((linha, i) => (
        <p key={i}>
          {linha
            .split(/(\*\*.*?\*\*)/g)
            .map((parte, j) =>
              parte.startsWith("**") ? (
                <strong key={j}>{parte.slice(2, -2)}</strong>
              ) : (
                parte
              ),
            )}
        </p>
      ))}
    </div>
  );
}
export function Chat({ alertaId }: { alertaId?: string }) {
  const { mensagens, ocupado, enviar } = useAssistente(alertaId);
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "nearest" });
  }, [mensagens, ocupado]);
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
        {mensagens.length === 0 && (
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
              ].map((p) => (
                <button
                  className="rounded-lg border p-3 text-left text-xs hover:bg-muted"
                  key={p}
                  onClick={() => void enviar(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {mensagens.map((m, i) => (
          <div
            key={i}
            className={
              m.papel === "usuario"
                ? "ml-8 rounded-xl bg-accent p-4"
                : "mr-3 rounded-xl border p-4"
            }
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {m.papel === "usuario" ? "Você" : "FraudRadar IA"}
            </p>
            <Texto texto={m.texto} />
          </div>
        ))}
        {ocupado && (
          <p
            role="status"
            className="animate-pulse text-sm text-muted-foreground"
          >
            Analisando o contexto…
          </p>
        )}
        <div ref={fim} />
      </div>
      <form
        className="flex items-end gap-2 border-t p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const atual = texto;
          setTexto("");
          if (!(await enviar(atual))) setTexto(atual);
        }}
      >
        <Textarea
          aria-label="Sua pergunta ao assistente"
          className="min-h-20 resize-none"
          maxLength={2000}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Pergunte sobre sua análise…"
        />
        <Button
          size="icon"
          type="submit"
          aria-label="Enviar pergunta"
          disabled={ocupado || !texto.trim()}
        >
          <Send />
        </Button>
      </form>
    </div>
  );
}
export function AssistenteFlutuante() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button
        className="fixed bottom-6 right-6 z-40 h-12 gap-2 rounded-full px-5 shadow-md"
        onClick={() => setAberto(true)}
      >
        <Bot />
        <span>Assistente IA</span>
      </Button>
      {aberto && (
        <PainelLateral
          titulo="Assistente de análise"
          fechar={() => setAberto(false)}
        >
          <Chat />
        </PainelLateral>
      )}
    </>
  );
}
