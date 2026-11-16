import type { AppMessages } from "./messages";

// Os schemas zod ficam fora do React e não sabem o idioma. Eles guardam a CHAVE da mensagem
// (`v("passwordMin")`); quem mostra o erro traduz com `useValidationText` (ou `translateValidation`).
const PREFIX = "validation:";

export type ValidationKey = keyof AppMessages["errors"]["validation"];

export const v = (key: ValidationKey) => `${PREFIX}${key}`;

export const isValidationMessage = (message: string) =>
  message.startsWith(PREFIX);

export const validationKey = (message: string) =>
  message.slice(PREFIX.length) as ValidationKey;
