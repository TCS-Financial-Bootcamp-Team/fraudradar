"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { parseFilters } from "../schemas";
import { getView, getChildren, getDetail, getList } from "../services/client";
export function useQuery<T>(
  queryKey: string,
  loader: (signal: AbortSignal) => Promise<T>,
  enabled = true,
) {
  const [state, setState] = useState<{ queryKey: string; data?: T; error?: string }>({
    queryKey: "",
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    loader(ac.signal)
      .then((data) => setState({ queryKey, data }))
      .catch((e) => {
        if (ac.signal.aborted) return;
        const error = e instanceof Error ? e.message : "Falha ao carregar.";
        setState({ queryKey, error });
        toast.error(error);
      });
    return () => ac.abort();
  }, [queryKey, enabled, loader, attempt]);
  return {
    data: state.queryKey === queryKey ? state.data : undefined,
    error: state.queryKey === queryKey ? state.error : undefined,
    reload: () => setAttempt((n) => n + 1),
  };
}
export function useRecords() {
  const params = useSearchParams();
  const router = useRouter();
  const serial = params.toString();
  const currentParams = useRef(serial);
  useEffect(() => {
    currentParams.current = serial;
  }, [serial]);
  const filters = parseFilters(new URLSearchParams(serial));
  const queryParams = new URLSearchParams();
  for (const [field, fieldVal] of Object.entries(filters)) {
    for (const item of Array.isArray(fieldVal) ? fieldVal : [fieldVal]) {
      if (item) queryParams.append(field, item);
    }
  }
  const queryKey = queryParams.toString();
  const loader = useCallback((s: AbortSignal) => getView(queryKey, s), [queryKey]);
  const query = useQuery(queryKey, loader);
  const update = useCallback(
    (entries: Record<string, string | string[]>) => {
      const p = new URLSearchParams(currentParams.current);
      for (const [k, v] of Object.entries(entries)) {
        p.delete(k);
        for (const item of Array.isArray(v) ? v : [v]) if (item) p.append(k, item);
      }
      currentParams.current = p.toString();
      router.replace(`/?${p}`, { scroll: false });
    },
    [router],
  );
  return {
    ...query,
    filters,
    update,
    selected: params.get("node"),
    isTimeline: params.get("view") === "timeline",
    view:
      params.get("view") === "timeline"
        ? "timeline"
        : params.get("view") === "tree"
          ? "tree"
          : "board",
    presentation: params.get("presentation") === "1",
  };
}
export function useChildren(parentId: string | null, enabled: boolean) {
  const loader = useCallback((s: AbortSignal) => getChildren(parentId, s), [parentId]);
  return useQuery(parentId ?? "root", loader, enabled);
}
export function useDetail(id: string | null) {
  const loader = useCallback((s: AbortSignal) => getDetail(id!, s), [id]);
  return useQuery(id ?? "", loader, !!id);
}
export function useList(ids: string[]) {
  const queryKey = ids.join(",");
  const loader = useCallback(
    (s: AbortSignal) => getList(queryKey.split(",").filter(Boolean), s),
    [queryKey],
  );
  return useQuery(queryKey, loader);
}
