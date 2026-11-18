import type { AiModelsResponse } from "../schemas/assistant";
import { resolveSelectedModel } from "./context";

export interface ModelsLoaderState {
  catalog: AiModelsResponse | null;
  selectedModel: string | null;
  loading: boolean;
  error: string | null;
  attempted: boolean;
}

export interface CreateModelsLoaderOptions {
  fetcher: (signal?: AbortSignal) => Promise<AiModelsResponse>;
  readStored: () => string | null;
  writeStored: (modelId: string) => void;
  formatError: (error: unknown) => string;
}

export type ModelsLoaderListener = (state: ModelsLoaderState) => void;

export type ModelChipState =
  | { mode: "loading"; labelKey: "modelPicker.loading" }
  | { mode: "default_model"; labelKey: "modelPicker.defaultModel" }
  | { mode: "selected"; label: string };

/**
 * Resolve o estado visual do botão seletor de modelo no compositor.
 * Quando o catálogo falha ou não está carregado, exibe "Modelo padrão" sem spinner.
 */
export function getModelChipState(
  state: Pick<ModelsLoaderState, "loading" | "catalog" | "selectedModel">,
  fallbackLabel: string,
): ModelChipState {
  if (state.loading) {
    return { mode: "loading", labelKey: "modelPicker.loading" };
  }
  if (!state.catalog) {
    return { mode: "default_model", labelKey: "modelPicker.defaultModel" };
  }
  const active = state.catalog.models.find(
    (item) => item.id === state.selectedModel,
  );
  return {
    mode: "selected",
    label: active?.label ?? state.selectedModel ?? fallbackLabel,
  };
}

/**
 * Controla o carregamento único automático de /ai/models por montagem
 * e permite nova tentativa apenas por ação explícita do usuário.
 */
export function createModelsLoader({
  fetcher,
  readStored,
  writeStored,
  formatError,
}: CreateModelsLoaderOptions) {
  let state: ModelsLoaderState = {
    catalog: null,
    selectedModel: readStored(),
    loading: false,
    error: null,
    attempted: false,
  };
  let activeController: AbortController | null = null;
  const listeners = new Set<ModelsLoaderListener>();

  const emit = () => {
    const snapshot = { ...state };
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const runFetch = async (force: boolean): Promise<void> => {
    if (!force && (state.attempted || state.loading || state.catalog)) {
      return;
    }
    if (force) {
      activeController?.abort();
    } else if (activeController) {
      return;
    }

    const controller = new AbortController();
    activeController = controller;
    state = {
      ...state,
      attempted: true,
      loading: true,
      error: null,
    };
    emit();

    try {
      const catalog = await fetcher(controller.signal);
      if (controller.signal.aborted) return;
      const resolved = resolveSelectedModel(readStored(), catalog);
      state = {
        ...state,
        catalog,
        selectedModel: resolved || null,
        error: null,
      };
    } catch (error) {
      if (controller.signal.aborted) return;
      state = {
        ...state,
        error: formatError(error),
      };
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
      if (!controller.signal.aborted) {
        state = {
          ...state,
          loading: false,
        };
        emit();
      }
    }
  };

  return {
    getState: (): ModelsLoaderState => ({ ...state }),
    subscribe(listener: ModelsLoaderListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    autoLoad(): Promise<void> {
      return runFetch(false);
    },
    retry(): Promise<void> {
      return runFetch(true);
    },
    selectModel(modelId: string): void {
      state = {
        ...state,
        selectedModel: modelId,
      };
      writeStored(modelId);
      emit();
    },
    /**
     * Retorna o modelo a enviar em /chat; omite o campo se o catálogo não foi carregado.
     */
    getRequestModel(): string | null {
      return state.catalog ? state.selectedModel : null;
    },
    dispose(): void {
      activeController?.abort();
      activeController = null;
      listeners.clear();
    },
  };
}
