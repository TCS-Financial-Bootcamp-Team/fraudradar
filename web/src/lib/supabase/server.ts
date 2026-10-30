import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";
import { shouldKeepSignedIn, getSessionCookieOptions } from "./persistence";

export async function createSupabaseServerClient() {
  const config = getSupabaseConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(
              name,
              value,
              getSessionCookieOptions(
                options,
                shouldKeepSignedIn(cookieStore.getAll()),
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
