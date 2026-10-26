"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePathname } from "next/navigation";
import { useContextoApp } from "@/components/app-context";
import { mensagemErro, pseudonimizar } from "@/lib/formatacao";
import { conversar } from "../services/assistente-service";
import type { Mensagem } from "../schemas/assistente";

export function useAssistente(alertaId?: string) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const controle = useRef<AbortController | null>(null);
  const bloqueado = useRef(false);
  const pagina = usePathname();
  const { semana } = useContextoApp();
  useEffect(() => () => controle.current?.abort(), []);
  async function enviar(texto: string) {
    const mensagem = pseudonimizar(texto.trim());
    if (!mensagem || bloqueado.current) return false;
    bloqueado.current = true;
    const abortador = new AbortController();
    controle.current = abortador;
    setOcupado(true);
    setMensagens((m) => [...m, { papel: "usuario", texto: mensagem }]);
    try {
      const resposta = await conversar(
        {
          mensagem,
          contexto: { pagina, semana, alerta_id: alertaId },
          historico: mensagens.slice(-20),
        },
        abortador.signal,
      );
      if (!abortador.signal.aborted)
        setMensagens((m) => [
          ...m,
          {
            papel: "assistente",
            texto:
              resposta.resposta +
              (resposta.fontes.length
                ? "\n\nFontes: " +
                  resposta.fontes.map((f) => f.titulo).join("; ")
                : ""),
          },
        ]);
      return true;
    } catch (erro) {
      if (!abortador.signal.aborted) {
        toast.error(mensagemErro(erro));
        setMensagens((m) => [
          ...m,
          {
            papel: "assistente",
            texto:
              "Não foi possível responder. Tente enviar sua pergunta novamente.",
          },
        ]);
      }
      return false;
    } finally {
      bloqueado.current = false;
      if (!abortador.signal.aborted) setOcupado(false);
    }
  }
  return { mensagens, ocupado, enviar };
}
