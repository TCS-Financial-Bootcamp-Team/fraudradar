"use client";

import { createContext, useContext, useState } from "react";
import { useWeekCatalog } from "@/features/alerts/hooks/use-week-catalog";
import type { Weeks } from "@/features/alerts/schemas/alerts";

type AppContextValue = {
  /** Semana em exibição (segunda-feira, AAAA-MM-DD); "" quando nenhuma foi liberada. */
  week: string;
  setWeek: (value: string) => void;
  /** Semanas liberadas, da mais recente para a mais antiga: as únicas que dá para escolher. */
  weeks: string[];
  nextRelease: string | null;
  weeksLoading: boolean;
  weeksError?: string;
  reloadWeeks: () => void;
  revision: number;
  refresh: () => void;
};

const AppContext = createContext<AppContextValue>({
  week: "",
  setWeek: () => {},
  weeks: [],
  nextRelease: null,
  weeksLoading: true,
  reloadWeeks: () => {},
  revision: 0,
  refresh: () => {},
});

// A semana escolhida só vale se estiver entre as liberadas; senão vale a mais recente. Assim
// o app abre na última semana com dados (não na semana de hoje, que não existe no SAML-D) e
// nunca mostra uma semana sem transações processadas.
function pickWeek(selected: string | null, catalog?: Weeks) {
  if (!catalog) return "";
  if (selected && catalog.items.some((item) => item.week === selected))
    return selected;
  return catalog.current ?? "";
}

export function AppContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const catalog = useWeekCatalog(revision);
  // Enquanto recarrega (depois de um replay), o useResource não devolve dado: vale o último
  // catálogo, para a tela não piscar como se não houvesse semana.
  const [lastCatalog, setLastCatalog] = useState<Weeks>();
  if (catalog.data && catalog.data !== lastCatalog) setLastCatalog(catalog.data);
  const data = catalog.data ?? lastCatalog;
  return (
    <AppContext.Provider
      value={{
        week: pickWeek(selected, data),
        setWeek: setSelected,
        weeks: data?.items.map((item) => item.week) ?? [],
        nextRelease: data?.next_release ?? null,
        weeksLoading: !data && !catalog.error,
        weeksError: catalog.error,
        reloadWeeks: catalog.reload,
        revision,
        refresh: () => setRevision((v) => v + 1),
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export const useAppContext = () => useContext(AppContext);
