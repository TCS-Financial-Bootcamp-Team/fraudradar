"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useContextoApp } from "@/components/app-context";
import { useRecurso } from "@/hooks/use-recurso";
import { mensagemErro } from "@/lib/formatacao";
import * as servico from "../services/alertas-service";
import type { Decisao } from "../schemas/alertas";

export function useFila(status = "", pais = "", pagina = 1) {
  const { semana, revisao } = useContextoApp();
  const carregar = useCallback(
    (signal: AbortSignal) => {
      void revisao;
      return servico.buscarAlertas({ semana, status, pais, pagina }, signal);
    },
    [semana, status, pais, pagina, revisao],
  );
  return useRecurso(carregar);
}
export function useMonitoramento() {
  const { semana, revisao } = useContextoApp();
  return useRecurso(
    useCallback(
      (signal: AbortSignal) => {
        void revisao;
        return servico.buscarMonitoramento(semana, signal);
      },
      [semana, revisao],
    ),
  );
}
export function useDetalhe(id: string) {
  const { revisao, atualizar } = useContextoApp();
  const recurso = useRecurso(
    useCallback(
      async (signal: AbortSignal) => {
        void revisao;
        const [detalhe, grafo] = await Promise.all([
          servico.buscarDetalhe(id, signal),
          servico.buscarGrafo(id, signal),
        ]);
        return { detalhe, grafo };
      },
      [id, revisao],
    ),
  );
  const [ocupado, setOcupado] = useState(false);
  async function executar(acao: () => Promise<unknown>, mensagem: string) {
    setOcupado(true);
    try {
      await acao();
      toast.success(mensagem);
      atualizar();
      recurso.recarregar();
    } catch (erro) {
      toast.error(mensagemErro(erro));
    } finally {
      setOcupado(false);
    }
  }
  return {
    ...recurso,
    ocupado,
    gerarParecer: () =>
      executar(() => servico.gerarParecer(id), "Parecer gerado para revisão."),
    decidir: (d: Decisao) =>
      executar(() => servico.registrarDecisao(id, d), "Decisão registrada."),
  };
}
export function useReplay() {
  const { semana, setSemana, atualizar } = useContextoApp();
  const [ocupado, setOcupado] = useState(false);
  return {
    ocupado,
    processar: async () => {
      setOcupado(true);
      try {
        const resultado = await servico.proximaSemana(semana);
        setSemana(resultado.semana);
        atualizar();
        toast.success(resultado.alertas_gerados + " alertas na nova semana.");
      } catch (erro) {
        toast.error(mensagemErro(erro));
      } finally {
        setOcupado(false);
      }
    },
  };
}
export function useComunicacoes() {
  const { semana, revisao, atualizar } = useContextoApp();
  const recurso = useRecurso(
    useCallback(
      (signal: AbortSignal) => {
        void revisao;
        return servico.listarComunicacoes(semana, signal);
      },
      [semana, revisao],
    ),
  );
  const [ocupado, setOcupado] = useState(false);
  return {
    ...recurso,
    ocupado,
    aprovar: async (id: string, texto: string) => {
      setOcupado(true);
      try {
        await servico.aprovarComunicacao(id, texto);
        toast.success("Rascunho aprovado. Nenhum envio externo foi realizado.");
        atualizar();
        recurso.recarregar();
      } catch (erro) {
        toast.error(mensagemErro(erro));
      } finally {
        setOcupado(false);
      }
    },
  };
}
