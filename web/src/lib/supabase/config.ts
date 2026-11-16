import { getT } from "@/i18n/runtime";

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;
    return { url, key };
  } catch {
    return null;
  }
}

export const supabaseConfigMessage = () => getT("auth")("supabaseConfig");
