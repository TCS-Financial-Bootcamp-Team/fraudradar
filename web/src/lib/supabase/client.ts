"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig, supabaseConfigMessage } from "./config";
import { browserCookies } from "./persistence";

export function createSupabaseBrowserClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error(supabaseConfigMessage());
  return createBrowserClient(config.url, config.key, {
    cookies: browserCookies,
  });
}
