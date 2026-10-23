"use client";

import { useCallback, useEffect, useState } from "react";

import type { Saude } from "../schemas/saude";
import { buscarSaude } from "../services/saude-service";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "ok"; saude: Saude }
  | { tipo: "erro"; mensagem: string };

export function useSaude() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const controle = new AbortController();
    buscarSaude(controle.signal)
      .then((saude) => setEstado({ tipo: "ok", saude }))
      .catch((erro: unknown) => {
        if (controle.signal.aborted) return;
        setEstado({
          tipo: "erro",
          mensagem: erro instanceof Error ? erro.message : "API inacessível",
        });
      });
    return () => controle.abort();
  }, [versao]);

  const recarregar = useCallback(() => {
    setEstado({ tipo: "carregando" });
    setVersao((v) => v + 1);
  }, []);

  return { estado, recarregar };
}
