import { createBrowserClient } from "@supabase/ssr";
import { browserCookies } from "./persistence";
export const supabaseBrowser = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions: { name: "vibelog-auth" }, cookies: browserCookies },
  );
