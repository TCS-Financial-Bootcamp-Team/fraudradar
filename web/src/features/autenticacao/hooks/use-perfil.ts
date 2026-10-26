"use client";
import { toast } from "sonner";
import { useState } from "react";
import { useRecurso } from "@/hooks/use-recurso";
import { mensagemErro } from "@/lib/formatacao";
import { buscarPerfil, salvarPerfil } from "../services/autenticacao-service";

export function usePerfil() {
  const recurso = useRecurso(buscarPerfil);
  const [ocupado, setOcupado] = useState(false);
  return {
    ...recurso,
    ocupado,
    salvar: async (nome: string) => {
      setOcupado(true);
      try {
        await salvarPerfil({ nome });
        toast.success("Perfil atualizado.");
        recurso.recarregar();
      } catch (erro) {
        toast.error(mensagemErro(erro));
      } finally {
        setOcupado(false);
      }
    },
  };
}
