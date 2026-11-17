"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import { useWeekCatalog } from "@/features/alerts/hooks/use-week-catalog";
import type { Weeks } from "@/features/alerts/schemas/alerts";
import { useDatasets } from "@/features/datasets/hooks/use-datasets";
import type { Dataset } from "@/features/datasets/schemas/datasets";
import {
  DEFAULT_DATASET,
  readStoredDataset,
  selectDataset,
} from "@/lib/dataset";

type AppContextValue = {
  dataset: string;
  setDataset: (value: string) => void;
  datasets: Dataset[];
  /** Semana em exibição (segunda-feira, AAAA-MM-DD); "" quando nenhuma foi processada. */
  week: string;
  setWeek: (value: string) => void;
  /** Períodos processados, do mais recente para o mais antigo. */
  weeks: string[];
  nextRelease: string | null;
  weeksLoading: boolean;
  weeksError?: string;
  reloadWeeks: () => void;
  revision: number;
  refresh: () => void;
};

const AppContext = createContext<AppContextValue>({
  dataset: DEFAULT_DATASET,
  setDataset: () => {},
  datasets: [],
  week: "",
  setWeek: () => {},
  weeks: [],
  nextRelease: null,
  weeksLoading: true,
  reloadWeeks: () => {},
  revision: 0,
  refresh: () => {},
});

// A semana escolhida só vale se estiver entre as processadas; senão vale a mais recente. Assim
// o app abre na última semana com dados (não na semana de hoje, que não existe no SAML-D) e
// nunca mostra uma semana sem transações processadas.
function pickWeek(selected: string | null, catalog?: Weeks) {
  if (!catalog) return "";
  if (selected && catalog.items.some((item) => item.week === selected))
    return selected;
  return catalog.current ?? "";
}

export function pickDataset(selected: string, datasets: Dataset[]) {
  if (datasets.some((item) => item.slug === selected)) return selected;
  if (datasets.some((item) => item.slug === DEFAULT_DATASET))
    return DEFAULT_DATASET;
  return datasets[0]?.slug ?? DEFAULT_DATASET;
}

export function AppContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selectedDataset, setDatasetState] = useState(readStoredDataset);
  const [selected, setSelected] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const datasetCatalog = useDatasets();
  const datasets = datasetCatalog.data ?? [];
  const dataset = datasetCatalog.data?.length
    ? pickDataset(selectedDataset, datasets)
    : selectedDataset;
  const catalog = useWeekCatalog(revision, dataset);
  const data = catalog.data;

  const changeDataset = useCallback((value: string) => {
    const next = selectDataset(value);
    setDatasetState(next);
    setSelected(null);
    setRevision((current) => current + 1);
  }, []);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  return (
    <AppContext.Provider
      value={{
        dataset,
        setDataset: changeDataset,
        datasets,
        week: pickWeek(selected, data),
        setWeek: setSelected,
        weeks: data?.items.map((item) => item.week) ?? [],
        nextRelease: data?.next_release ?? null,
        weeksLoading: catalog.loading,
        weeksError: catalog.error,
        reloadWeeks: catalog.reload,
        revision,
        refresh,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export const useAppContext = () => useContext(AppContext);
