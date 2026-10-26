import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { manterConectado, opcoesSessao } from "./persistencia";
export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { name: "vibelog-auth" },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, opcoesSessao(options, manterConectado(jar.getAll()), value)),
            );
          } catch {
            /* O proxy renova cookies em componentes de servidor. */
          }
        },
      },
    },
  );
}
