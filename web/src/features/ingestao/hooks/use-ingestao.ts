"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRecurso } from "@/hooks/use-recurso";
import { mensagemErro } from "@/lib/formatacao";
import * as servico from "../services/ingestao-service";
import type { Conexao, Previa, Transacao } from "../schemas/ingestao";

export function useCsv() {
  const [previa, setPrevia] = useState<Previa>();
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [concluido, setConcluido] = useState(false);
  const arquivo = useRef<File | null>(null);
  const controle = useRef<AbortController | null>(null);
  useEffect(() => () => controle.current?.abort(), []);
  async function selecionar(novo: File) {
    controle.current?.abort();
    const atual = new AbortController();
    controle.current = atual;
    arquivo.current = null;
    setPrevia(undefined);
    setErro("");
    setLendo(true);
    setConcluido(false);
    setProgresso(0);
    try {
      const d = await servico.prepararPrevia(novo, atual.signal);
      if (!atual.signal.aborted) {
        arquivo.current = novo;
        setPrevia(d);
      }
    } catch (e) {
      if (!atual.signal.aborted) setErro(mensagemErro(e));
    } finally {
      if (!atual.signal.aborted) setLendo(false);
    }
  }
  async function enviar() {
    if (!arquivo.current || ocupado) return;
    const atual = new AbortController();
    controle.current = atual;
    setOcupado(true);
    setErro("");
    try {
      const recibo = await servico.enviarCsv(
        arquivo.current,
        setProgresso,
        atual.signal,
      );
      if (!atual.signal.aborted) {
        toast.success(recibo.mensagem);
        setConcluido(true);
      }
    } catch (e) {
      if (!atual.signal.aborted) setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }
  return {
    previa,
    erro,
    ocupado,
    lendo,
    progresso,
    concluido,
    selecionar,
    enviar,
    cancelar: () => {
      controle.current?.abort();
      setOcupado(false);
      setProgresso(0);
    },
  };
}
export function useFontes() {
  const recurso = useRecurso(servico.listarFontes);
  const [ocupado, setOcupado] = useState(false);
  async function executar(acao: () => Promise<unknown>, mensagem: string) {
    setOcupado(true);
    try {
      await acao();
      toast.success(mensagem);
      recurso.recarregar();
      return true;
    } catch (erro) {
      toast.error(mensagemErro(erro));
      return false;
    } finally {
      setOcupado(false);
    }
  }
  return {
    ...recurso,
    ocupado,
    registrar: (d: Conexao) =>
      executar(() => servico.registrarFonte(d), "Fonte registrada."),
    sincronizar: (id: string) =>
      executar(() => servico.sincronizarFonte(id), "Sincronização solicitada."),
  };
}
export function useTransacao() {
  const [entradas, setEntradas] = useState<
    Array<{
      id: string;
      origem: string;
      destino: string;
      valor: number;
      moeda: string;
    }>
  >([]);
  const [ocupado, setOcupado] = useState(false);
  return {
    entradas,
    ocupado,
    enviar: async (d: Transacao) => {
      setOcupado(true);
      try {
        const r = await servico.enviarTransacao(d);
        setEntradas((atual) => [
          {
            id: r.id,
            origem: "••••" + d.Sender_account.slice(-4),
            destino: "••••" + d.Receiver_account.slice(-4),
            valor: d.Amount,
            moeda: d.Payment_currency,
          },
          ...atual,
        ]);
        toast.success(r.mensagem);
        return true;
      } catch (erro) {
        toast.error(mensagemErro(erro));
        return false;
      } finally {
        setOcupado(false);
      }
    },
  };
}
