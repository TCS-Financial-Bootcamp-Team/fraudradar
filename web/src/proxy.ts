import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import {
  shouldKeepSignedIn,
  getSessionCookieOptions,
} from "@/lib/supabase/persistence";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  const pathname = request.nextUrl.pathname;
  const isPublicRoute = [
    "/login",
    "/signup",
    "/reset-password",
    "/auth/callback",
  ].includes(pathname);
  const redirectTo = (targetPath: string) => {
    const redirectResponse = NextResponse.redirect(
      new URL(targetPath, request.url),
    );
    response.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie));
    redirectResponse.headers.set("Cache-Control", "private, no-store");
    return redirectResponse;
  };
  if (!config) return isPublicRoute ? response : redirectTo("/login");
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(
            name,
            value,
            getSessionCookieOptions(
              options,
              shouldKeepSignedIn(request.cookies.getAll()),
              value,
            ),
          ),
        );
      },
    },
  });
  try {
    const { data, error } = await supabase.auth.getClaims();
    if ((!data?.claims || error) && !isPublicRoute) return redirectTo("/login");
    if (data?.claims && !error && ["/login", "/signup"].includes(pathname))
      return redirectTo("/dashboard");
  } catch {
    if (!isPublicRoute) return redirectTo("/login?error=session");
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
