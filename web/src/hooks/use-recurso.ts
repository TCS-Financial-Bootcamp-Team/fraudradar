"use client";

import { useCallback, useEffect, useState } from "react";
import { mensagemErro } from "@/lib/formatacao";

export function useRecurso<T>(carregar: (signal: AbortSignal) => Promise<T>) {
  const [estado, setEstado] = useState<{
    origem?: typeof carregar;
    dados?: T;
    erro?: string;
    carregando: boolean;
  }>({ carregando: true });
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    const controle = new AbortController();
    carregar(controle.signal)
      .then((dados) => {
        if (!controle.signal.aborted) setEstado({ origem: carregar, dados, carregando: false });
      })
      .catch((erro: unknown) => {
        if (!controle.signal.aborted)
          setEstado({ origem: carregar, erro: mensagemErro(erro), carregando: false });
      });
    return () => controle.abort();
  }, [carregar, versao]);
  const recarregar = useCallback(() => {
    setEstado({ carregando: true });
    setVersao((v) => v + 1);
  }, []);
  // Uma troca de filtro nunca exibe o resultado da consulta anterior.
  if (estado.origem !== carregar) return { dados: undefined, erro: undefined, carregando: true, recarregar };
  return { dados: estado.dados, erro: estado.erro, carregando: estado.carregando, recarregar };
}
