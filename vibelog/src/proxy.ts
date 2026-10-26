import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { manterConectado, opcoesSessao } from "@/lib/supabase/persistencia";
export async function proxy(req: NextRequest) {
  let response = NextResponse.next({ request: req });
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { name: "vibelog-auth" },
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(
              name,
              value,
              opcoesSessao(options, manterConectado(req.cookies.getAll()), value),
            ),
          );
        },
      },
    },
  );
  const { data, error } = await sb.auth.getClaims();
  const autenticado = !!data?.claims && !error;
  const publica = ["/login", "/cadastro"].includes(req.nextUrl.pathname);
  const destino =
    autenticado && publica
      ? "/"
      : !autenticado && !publica && !req.nextUrl.pathname.startsWith("/api/")
        ? "/login"
        : null;
  if (destino) {
    const redirect = NextResponse.redirect(new URL(destino, req.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    response = redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
