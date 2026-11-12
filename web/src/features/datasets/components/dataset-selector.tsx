"use client";

import { useAppContext } from "@/components/app-context";
import type { Dataset } from "../schemas/datasets";

export function shouldShowDatasetSelector(datasets: Dataset[]) {
  return datasets.length > 1;
}

export function DatasetSelector() {
  const { dataset, datasets, setDataset } = useAppContext();
  if (!shouldShowDatasetSelector(datasets)) return null;
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">Conjunto de dados</span>
      <select
        aria-label="Conjunto de dados"
        value={dataset}
        onChange={(event) => setDataset(event.target.value)}
        className="h-10 max-w-[130px] truncate rounded-lg border border-topbar-border bg-topbar px-2.5 text-[13px] font-medium text-topbar-foreground outline-none transition-colors hover:bg-topbar-border focus-visible:ring-2 focus-visible:ring-topbar-foreground sm:max-w-[190px]"
      >
        {datasets.map((item) => (
          <option key={item.slug} value={item.slug}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}
