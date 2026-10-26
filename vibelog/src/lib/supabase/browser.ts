import { createBrowserClient } from "@supabase/ssr";
import { cookiesNavegador } from "./persistencia";
export const supabaseBrowser = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions: { name: "vibelog-auth" }, cookies: cookiesNavegador },
  );
