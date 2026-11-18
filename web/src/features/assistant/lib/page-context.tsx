"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import type { PageState } from "../schemas/assistant";

export interface PublishedPageContext {
  pageState: PageState;
  visibleCount?: number;
}

interface PageContextStoreValue {
  published: PublishedPageContext | null;
  publish: (owner: string, value: PublishedPageContext) => void;
  clear: (owner: string) => void;
}

const PageContext = createContext<PageContextStoreValue>({
  published: null,
  publish: () => {},
  clear: () => {},
});

/**
 * Armazena o estado publicado pela página ativa para compartilhamento opcional com o assistente.
 */
export function PageContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [entry, setEntry] = useState<{
    owner: string;
    value: PublishedPageContext;
  } | null>(null);

  const publish = useCallback((owner: string, value: PublishedPageContext) => {
    setEntry({ owner, value });
  }, []);

  const clear = useCallback((owner: string) => {
    setEntry((current) => (current?.owner === owner ? null : current));
  }, []);

  const value = useMemo<PageContextStoreValue>(
    () => ({
      published: entry?.value ?? null,
      publish,
      clear,
    }),
    [entry, publish, clear],
  );

  return (
    <PageContext.Provider value={value}>{children}</PageContext.Provider>
  );
}

/**
 * Lê o contexto atualmente publicado pela página ativa.
 */
export function usePublishedPageContext(): PublishedPageContext | null {
  return useContext(PageContext).published;
}

/**
 * Publica o estado visível da página enquanto ela estiver montada e limpa ao desmontar.
 */
export function usePublishPageContext(value: PublishedPageContext | null) {
  const { publish, clear } = useContext(PageContext);
  const ownerId = useId();

  useEffect(() => {
    if (value) {
      publish(ownerId, value);
    } else {
      clear(ownerId);
    }
  }, [ownerId, value, publish, clear]);

  useEffect(() => {
    return () => {
      clear(ownerId);
    };
  }, [ownerId, clear]);
}
