import ptAccounts from "../../messages/pt-BR/accounts.json";
import ptAlerts from "../../messages/pt-BR/alerts.json";
import ptAssistant from "../../messages/pt-BR/assistant.json";
import ptAuth from "../../messages/pt-BR/auth.json";
import ptCommon from "../../messages/pt-BR/common.json";
import ptDatasets from "../../messages/pt-BR/datasets.json";
import ptErrors from "../../messages/pt-BR/errors.json";
import ptHealth from "../../messages/pt-BR/health.json";
import ptIngestion from "../../messages/pt-BR/ingestion.json";
import ptJobs from "../../messages/pt-BR/jobs.json";
import ptModels from "../../messages/pt-BR/models.json";
import ptProcessing from "../../messages/pt-BR/processing.json";
import ptSettings from "../../messages/pt-BR/settings.json";
import ptShell from "../../messages/pt-BR/shell.json";
import enAccounts from "../../messages/en/accounts.json";
import enAlerts from "../../messages/en/alerts.json";
import enAssistant from "../../messages/en/assistant.json";
import enAuth from "../../messages/en/auth.json";
import enCommon from "../../messages/en/common.json";
import enDatasets from "../../messages/en/datasets.json";
import enErrors from "../../messages/en/errors.json";
import enHealth from "../../messages/en/health.json";
import enIngestion from "../../messages/en/ingestion.json";
import enJobs from "../../messages/en/jobs.json";
import enModels from "../../messages/en/models.json";
import enProcessing from "../../messages/en/processing.json";
import enSettings from "../../messages/en/settings.json";
import enShell from "../../messages/en/shell.json";
import type { AppLocale } from "./config";

// pt-BR é a fonte: o tipo das chaves sai daqui. `en` precisa ter o mesmo formato.
export const ptBR = {
  accounts: ptAccounts,
  alerts: ptAlerts,
  assistant: ptAssistant,
  auth: ptAuth,
  common: ptCommon,
  datasets: ptDatasets,
  errors: ptErrors,
  health: ptHealth,
  ingestion: ptIngestion,
  jobs: ptJobs,
  models: ptModels,
  processing: ptProcessing,
  settings: ptSettings,
  shell: ptShell,
};
export type AppMessages = typeof ptBR;

const en: AppMessages = {
  accounts: enAccounts,
  alerts: enAlerts,
  assistant: enAssistant,
  auth: enAuth,
  common: enCommon,
  datasets: enDatasets,
  errors: enErrors,
  health: enHealth,
  ingestion: enIngestion,
  jobs: enJobs,
  models: enModels,
  processing: enProcessing,
  settings: enSettings,
  shell: enShell,
};

export const catalogs: Record<AppLocale, AppMessages> = { "pt-BR": ptBR, en };
