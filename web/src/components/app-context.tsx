"use client";

import { createContext, useContext, useState } from "react";
import { USA_MOCKS } from "@/lib/api";

function semanaInicial() {
  if (USA_MOCKS) return "2026-10-19";
  const hoje = new Date();
  const dia = hoje.getUTCDay() || 7;
  hoje.setUTCDate(hoje.getUTCDate() - dia + 1);
  return hoje.toISOString().slice(0, 10);
}

const Contexto = createContext<{
  semana: string;
  setSemana: (valor: string) => void;
  revisao: number;
  atualizar: () => void;
}>({
  semana: "2026-10-19",
  setSemana: () => {},
  revisao: 0,
  atualizar: () => {},
});
export function ContextoApp({ children }: { children: React.ReactNode }) {
  const [semana, setSemana] = useState(semanaInicial);
  const [revisao, setRevisao] = useState(0);
  return (
    <Contexto.Provider
      value={{
        semana,
        setSemana,
        revisao,
        atualizar: () => setRevisao((v) => v + 1),
      }}
    >
      {children}
    </Contexto.Provider>
  );
}
export const useContextoApp = () => useContext(Contexto);
