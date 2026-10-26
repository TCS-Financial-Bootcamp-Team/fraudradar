"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { lerFiltros } from "../schemas";
import { obterVisao, obterFilhos, obterDetalhe, obterLista } from "../services/cliente";
export function useConsulta<T>(
  chave: string,
  carregar: (signal: AbortSignal) => Promise<T>,
  ativo = true,
) {
  const [estado, setEstado] = useState<{ chave: string; data?: T; erro?: string }>({ chave: "" });
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    const ac = new AbortController();
    carregar(ac.signal)
      .then((data) => setEstado({ chave, data }))
      .catch((e) => {
        if (ac.signal.aborted) return;
        const erro = e instanceof Error ? e.message : "Falha ao carregar.";
        setEstado({ chave, erro });
        toast.error(erro);
      });
    return () => ac.abort();
  }, [chave, ativo, carregar, tentativa]);
  return {
    data: estado.chave === chave ? estado.data : undefined,
    erro: estado.chave === chave ? estado.erro : undefined,
    recarregar: () => setTentativa((n) => n + 1),
  };
}
export function useRegistros() {
  const params = useSearchParams();
  const router = useRouter();
  const serial = params.toString();
  const parametrosAtuais = useRef(serial);
  useEffect(() => {
    parametrosAtuais.current = serial;
  }, [serial]);
  const filtros = lerFiltros(new URLSearchParams(serial));
  const parametros = new URLSearchParams();
  for (const [nome, valor] of Object.entries(filtros)) {
    for (const item of Array.isArray(valor) ? valor : [valor]) {
      if (item) parametros.append(nome, item);
    }
  }
  const chave = parametros.toString();
  const carregar = useCallback((s: AbortSignal) => obterVisao(chave, s), [chave]);
  const consulta = useConsulta(chave, carregar);
  function mudar(valores: Record<string, string | string[]>) {
    const p = new URLSearchParams(parametrosAtuais.current);
    for (const [k, v] of Object.entries(valores)) {
      p.delete(k);
      for (const item of Array.isArray(v) ? v : [v]) if (item) p.append(k, item);
    }
    parametrosAtuais.current = p.toString();
    router.replace(`/?${p}`, { scroll: false });
  }
  return {
    ...consulta,
    filtros,
    mudar,
    selecionado: params.get("no"),
    linha: params.get("vista") === "tempo",
    apresentacao: params.get("apresentacao") === "1",
  };
}
export function useFilhos(pai: string | null, ativo: boolean) {
  const carregar = useCallback((s: AbortSignal) => obterFilhos(pai, s), [pai]);
  return useConsulta(pai ?? "raiz", carregar, ativo);
}
export function useDetalhe(id: string | null) {
  const carregar = useCallback((s: AbortSignal) => obterDetalhe(id!, s), [id]);
  return useConsulta(id ?? "", carregar, !!id);
}
export function useLista(ids: string[]) {
  const chave = ids.join(",");
  const carregar = useCallback(
    (s: AbortSignal) => obterLista(chave.split(",").filter(Boolean), s),
    [chave],
  );
  return useConsulta(chave, carregar);
}
