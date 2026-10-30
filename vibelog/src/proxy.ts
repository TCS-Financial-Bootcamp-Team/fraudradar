import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { shouldKeepSignedIn, sessionCookieOptions } from "@/lib/supabase/persistence";
export async function proxy(req: NextRequest) {
  let response = NextResponse.next({ request: req });
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { name: "vibelog-auth" },
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (entries) => {
          entries.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          entries.forEach(({ name, value, options }) =>
            response.cookies.set(
              name,
              value,
              sessionCookieOptions(options, shouldKeepSignedIn(req.cookies.getAll()), value),
            ),
          );
        },
      },
    },
  );
  const { data, error } = await sb.auth.getClaims();
  const authenticated = !!data?.claims && !error;
  const isPublic = ["/login", "/signup"].includes(req.nextUrl.pathname);
  const redirectPath =
    authenticated && isPublic
      ? "/"
      : !authenticated && !isPublic && !req.nextUrl.pathname.startsWith("/api/")
        ? "/login"
        : null;
  if (redirectPath) {
    const redirect = NextResponse.redirect(new URL(redirectPath, req.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    response = redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
