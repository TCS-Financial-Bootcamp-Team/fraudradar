import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { configuracaoSupabase } from "./config";
import { manterConectado, opcoesSessao } from "./persistencia";

export async function servidorSupabase() {
  const config = configuracaoSupabase();
  if (!config) return null;
  const armazenamento = await cookies();
  return createServerClient(config.url, config.chave, {
    cookies: {
      getAll: () => armazenamento.getAll(),
      setAll: (valores) => {
        try {
          valores.forEach(({ name, value, options }) =>
            armazenamento.set(
              name,
              value,
              opcoesSessao(
                options,
                manterConectado(armazenamento.getAll()),
                value,
              ),
            ),
          );
        } catch {
          /* Server Components só leem cookies; o proxy renova a sessão. */
        }
      },
    },
  });
}
