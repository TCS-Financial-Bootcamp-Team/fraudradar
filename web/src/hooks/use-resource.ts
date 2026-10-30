"use client";

import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/format";

export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{
    loader?: typeof loader;
    data?: T;
    error?: string;
    loading: boolean;
  }>({ loading: true });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loader(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ loader, data, loading: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            loader,
            error: getErrorMessage(error),
            loading: false,
          });
      });
    return () => controller.abort();
  }, [loader, version]);
  const reload = useCallback(() => {
    setState({ loading: true });
    setVersion((v) => v + 1);
  }, []);
  // Uma troca de filtro nunca exibe o resultado da consulta anterior.
  if (state.loader !== loader)
    return { data: undefined, error: undefined, loading: true, reload };
  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    reload,
  };
}
