"use client";

import { createBrowserClient } from "@supabase/ssr";
import { configuracaoSupabase, mensagemConfiguracao } from "./config";
import { cookiesNavegador } from "./persistencia";

export function clienteSupabase() {
  const config = configuracaoSupabase();
  if (!config) throw new Error(mensagemConfiguracao);
  return createBrowserClient(config.url, config.chave, {
    cookies: cookiesNavegador,
  });
}
