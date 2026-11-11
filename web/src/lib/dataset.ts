export const DEFAULT_DATASET = "saml-d";
export const DATASET_STORAGE_KEY = "fraudradar.dataset";

const SLUG_PATTERN = /^[a-z0-9-]{1,40}$/;
let currentDataset = DEFAULT_DATASET;

function validSlug(value: string | null): value is string {
  return value !== null && SLUG_PATTERN.test(value);
}

export function readStoredDataset() {
  if (typeof window === "undefined") return currentDataset;
  try {
    const stored = window.localStorage.getItem(DATASET_STORAGE_KEY);
    if (validSlug(stored)) currentDataset = stored;
  } catch {
    // Navegação privada ou política do navegador pode bloquear o localStorage.
  }
  return currentDataset;
}

export function getCurrentDataset() {
  return currentDataset;
}

export function selectDataset(slug: string) {
  currentDataset = validSlug(slug) ? slug : DEFAULT_DATASET;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(DATASET_STORAGE_KEY, currentDataset);
    } catch {
      // A seleção continua válida na aba mesmo sem persistência local.
    }
  }
  return currentDataset;
}
