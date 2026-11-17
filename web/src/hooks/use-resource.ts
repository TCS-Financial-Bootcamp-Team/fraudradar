"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/format";
import { notify } from "@/lib/notify";

export interface UseResourceOptions {
  /** Quando muda, descarta o dado anterior e volta ao carregamento inicial. */
  resetKey?: unknown;
}

export interface ResourceState<T> {
  data?: T;
  hasData: boolean;
  error?: string;
  settledLoader?: (signal: AbortSignal) => Promise<T>;
  settledVersion: number;
  settledResetKey: unknown;
}

export interface ResourceResult<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
}

/** Calcula o estado visível de `useResource` mantendo dados anteriores em revalidações. */
export function deriveResourceView<T>(
  state: ResourceState<T>,
  loader: (signal: AbortSignal) => Promise<T>,
  version: number,
  resetKey: unknown,
): Omit<ResourceResult<T>, "reload"> & { hasUsableData: boolean } {
  const keyChanged = !Object.is(state.settledResetKey, resetKey);
  const isInFlight =
    state.settledLoader !== loader ||
    state.settledVersion !== version ||
    keyChanged;
  const hasUsableData = state.hasData && !keyChanged;

  if (hasUsableData) {
    return {
      data: state.data,
      error: undefined,
      loading: false,
      refreshing: isInFlight,
      hasUsableData: true,
    };
  }

  return {
    data: undefined,
    error: isInFlight ? undefined : state.error,
    loading: isInFlight,
    refreshing: false,
    hasUsableData: false,
  };
}

export function useResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  options?: UseResourceOptions,
): ResourceResult<T> {
  const resetKey = options?.resetKey;
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<ResourceState<T>>(() => ({
    hasData: false,
    settledVersion: -1,
    settledResetKey: resetKey,
  }));

  const view = deriveResourceView(state, loader, version, resetKey);
  const hasUsableDataRef = useRef(view.hasUsableData);

  // Mantém a referência sincronizada após o commit para decidir o tratamento de erro
  // fora do updater de `setState` (evita notificação duplicada em StrictMode).
  useEffect(() => {
    hasUsableDataRef.current = view.hasUsableData;
  });

  useEffect(() => {
    const controller = new AbortController();
    loader(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({
          data,
          hasData: true,
          error: undefined,
          settledLoader: loader,
          settledVersion: version,
          settledResetKey: resetKey,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = getErrorMessage(error);
        if (hasUsableDataRef.current) {
          notify.error(message);
          setState((prev) => ({
            data: Object.is(prev.settledResetKey, resetKey) ? prev.data : undefined,
            hasData: Object.is(prev.settledResetKey, resetKey) && prev.hasData,
            error: undefined,
            settledLoader: loader,
            settledVersion: version,
            settledResetKey: resetKey,
          }));
          return;
        }
        setState({
          data: undefined,
          hasData: false,
          error: message,
          settledLoader: loader,
          settledVersion: version,
          settledResetKey: resetKey,
        });
      });
    return () => controller.abort();
  }, [loader, version, resetKey]);

  const reload = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  return {
    data: view.data,
    error: view.error,
    loading: view.loading,
    refreshing: view.refreshing,
    reload,
  };
}
