"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { mensagemErro } from "@/lib/formatacao";
import * as servico from "../services/autenticacao-service";
import type { Cadastro, Login } from "../schemas/autenticacao";

export function useAutenticacao() {
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const router = useRouter();
  async function executar(acao: () => Promise<void>) {
    setOcupado(true);
    try {
      await acao();
    } catch (erro) {
      toast.error(mensagemErro(erro));
    } finally {
      setOcupado(false);
    }
  }
  const navegar = () => {
    router.replace("/dashboard");
    router.refresh();
  };
  return {
    ocupado,
    mensagem,
    entrar: (d: Login) =>
      executar(async () => {
        await servico.entrar(d);
        navegar();
      }),
    cadastrar: (d: Cadastro) =>
      executar(async () => {
        if (await servico.cadastrar(d)) navegar();
        else
          setMensagem(
            "Confira seu e-mail para confirmar o cadastro e acessar o FraudRadar.",
          );
      }),
    recuperar: (d: { email: string }) =>
      executar(async () => {
        await servico.recuperar(d);
        setMensagem(
          "Se houver uma conta com esse e-mail, você receberá um link para redefinir a senha.",
        );
      }),
    redefinir: (d: { senha: string; confirmacao: string }) =>
      executar(async () => {
        await servico.redefinir(d);
        toast.success("Senha atualizada.");
        navegar();
      }),
    sair: () =>
      executar(async () => {
        await servico.sair();
        router.replace("/login");
        router.refresh();
      }),
  };
}
