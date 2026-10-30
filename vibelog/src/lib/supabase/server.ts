import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { shouldKeepSignedIn, sessionCookieOptions } from "./persistence";
export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { name: "vibelog-auth" },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (entries) => {
          try {
            entries.forEach(({ name, value, options }) =>
              jar.set(
                name,
                value,
                sessionCookieOptions(options, shouldKeepSignedIn(jar.getAll()), value),
              ),
            );
          } catch {
            /* O proxy renova cookies em componentes de servidor. */
          }
        },
      },
    },
  );
}
