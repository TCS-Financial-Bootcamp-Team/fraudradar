export function configuracaoSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) return null;
  try {
    const endereco = new URL(url);
    if (!["http:", "https:"].includes(endereco.protocol)) return null;
    return { url, chave };
  } catch {
    return null;
  }
}

export const mensagemConfiguracao =
  "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em web/.env.local e reinicie o frontend. Use somente a chave pública do Supabase.";
